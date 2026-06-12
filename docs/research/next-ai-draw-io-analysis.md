# next-ai-draw-io 架构分析与 VOICE CANVAS 优化建议

> 仓库: https://github.com/DayuanJiang/next-ai-draw-io
> 分析时间: 2026-06-12
> 分析对象 v0.4.16, 主要文件: `app/api/chat/route.ts` (869 行), `contexts/diagram-context.tsx` (419 行), `hooks/use-diagram-tool-handlers.ts` (580 行), `lib/system-prompts.ts` (410 行), `components/chat-panel.tsx` (1465 行), `components/chat-message-display.tsx`

---

## 一、它在做什么

把"对话"转成"draw.io 图"。用户用自然语言说"画一个 RAG 架构图",LLM 输出 mxCell XML,前端把 XML 灌进 draw.io 嵌入式 iframe(`react-drawio` 库),iframe 渲染图形。**关键不是它实现了一个画布,而是它没实现 — 直接复用 draw.io 的成熟渲染引擎,自己只做"对话 ↔ XML"的桥**。

这一步选型决定了后面所有架构。下文按数据流的方向展开。

---

## 二、整条数据流(从用户敲键盘到画布出图)

### 阶段 0 · 上下文绑定

`contexts/diagram-context.tsx` 通过 React Context 把以下能力暴露给整棵组件树:

```
chartXML            -- 当前画布完整 XML (单一可信来源)
diagramHistory      -- 每次 LLM 编辑前的快照 [{svg, xml}]
loadDiagram(xml)    -- 灌 XML 进 iframe + 自动校验/修复
captureValidationPng() -- 把当前画布导出 PNG (用于多模态截图回路)
getThumbnailSvg()      -- 导 SVG 缩略图 (会话存档)
drawioRef           -- 直接拿到 react-drawio 的 imperative API
```

**关键点 1**: `chartXML` 双写 — 既存 useState(给 UI 重渲染),又存 `chartXMLRef`(给 RAF/异步回调用,避开闭包陈旧)。
**关键点 2**: 截图通过 `drawioRef.current.exportDiagram({ format: "png" })` 异步触发,iframe 把结果通过 `onExport` 事件回传,主进程用 `pngResolverRef` 把回调 resolver 挂着等结果(本质是把 iframe 的事件流封装成 Promise)。这一步对你接"截图反馈给多模态"至关重要 —— 它就是这么做的。

### 阶段 1 · 用户提问

`components/chat-panel.tsx` 用 Vercel AI SDK 的 `useChat`:

```ts
const { messages, sendMessage, addToolOutput, status } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
  onToolCall: async ({ toolCall }) => {
    await handleToolCall({ toolCall }, addToolOutput);  // 关键 hook
  },
  sendAutomaticallyWhen: ({ messages }) => {
    // 工具调用失败 → 自动重发 → 让 LLM 自己修
    return hasToolErrors(messages) && retryCount < 3;
  },
});
```

用户输入 → `sendMessage({ role: 'user', parts: [...] })`,前端把 `chartXML` 也带上,POST 到 `/api/chat`。

### 阶段 2 · 后端编排(`app/api/chat/route.ts`)

收到请求后,后端构造**两段 system message**(开了 prompt cache 的模型才会拆两段):

```
system 1: 长指令(铁壁规则 + 工具说明)        ← cache breakpoint
system 2: Previous diagram XML + Current XML  ← cache breakpoint
user:     "画一个 RAG 架构图" + 上传的图片
```

然后调 `streamText({ model, messages, tools, stopWhen: stepCountIs(5) })`。**`stepCountIs(5)` 表示一次对话允许多步工具调用**(LLM 可以先 `get_shape_library` 查 AWS 图标,再 `display_diagram` 出图)。

### 阶段 3 · 工具集设计(★ 最关键)

总共 4 个工具,前 3 个是**画布操作**,最后一个是**资料查询**:

| 工具 | 入参 | 谁执行 | 用途 |
|---|---|---|---|
| `display_diagram` | `{ xml: string }` | 客户端(浏览器) | 全量重画 — 创建新图或大改 |
| `edit_diagram` | `{ operations: [{op, cell_id, new_xml}] }` | 客户端 | 增量编辑 — 改一个节点不重画整张 |
| `append_diagram` | `{ xml: string }` | 客户端 | 续传 — 上次输出超长被截断时拼接 |
| `get_shape_library` | `{ library: string }` | 服务端 | 服务端读 `docs/shape-libraries/*.md` 给 LLM 看 |

> **为什么这样切?** 想象 LLM 一次输出 2000 行 XML,token 用光被截断 → `append_diagram` 救场。用户改一个文字 → `edit_diagram` 只发 50 字节而不是重发整张图。再加上 prompt cache,**长对话的成本和首次差不多**。

**提示词的核心约束**(`lib/system-prompts.ts`):

```
- 只输出 mxCell 元素,不要包 <mxfile>/<mxGraphModel>/<root> (前端自动包)
- ID 从 "2" 开始,parent="1" 是顶层
- 不要写 XML 注释,draw.io 会丢弃,导致 edit_diagram 的 search 模式失配
- 边规则: exitX/exitY/entryX/entryY 必填、双向连接走对侧、绕开中间节点用 waypoint
- 屏幕约束: x∈[0,800], y∈[0,600],不要超出一屏
```

这 7 条边规则是它图比别家"看起来不乱"的关键 — 直接把视觉对齐规则写进系统提示词,让模型在生成时就避开常见审美坑。

### 阶段 4 · 流式渲染(★ 第二关键)

LLM 在吐 JSON tool input 时,Vercel AI SDK 的 `tool-input-delta` 会把每一帧 partial 推给前端。`chat-message-display.tsx` 监听这个流:

```ts
if (state === 'input-streaming' && input?.xml) {
  pendingXmlRef.current = input.xml;       // 当前帧的半成品 XML

  // 80ms 防抖, 避免每帧都重画 iframe
  if (!debounceTimeoutRef.current) {
    debounceTimeoutRef.current = setTimeout(() => {
      handleDisplayChart(pendingXmlRef.current, false);  // false = 流式中,不弹错误 toast
    }, STREAMING_DEBOUNCE_MS);
  }
}
```

`handleDisplayChart` 关键步骤:

```ts
const completeCells = extractCompleteMxCells(rawXml);  // 只取已闭合的 mxCell, 半成品丢掉
if (!completeCells) return;                             // 一个都没闭合 → 跳过这帧
const wrapped = replaceNodes(baseXML, completeCells);   // 塞进 mxfile 骨架
onDisplayChart(wrapped, true);                          // 灌 iframe
```

**精髓**: LLM 输出 `<mxCell id="2".../>...<mxCell id="3" sty` 时,后一个 mxCell 还没闭合 — 直接给 draw.io 会解析失败。`extractCompleteMxCells` 用正则只捞**完整闭合的元素**,前面 N 个先画上,第 N+1 个等下一帧再说。**用户视觉上看到节点一个一个冒出来**(就像打字机效果,但是视觉化的)。

### 阶段 5 · 工具回调与重试(`hooks/use-diagram-tool-handlers.ts`)

LLM 流式吐完 → AI SDK 触发 `onToolCall` → 跑 `handleDisplayDiagram`:

```ts
1. 检测截断: isMxCellXmlComplete(xml) === false
   → addToolOutput({ state: 'output-error', errorText: '用 append_diagram 续' })
   → useChat.sendAutomaticallyWhen 返回 true → 自动 resend → LLM 看到错误自己续
2. 验证 XML: validateAndFixXml(xml) 试图自动修小错(缺闭合标签等)
3. 灌画布: loadDiagram(fullXml)
4. (可选) VLM 视觉验证:
   - captureValidationPng() 抓画布 PNG
   - 调 /api/validate-diagram 把 PNG 发给视觉模型 ("画的对吗?")
   - 验证失败 → addToolOutput 返回视觉反馈 → LLM 看到反馈自己改
   - 重试上限 3 次, 超过就接受
```

**关键点**: 整个重试链路完全是**模型 in the loop**,前端只负责传话和切换状态。模型自己读自己的错误,自己改自己的 XML,无论是结构错误还是视觉错误。**这就是你想要的"截图反馈给多模态做微调"的做法,而且已经被验证可以工作。**

### 阶段 6 · 历史与回滚

每次 LLM 修改前,`diagramHistory` 自动存 `{svg, xml}` 快照(SVG 用于 UI 缩略图列表)。用户点历史 → 直接 `loadDiagram(history[i].xml)` 还原。轻量但够用 — 不需要 redo,不需要 diff,因为整张 XML 就是状态。

---

## 三、关键工程细节(易忽略但很值钱)

### 1. JSON 修复
LLM 输出 token 上限被截断 → tool input 是半截 JSON → AI SDK 会丢。route.ts 用 `experimental_repairToolCall` + `jsonrepair` 库尝试补全,补不出来就给个空 operations 数组让流程不挂。**鲁棒性的来源**。

### 2. Prompt Caching 双断点
对支持 caching 的模型(Claude/Bedrock),把 system message 拆两段:第一段长指令 + 自定义 Instructions(基本不变),第二段当前 XML(每轮变)。**长对话第二轮起省 60-90% input token**。

### 3. 多 Provider 抽象
`lib/ai-providers.ts` 用 Vercel AI SDK 9 个 provider 包(`@ai-sdk/openai`、`anthropic`、`google`、`bedrock`、`azure`、`deepseek`、`vertex`、`openrouter`、`gateway` + ollama),走客户端 header 注入(`x-ai-provider`/`x-ai-api-key`/`x-ai-base-url`)。BYOK 模式 — 用户自己填 key。

### 4. SSRF 保护
`lib/ssrf-protection.ts` 防止用户通过 base-url 请求内网。这是个细节,但对要发布的项目必备。

### 5. Cached Responses
`lib/cached-responses.ts` 维护一份"常见请求 → 预制 XML"的本地缓存(比如 README 里的 4 个示例),首次访问命中直接返回,**不调 LLM**。展示页冷启动用。

---

## 四、对你的项目(VOICE CANVAS)有什么启发

### 4.1 当前 VOICE CANVAS 的链路特点

你现在的 schema(`drawToolSchema`)是**三个 tool 的判别联合**:`ATOMIC_SHAPE` / `DIFFUSION_MELT` / `WEB_SEARCH`,出图通过 partial 流式增量调度,canvas 用 LERP 缓动从一个状态过渡到下一个。这套架构的强项:**单图元的物理感**(粒子样式生长、流体渐入、shader 调色)。

它和 next-ai-draw-io 的根本差异:

| 维度 | next-ai-draw-io | VOICE CANVAS |
|---|---|---|
| 渲染目标 | 信息图(节点+边) | 艺术化图元(单形体粒子化) |
| 状态载体 | mxCell XML 整图 | `CanvasInstruction` 单帧指令 |
| 输入通道 | 文本 + 图片/PDF | 语音(VAD 断句) |
| LLM 输出形态 | 工具调用 + 完整 XML | 单个 tool 入参的 partial |
| 历史 | 每次编辑前快照 | 无(只有当前一帧) |
| 编辑粒度 | display / edit / append | 仅 create(没有 modify/delete 的实际处理) |

你不是要把 next-ai-draw-io 抄过来,你是在做**完全不同的产品形态**(语音驱动的艺术画布 vs 鼠标驱动的信息画板)。但它的几个机制对你绝对有用 ↓

### 4.2 可以直接借鉴的 7 个机制

**(1) 三工具切分 — 全量/增量/续传**
你现在 `useDrawSimulator` 模拟的是"create" 路径。但用户说"再大一点"、"换个颜色"、"删掉" 这些场景你没建模。建议把 schema 扩到:
- `CREATE_SHAPE` — 现有的 ATOMIC_SHAPE create 路径
- `MODIFY_SHAPE` — 改 size/position/color 一个层(类似 edit_diagram)
- `DELETE_SHAPE` — 按 id 删

把"修改/删除"拉到 schema 层之后,LLM 就能用这些 tool 微调当前画布,而不是每句话都重画。

**(2) 截图回路是已经被验证的方案**
你说的"多模态截图反馈微调"在 next-ai-draw-io 里就是 VLM validation。具体做法:
```
画布渲染完 → canvas.toDataURL('image/png') → 发给视觉模型(带原话 + 当前 XML/指令)
→ 视觉模型返回 { valid: bool, issues: [...] }
→ 如果 invalid, 把 issues 作为 tool error 喂给 LLM, 触发自动重画
```
你已有 `VectorStage` 的 canvas ref,加 `toDataURL` 五行代码就能起。然后做一个 `/api/validate-canvas` 端点,系统提示词类似:"用户原话: X,当前画的是 Y,符合吗?如果不符合,具体哪里不对?"

**(3) 流式 partial 的"只取闭合元素"原则**
你现在 `dispatchPartialTool` 的判断是"全字段到齐才渲染"。这其实没错,但如果以后扩到多图元,要学 next-ai-draw-io 的 `extractCompleteMxCells` —— **每帧只渲染已经完整的子集,半成品丢弃,等下一帧**。这样多图元增量补全时不会卡住。

**(4) 自动重试链路**
`useChat` 的 `sendAutomaticallyWhen` 是个被严重低估的 API。你现在 simulator 的失败处理是 `buildFallbackInstruction` 兜底默认圆。但实际接真 LLM 后,会有 JSON 解析失败、字段缺失、值不合法等错误。**模型自己改自己的输出**比你写一堆兜底代码强 — 把错误信息原文返回,设最大重试 3 次,模型基本能修。

**(5) 历史快照 — 即使艺术画布也需要**
你的画布现在没"撤销"。语音场景下用户说错一句话可能毁掉一个状态。建议:每次 `simulator.run` 之前 `pushHistory({ instruction, timestamp })`,做一个浮动按钮"返回上一状态"。状态简单到只有 instruction 一个对象,实现成本极低。

**(6) Prompt Caching 你也用得上**
你现在 `buildIronWallPrompt(activeStyle)` 每次都重生成。如果迁到支持 caching 的模型(Claude/Bedrock/Gemini 1.5+),把这段拆成"长不变规则"+"当前风格 token"两段,可以省巨量 token。yunwu 网关如果支持就直接用。

**(7) `stopWhen: stepCountIs(N)` 的多步工具链**
当前你只允许 LLM 调一次 tool。但用户说"画三个圆,大小递增,排成一行" —— 这是三次 CREATE_SHAPE 调用。`stepCountIs(3)` 让 LLM 在一次回复里多次调用 tool,每次 tool 调用都流式过来,前端依次渲染。**这是从"一句话画一个" 升级到 "一句话画一组"的关键开关**。

### 4.3 不建议借鉴的部分

- **draw.io iframe 本身不要用**。你做的是艺术画布,不是信息图,网格化的 mxCell 模型套不上。继续用你的 canvas + shader 思路。
- **draw.io 的 9 个 Provider 全套抽象不要抄**。你已经有自己的 Provider Registry,够用。
- **它的 i18n / Electron / Cloudflare 部署 / DynamoDB 配额这些**都是规模化产品的事,现在不要碰。

---

## 五、推荐的优化路线(按收益排序)

(下半部见 part 2 文件)
