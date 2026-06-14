# VOICE CANVAS

<p align="center"><strong>Speak. Style. Generate. —— 语音驱动 AI 图表生成系统</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/next.js-15.1-black?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/react-19-06b6d4?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/tailwind-css-06b6d4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <a href="https://github.com/features/actions"><img src="https://img.shields.io/badge/CI-passing-brightgreen?logo=githubactions&logoColor=white" alt="CI"></a>
</p>

---

## 项目概述

VOICE CANVAS 是一个**语音驱动、AI 实时生成矢量图表与图像的智能创作平台**。用户通过自然语言说话即可操控 AI 完成流程图、架构图、信息图的绘制，支持风格切换、图像生成、多轮对话编辑和主题定制。

核心数据流：**语音输入 → 实时 ASR 识别 → LLM 流式决策 → 三通道命令分发 → SVG/图像渲染 → TTS 语音反馈**。全过程支持流式传输，用户可在不到 1 秒内看到 AI 开始动笔。

---

## 一、技术选型依据

### 1.1 为什么选 Next.js 15 + React 19？

| 考量维度 | 决策理由 |
|---------|---------|
| **单一全栈仓库** | 前后端共用一个 TypeScript 项目，API Route 与 UI 组件零上下文切换，类型定义 `src/shared/types/` 前后端共享 |
| **App Router** | RSC（React Server Component）天然支持流式响应，`route.ts` 直接返回 `ReadableStream`，无需额外中间件 |
| **`output: standalone`** | 构建产物自包含，Docker 三阶段构建（deps → build → runner）镜像体积 < 200MB |
| **生态成熟度** | Vercel 生态 + React 社区最活跃的框架，第三方 AI SDK 支持最好 |

**备选方案与淘汰原因：**
- **Express/Fastify + Vite**：需要自己处理 SSR/路由/构建，增加工程复杂度，而 Next.js 开箱即用
- **Nuxt**：Vue 生态的 AI SDK 支持不如 React 成熟，Vercel AI SDK 的核心目标平台就是 React/Next.js

### 1.2 为什么选 Vercel AI SDK v6？

| 考量维度 | 决策理由 |
|---------|---------|
| **`streamText` + `tools` 原生支持** | 不需要自实现 SSE/WebSocket 协议来传输 LLM 工具调用，SDK 原生支持流式 tool call delta |
| **多 Provider 统一抽象** | OpenAI / Anthropic / Google / DeepSeek 四家 SDK 协议差异被 `@ai-sdk/*` 统一抹平，Provider 只封装端点 + Key，Model 作为运行时参数透传 |
| **`tool-input-delta` 增量事件** | 从 `fullStream` 提取 `tool-input-delta` 拼装 partial JSON 文本流，前端 `useDrawStream` 零改动即可拿到流式中间态 |
| **`tool_choice='auto'`** | `streamObject` 强制 `tool_choice='required'` 与 DeepSeek/Qwen thinking mode 不兼容（返回 400），`streamText` 用 system prompt 强指令替代强制 tool_choice |

**备选方案与淘汰原因：**
- **各家官方 SDK 直调**（如 openai npm / @anthropic/sdk）：每接入一个模型就要写一套消息格式适配 + 流式解析 + 工具调用协议转换，后期切换到 Vercel AI SDK（参考 [next-ai-draw-io](https://github.com/dayuanjiang/next-ai-draw-io) 的实现后确认为工业级方案）
- **LangChain**：抽象层太厚，流式工具调用的中间态获取困难，对 TypeScript 支持不如 Python

### 1.3 为什么选 TypeScript strict + Zod？

| 考量维度 | 决策理由 |
|---------|---------|
| **LLM 输出不可信** | LLM 可能输出任意结构的 JSON，Zod 在流式边界做 discriminated union 校验，非法命令静默跳过不崩溃 |
| **`strict: true` + `noUncheckedIndexedAccess`** | 所有数组/Map 访问强制 undefined 检查，流式 partial-JSON 中字段渐进补全的场景下防止 `Cannot read properties of undefined` |
| **类型推导** | `z.infer<typeof schema>` 一处定义、类型自动生成，31 个工具的类型声明零手工维护 |

### 1.4 为什么选 Tailwind CSS？

- **原子化 CSS**：组件样式内联在 JSX 中，不产生独立 CSS 文件的命名冲突和维护成本
- **主题 Token 化**：通过 `marketStyles.ts` 定义 UI Token（`panelBg` / `textPrimary` 等），Tailwind 负责落地，不需要 CSS-in-JS 运行时
- **构建时优化**：生产构建 Tree-Shaking 删除未使用样式，最终 CSS < 10KB

### 1.5 为什么选 better-sqlite3？

| 考量维度 | 决策理由 |
|---------|---------|
| **同步 API + WAL 模式** | Next.js API Route 不需要连接池，单连接 WAL 模式读写并发足够，零异步等待心智负担 |
| **零部署依赖** | SQLite 内嵌在 Node.js addon 中，不需要额外安装/运维 Postgres/MySQL 服务 |
| **单机够用** | 会话历史场景写入频率低（每秒 < 10 次），单表 < 10 万行，SQLite 完全胜任 |

### 1.6 为什么选 DOMPurify？

- **SVG 白名单过滤**：LLM 输出的 SVG 可能包含 `<script>`、`on*` 事件属性、`javascript:` URL 等 XSS 攻击向量。DOMPurify 提供 SVG Profile 白名单模式，仅放行安全的 49 个 SVG 标签 + 65 个安全属性
- **服务端可用**：DOMPurify 支持 Node.js 环境（用 jsdom），防御深度覆盖到 API 层

### 1.7 为什么自研 SVG 渲染引擎？

**原方案 `react-drawio` iframe 嵌入**的问题：
1. iframe 跨文档通信延迟高，DiagramContext 状态同步需要 postMessage
2. 无法控制内部渲染细节（字体/颜色/动效）
3. 每次加载 ~2MB drawio JS bundle
4. 用户明确反馈"不喜欢 iframe 这种方式"

**自研方案的边界：**
- 只做**只读渲染**（不做编辑器），6 种形状（rect / rounded-rect / ellipse / rhombus / cylinder / image）+ 直线/直角边 + 文字 + 图像
- 用 regex 解析 mxCell XML（不依赖 DOMParser，保持测试在 node 环境可跑）
- 节点中心连线（简化 mxgraph 的 exitX/exitY 端口路由算法）
- 4 个文件 829 行，净增 666 行代码

**为什么不引入 React Flow / tldraw？**
- schema 不一致，需要双向适配器，转换成本高
- 用户当前不需要编辑器交互，只需要渲染与展示

### 1.8 为什么选 WebSocket 直连阿里云 NLS？

| 方案 | 延迟 | 部署复杂度 | 选择 |
|------|------|-----------|------|
| **A 浏览器直连阿里云 WS Gateway** | ~250ms 首字延迟 | 后端只签发 Token | ✅ 选择 |
| B SSE 中继 | 双跳 RTT + 服务端长连接压力 | 中 | ❌ |
| C 自管 WebSocket Server | Next.js 不原生支持 | 高 | ❌ |

浏览器直连方案：后端 `/api/asr-token` 用 `@alicloud/pop-core` CreateToken RPC 签发短期 token，浏览器手写阿里云 WS 协议（token 走 URL query，WebSocket 不能设自定义 header）。

---

## 二、开发过程遇到的核心问题与解决方案

### 2.1 ASR 实时语音识别：从"噪音"到 250ms 首字延迟

**问题**：最初用 `ScriptProcessorNode` 录制 PCM，阿里云 NLS 识别结果完全为空。诊断脚本生成 WAV 文件让用户播放，用户反馈"听不到，是噪音，不连续的"。

**根因**：`ScriptProcessorNode` 在主线程运行已被浏览器 deprecate，会随机丢帧，导致 PCM 数据不连续。

**解决方案**：
1. **AudioWorklet 替代 ScriptProcessor**：跑独立 audio thread，不受主线程 throttle 影响
2. **AudioContext 强制 `sampleRate: 16000`**：源头出 16kHz 单声道，不再降采样
3. **启用三件套降噪**：`echoCancellation` / `noiseSuppression` / `autoGainControl`
4. **不连 `destination`**：避免扬声器回声
5. **前置缓冲 4 帧**：防止开口头部丢字
6. **VAD 改 push 模式**：`onUtteranceStart` → `onAudioFrame` → `onUtteranceEnd`

**依据**：Web Audio API 规范明确 AudioWorklet 是 ScriptProcessor 的替代品，运行在独立渲染线程；阿里云 NLS WebSocket 协议文档要求 16kHz 16bit 单声道 PCM。

### 2.2 LLM 多模型兼容：`streamObject` 的 `tool_choice='required'` 陷阱

**问题**：早期用 `streamObject` 强制 `tool_choice='required'`，换到 DeepSeek / Qwen 的 thinking mode 模型后直接返回 HTTP 400。每换模型必崩。

**根因**：部分模型的 thinking mode（如 DeepSeek-R1、Qwen3-Thinking）要求模型先输出思考链再输出工具调用，强制 `tool_choice='required'` 跳过了思考步骤，与模型预训练行为冲突。

**解决方案**：
- 改用 `streamText` + `tools`（默认 `tool_choice='auto'`）
- System prompt 铁壁防御模式："每个回复必须 call emit_canvas_commands tool，不解释不致歉不前缀"
- 从 `fullStream` 提取 `tool-input-delta` 组装 partial JSON 文本流

**依据**：Vercel AI SDK v6 文档推荐 `streamText` + tools 作为标准工具调用路径；OpenAI/Anthropic API 文档均建议非必须场景使用 `tool_choice='auto'`。

### 2.3 流式 Partial-JSON 的"字段渐进补全"bug

**问题**：PR #45 注入 chartXML 到 LLM 上下文后，用户立刻反馈 `Cannot read properties of undefined (reading 'replace')`。此 bug 一直存在，只是 LLM 之前看不到 chartXML，所有编辑都被翻译成 `display_diagram` 整张重画，走不到 `edit_diagram` 路径，故未显形。

**根因**：流式中 `partial-json` 逐帧解析时，`edit_diagram` 命令的 `operations` 数组中的 `cell_id` 字段可能还没出现（JSON 还在渐进传输中），dispatcher 拿 `undefined` 进 `escapeRegex` 调用 `.replace()` 直接爆炸。

**解决方案 — 双层守卫**：
1. **Orchestrator 层 `isCommandComplete` 深校验**（`useCanvasOrchestrator.ts:591`）：每条 operation 必须 operation/cell_id/new_xml 三字段齐全 + new_xml 必须等 mxCell 闭合
2. **Dispatcher 层入口防御**（`drawio-dispatcher.ts`）：`cell_id` 缺失或空白则 xml 原样回灌，不抛异常
3. 复用 `isMxCellXmlComplete` 跟 `display_diagram` 一致：等完整的 mxCell XML 闭合再分发

**依据**：流式系统的基本法则——partial-json 解析不能假设字段齐全，任何后续操作（regex / DOM / 网络）都要做 `undefined` 防御。双层守卫不是过度工程，是流式系统的标配。

### 2.4 自研 SVG 引擎：从 mxCell XML 到可渲染 SVG

**问题**：用户不喜欢 `react-drawio` iframe 嵌入方式，需要一个"最小可用"的 drawio 渲染器。但 mxCell XML 是 drawio 的私有格式，没有现成的纯 SVG 渲染库。

**核心挑战**：
1. mxCell 的 `<mxGeometry>` 使用相对坐标（相对于 parent），需要递归计算绝对坐标
2. mxCell style 是分号分隔的 key=value 字符串，需要解析 60+ 样式属性
3. 连线使用 mxgraph 的 exitX/exitY 端口路由算法，实现复杂度高
4. 样式值可能包含 XSS 攻击向量（`javascript:` URL、`<script>` 注入）

**解决方案**：
1. **Regex 解析替代 DOMParser**：保持测试在 Node 环境运行（`vitest` 默认 node env），不切 `jsdom`
2. **6 形状识别**：从 mxCell style 的 `shape=` 属性判断形状类型，映射到 SVG 元素
3. **节点中心连线**：用源底部中心 → 目标顶部中心简化 exitX/exitY 端口路由，视觉效果对流程图/架构图够用
4. **XSS 防御**：`sanitizeSvg.ts` DOMPurify SVG profile 白名单，禁止 `<script>`/`<foreignObject>`/`<iframe>` + 16 个 `on*` 事件属性 + `javascript:` URL
5. **mxCell style 解析**：分号 split → key=value split → Map 索引，纯函数无副作用

**依据**：OWASP XSS Prevention Cheat Sheet 推荐白名单过滤；regex 解析 XML 虽然不如 DOM 解析严谨，但对受控格式（drawio 生成的 mxCell）足够稳定。

### 2.5 多轮对话的"AI 失忆"问题

**问题**：用户说"切到刚才那个风格"，AI 无法理解"刚才"指的是什么。`useCanvasOrchestrator` 已维护完整 `ConversationTurn[]`（用户原话 + LLM narration + actions），但**只是 UI 状态**。每次调 `/api/generate-draw` 时只发当前 utterance，LLM 是无记忆的。

**根因**：前端存了历史，但没发给 LLM。

**解决方案**：
- 最近 5 轮 user+assistant 配对拍成 `messages`（仅发 narration 不发 actions，省 token）
- `ai-sdk streamText` 原生支持 `messages` 参数，有 history 时用 `messages` 替代 `prompt`
- 跳过 narration 为空的 turn（流式中或失败的不进上下文，防脏数据）

**依据**：token 经济性第一——`narration` 已包含本轮摘要（"已画三层架构"），不需要把完整的 commands JSON 发给 LLM。5 轮经验值，覆盖绝大多数指代消解场景。

### 2.6 TTS 30 秒静默挂死

**问题**：切换 LLM provider 后 TTS 全部 canceled，服务端 30 秒静默不返回。两次错误推断（key 不对 / yunwu 不能用阿里云端点）都被用户当场证伪。

**真根因**：代码用了阿里云 **Python SDK 的常量** `pcm_24000hz_mono_16bit`，但 WebSocket 协议只接受 4 个枚举字符串：`pcm` / `wav` / `mp3` / `opus`。阿里云返回 error 后不发 `session.updated` 事件，路由层的 `await readyPromise` 永远等不到 → 30 秒超时挂死。

**解决方案**：
- 用 Node 脚本裸 ws 直连阿里云 DashScope 端点诊断（绕过本地路由），一次性看到错误原文
- 修复：`response_format: "pcm"`

**教训**：不确定时先 reproduce，别推测。API 文档的参数名不一定是 SDK 暴露的常量名，尤其跨语言复用常量时。

### 2.7 主题切换的"两条路径不一致"

**问题**：UI 点击风格卡片切主题 vs 语音说"切到梵高风格"走的是两条不同的状态更新路径，导致图层颜色偶发不跟随。

**解决方案**：
- `platformReducer` 作为主题切换的唯一 reducer
- UI 点击 → `dispatch({ type: 'platform/set_theme' })`；语音工具 → 同样 dispatch
- 主题切换后 layer 颜色的 restyle 在 reducer 里同步触发，不分散在 `useEffect`
- 与 Style Market 解耦：LLM 不感知前端主题，只通过 `platform.set_theme` 工具切换

### 2.8 React Render 函数中的副作用

**问题**：浏览器 Network 看 `/api/tts` 请求全部 canceled。排查发现 `page.tsx` 把 `void ttsSpeakRef.current(narration)` 写在 React render 函数体里（不在 `useEffect` 内）。流式中 narration 每累积一个字就触发一次 render，每次调用新 speak，上次 fetch 立刻被 abort。

**解决方案**：改用 `useEffect([canvas.streaming, canvas.latestNarration])`，流式中（`streaming=true`）不读，等落定才 speak。

**原则**：所有副作用必须在 `useEffect` 内，render 函数纯净。

---

## 三、核心算法

### 3.1 流式 Partial-JSON 指纹去重

**场景**：LLM 流式输出 `{"commands": [{"tool": "diagram.display", "svg": "<svg..."}]}` 时，`partial-json` 每帧解析出的 JSON 字段渐进补全。同一个命令在不同帧中字段数量不同，不能用 `JSON.stringify` 做去重（每帧都不一样）。

**算法**：

```
fingerprint = `${index}:${toolName}`

Why:
- index: 命令在 commands 数组中的位置（流式中数组顺序不变）
- toolName: 命令类型（流式中 tool 字段最先完整）
- 同一 index + 同一 tool → 视为同一条命令，后续帧只是字段补全
```

应用位置：`useCanvasOrchestrator.ts:504`，`appliedCommandIdsRef` 是一个 `Set<string>`。

### 3.2 命令完整性校验（`isCommandComplete`）

**场景**：流式中间帧字段不全时，不能把半成品命令分发给 dispatcher，否则会触发 `undefined.replace()` 等崩溃。

**算法**：按命令类型分层校验，`useCanvasOrchestrator.ts:591-651`：

```
isCommandComplete(cmd):
  if diagram.display / diagram.append:
    1. svg 字段非空
    2. isSvgComplete(svg) → 检查 </svg> 闭合标签存在
  if diagram.edit:
    1. operations 数组非空
    2. 每条 op: operation 三选一 (update/add/delete) ✓
    3. element_id 非空字符串 ✓
    4. update/add 必须带 new_svg ✓
  if drawio.*:
    1. xml 字段非空 + isMxCellXmlComplete(xml) → 等 mxCell 闭合
    2. edit 的每条 op: cell_id 非空 + update/add 的 new_xml 必须 mxCell 闭合
  if canvas.*:
    1. prompt 类 → prompt 非空字符串
    2. targetLayerId 类 → targetLayerId 非空字符串
    3. toggle_* / pan/zoom → 永远 ready（无必填字段）
```

### 3.3 SVG XSS 白名单过滤

**场景**：LLM 输出的 SVG 可能被 prompt injection 植入 `<script>` 标签或 `onload` 事件。

**算法**：`sanitizeSvg.ts` 双层白名单：

```
第一层 — 标签白名单: 49 个 SVG 标签（svg/g/path/rect/circle/ellipse/line/text/
  defs/marker/linearGradient/filter/feDropShadow 等）

第二层 — 属性白名单: 65 个安全属性（viewBox/fill/stroke/d/x/y/rx/ry/cx/cy/
  font-size/text-anchor/marker-end/等）

禁止标签: script / foreignObject / iframe / object / embed
禁止属性: 16 个 on* 事件（onload/onerror/onclick/onmouseover...）

DOMPurify 内部: USE_PROFILES: { svg: true, svgFilters: true }
```

### 3.4 Immutable 状态管理

**原则**：所有状态更新创建新对象，绝不原地修改。`coding-style.md` 中的硬性规定。

**实现**：

```typescript
// LayerMap 更新 — new Map(prev) + 修改新副本
setLayers((prev) => {
  const next = new Map(prev);
  next.set(id, { ...target, status: "done", imageUrl: url });
  return next;
});

// 历史栈 — 切尾部数组
const next = [...prev, entry];
return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;

// ConversationTurn patch — map + 展开
setTurns((prev) =>
  prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
);
```

### 3.5 SVG 编辑操作算法

**场景**：`diagram.edit` 按 `element_id` 增删改 SVG 中的 `<g id="X">` 块。`svg-dispatcher.ts:95-123`。

**算法**：

```
applySvgOperation(svg, op):
  escapedId = escapeRegex(op.element_id)
  groupPattern = /<g\s+[^>]*\bid=["']{escapedId}["'][^>]*>[\s\S]*?<\/g>/g

  switch op.operation:
    case "delete":
      return svg.replace(groupPattern, "")
    case "update":
      return svg.replace(groupPattern, op.new_svg)
    case "add":
      if groupPattern.test(svg):
        return svg.replace(groupPattern, op.new_svg)  // 幂等
      else:
        return insertBeforeClosingSvgTag(svg, op.new_svg)
```

---

## 四、复杂业务如何编排、如何拆解落地

### 4.1 整体架构：三层工具体系

```
┌─────────────────────────────────────────┐
│            LLM 决策层 (directorPrompt)    │
│   角色：创意导演 + 矢量信息图工程师       │
└────────────────┬────────────────────────┘
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
  ┌───────┐ ┌───────┐ ┌──────────┐
  │canvas.*│ │diagram.*│ │platform.*│
  │19 工具 │ │3 工具  │ │8 工具    │
  └───┬───┘ └───┬───┘ └────┬─────┘
      │         │           │
      ▼         ▼           ▼
   图像层    SVG 矢量层    UI 状态层
  (异步生图) (同步渲染)   (同步切换)
```

三层严格隔离，禁止跨层调用。canvas.* 只动 layer 数据不碰 UI，platform.* 只动 UI 状态不碰 layer，diagram.* 只动 SVG 画布。

### 4.2 主编排器模式（`useCanvasOrchestrator`）

**设计思想**：所有 LLM 命令的**唯一落地点**。不分散在多个 useEffect / event handler 中。

```
用户说话
  → ASR transcript
    → run(utterance)
      → POST /api/generate-draw (LLM 流式吐 commands JSON)
        → partial-json 逐帧解析
          → isCommandComplete 深校验
            → 完整命令立即分发:
                ├── platform.* → platformDispatch (同步, UI reducer)
                ├── diagram.*  → SVG dispatcher (同步, 替换/编辑 SVG)
                ├── canvas.* 同步 (move/resize/delete) → dispatchSyncCommand
                └── canvas.* 异步 (generate/edit) → fetch /api/canvas/generate
                      → SSE job-done → 替换 layer.imageUrl
```

### 4.3 Provider Registry 模式

5 大能力域（`llm` / `asr` / `tts` / `image` / `search`），每域独立目录：

```
src/shared/providers/
├── llm/        # 4 provider: openai / anthropic / google / deepseek
├── asr/        # Aliyun NLS
├── tts/        # DashScope Qwen3-TTS
├── image/      # OpenAI-compatible image gen
└── search/     # Web search
```

每个 Provider 实现统一接口，通过 env 变量工厂化注册。前后端共用 `detectCapabilities` 纯函数（`process.env` 不在客户端暴露，走 `/api/capabilities` 获取）。

**Provider = 端点 + Key + SDK 协议适配**，与 **Model = 运行时参数** 完全正交。一个 `openai-compatible` Provider 即可同时承载 OpenAI / yunwu / 月之暗面 / 智谱 / 自建网关，靠 `baseURL` 与 `model` 切换。

### 4.4 三阶段流式管道

| 阶段 | 耗时 | 技术 | 用户体感 |
|------|------|------|---------|
| **阶段 1 — LLM 决策** | 1-3s | `streamText` + partial JSON 增量 | 看到 SVG 渐进渲染 |
| **阶段 2 — 异步生图** | 5-30s | SSE `job-progress` → `job-done` | 占位图层旋转 + 进度百分比 |
| **阶段 3 — TTS 反馈** | 1-2s | WebSocket DashScope Qwen3-TTS | 完成播报 |

### 4.5 项目拆解落地过程

整个项目历经 **33 个关键决策**（见 [`docs/decisions.md`](docs/decisions.md)），按时间线演进：

| 阶段 | PR 数量 | 核心交付 |
|------|---------|---------|
| **原型期** | 7 commits | 脚手架 + TypeScript + Tailwind + 基本组件 |
| **ASR 语音链** | PR #1-4 | 实时语音识别 + CI/CD + PR 流程建立 |
| **LLM 多模型** | PR #1-2 (Provider) | 4 家 Provider 统一路由 + 按 toolType 分工 |
| **双层工具体系** | PR #14-22 (7 连) | 27 工具协议 + Image Provider + InfiniteStage + platformReducer |
| **矢量画布转向** | PR #28-32 (5 连) | react-drawio 集成 + image mxCell 注入 + 旧组件清理 |
| **上下文 & 修复** | PR #38-41 | TTS 修复 + 多轮对话 + chartXML 注入 |
| **工具收敛** | PR #42 | 砍掉 get_shape_library，18 工具 → 17 工具 |
| **SVG 引擎** | PR #44 | 自研 SVG 只读渲染器，卸载 react-drawio |
| **局部编辑** | PR #45-46 | chartXML 上下文注入 + edit_diagram 流式守卫 |
| **功能完善** | 进行中 | diagram.* 原生 SVG 工具集 + 会话历史面板 |

**拆解方法论**：
1. **协议先行**：先写 `docs/protocols/multimodal-canvas.md` 定义工具契约，再按 PR 逐层落地
2. **PR 粒度**：每个 PR 只做一件事，≤ 400 行净增，≤ 30 文件
3. **切片策略**：schema → provider → dispatcher → UI → prompt，每层可独立编译/测试/合并
4. **5 连 PR 拆解范式**（矢量画布转向）：PR-α 基础 → PR-β dispatcher → PR-γ 图注入 → PR-ε 接通 → PR-δ 清理

---

## 五、个人收获

### 5.1 技术层面

1. **流式系统的防御性编程**：partial-JSON 字段渐进补全是常态而非特例，所有消费 partial-JSON 的代码必须做 `undefined` 防御。双层守卫（orchestrator + dispatcher）不是过度工程。

2. **LLM 的"幻觉"不止在内容，也在格式**：Zod 校验是 LLM 输出的最后一道防线，system prompt 写得再漂亮也不能替代 schema 校验。

3. **AI SDK 选型要有逃生舱**：`streamText` + `tool_choice='auto'` 比 `streamObject` + `tool_choice='required'` 普适性强得多。不要假设模型行为跟 OpenAI 一致。

4. **Regex 解析 XML 在受控场景可行**：对 drawio 生成的确定性 mxCell 格式，regex 解析比引入整个 DOM 解析器更轻量，也让测试保持在 Node 环境（不依赖 jsdom）。

### 5.2 工程层面

5. **"少即是多"的决策原则**：每多一个工具/分支，LLM 决策树就多一个干扰项。`get_shape_library` 自上线起无人调用却占 ~1500 行代码和 9 个 stencil 文档，砍掉后 LLM 调用更精准。

6. **提示词里的承诺必须验证**：directorPrompt 里写了"后端会在 prompt 末尾追加当前 chartXML"，但实际 fetch 从未发过这个字段。文案不是契约，数据到位才算。

7. **先 reproduce 再推测**：TTS 挂死问题两次错误推断都被打脸，最后用裸 ws 脚本直连诊断 5 分钟定位真根因。证据驱动 > 经验驱动。

8. **副作用必须进 useEffect**：render 函数里的副作用（如 TTS speak）在 React 18+ Strict Mode 下会被双调用，在流式场景下每一次 state 变更都触发新副作用。useEffect 的依赖数组是唯一正确的副作用触发器。

### 5.3 产品思维

9. **用户的原话是最好的需求文档**：用户说"我不喜欢 iframe" → 自研 SVG 引擎；用户说"现在的交互不像对话" → Agent 对话面板。不替用户做选择。

10. **风格市场作为单一信源**：当所有颜色/字体/动效参数收敛到 `marketStyles.ts` 一个文件，主题切换、Shader 配色、UI Token 全部自动跟随。先抽象后落地。

---

## 六、快速开始

### 环境要求

- Node.js ≥ 18.18.0（推荐 20+）
- npm 9+

### 本地开发

```bash
# 1. 克隆安装
git clone <repo-url> && cd voice-canvas
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，至少设置:
#   OPENAI_API_KEY      (LLM API Key)
#   OPENAI_BASE_URL     (默认 dashscope.aliyuncs.com)

# 3. 启动
npm run dev
# → http://localhost:3000
```

没有 API Key 时，前端运行**完整数据流模拟器**，展示三阶段流式管道（语音 → 调度 → 画布）。

### Docker

```bash
docker build -t voice-canvas .
docker run -p 3000:3000 --env-file .env.docker voice-canvas
```

---

## 七、项目结构

```
src/
├── app/                              # Next.js App Router 入口
│   ├── api/
│   │   ├── asr-token/route.ts        # 阿里云 NLS Token 签发
│   │   ├── canvas/generate/route.ts  # 异步图像生成
│   │   ├── canvas/jobs/[id]/route.ts # 任务状态查询
│   │   ├── canvas/jobs/stream/route.ts # SSE 任务完成流
│   │   ├── capabilities/route.ts     # Provider 能力矩阵
│   │   ├── generate-draw/
│   │   │   ├── route.ts              # 主 LLM 流式端点
│   │   │   ├── directorPrompt.ts     # 系统提示词（31 工具）
│   │   │   └── canvasState.ts        # 当前 SVG 上下文注入
│   │   ├── health/route.ts           # 存活探针
│   │   ├── sessions/                 # 会话 CRUD
│   │   └── tts/route.ts              # 文本转语音
│   ├── layout.tsx                    # 根布局（得意黑字体）
│   ├── page.tsx                      # 主页面
│   └── globals.css
│
├── features/
│   ├── canvas/                       # 多模态画布编排器
│   ├── diagram/                      # SVG 渲染器 + 分发器
│   │   ├── components/DrawIoStage.tsx
│   │   ├── svg/                      # 自研 SVG 渲染引擎
│   │   │   ├── SvgRenderer.tsx       # 原生 SVG 渲染器
│   │   │   ├── sanitizeSvg.ts        # XSS 白名单过滤
│   │   │   └── ...
│   │   ├── dispatchers/              # diagram.* / drawio.* 命令分发器
│   │   └── utils/
│   ├── platform/                     # 全局 UI 状态 reducer
│   ├── sessions/                     # 会话历史面板
│   └── voice-control/                # VAD / ASR / TTS / ShaderOrb
│
├── shared/
│   ├── constants/marketStyles.ts     # 风格市场（单一信源）
│   ├── db/                           # SQLite 连接 + 仓库模式
│   ├── providers/                    # 5 大能力域 Provider 注册
│   └── types/                        # 统一工具 Zod schema
│
└── tests/                            # 19 个测试套件，2000+ 行
```

---

## 八、API 总览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/generate-draw` | `POST` | 主 LLM 流式端点（JSON Lines） |
| `/api/canvas/generate` | `POST` | 异步图像生成（返回 job ID） |
| `/api/canvas/jobs/[id]` | `GET` | 任务状态轮询 |
| `/api/canvas/jobs/stream` | `GET` | SSE 任务完成流 |
| `/api/capabilities` | `GET` | Provider 能力矩阵 |
| `/api/asr-token` | `GET` | 阿里云 NLS WebSocket Token |
| `/api/tts` | `POST` | 文本转语音 |
| `/api/sessions` | `GET` `POST` | 会话列表 / 创建 |
| `/api/sessions/[id]` | `GET` `PATCH` `DELETE` | 会话 CRUD |
| `/api/sessions/[id]/turns` | `GET` | 会话历史对话 |
| `/api/health` | `GET` | 存活探针 |

---

## 九、脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器（端口 3000） |
| `npm run build` | 生产构建（`output: standalone`） |
| `npm start` | 启动生产服务器 |
| `npm run lint` | ESLint（Next.js + TypeScript） |
| `npm run typecheck` | `tsc --noEmit` 严格检查 |
| `npm test` | Vitest 单次运行 |
| `npm run test:watch` | Vitest 监听模式 |

---

## 十、测试

19 个测试套件，2000+ 行测试代码。覆盖目标：**行覆盖率 ≥ 80%，分支覆盖率 ≥ 70%**。

```
tests/
├── directorPrompt.test.ts          # 铁壁防御提示词验证
├── llmProviders.test.ts            # Provider 路由 + 注册
├── canvasTools.test.ts             # 画布命令 schema
├── drawioDispatcher.test.ts        # 画布命令分发（含流式崩溃回归）
├── drawioFoundation.test.ts        # 图表核心工具
├── buildCanvasState.test.ts        # SVG 状态构建器
├── conversationHistory.test.ts     # 多轮上下文组装
├── imageJobStore.test.ts           # 异步任务追踪
├── imageMxCell.test.ts             # 图像 mxCell 注入
├── parseMxStyle.test.ts            # mxCell 样式解析（17 cases）
├── parseMxXml.test.ts              # mxCell XML 解析（10 cases）
├── marketStyles.test.ts            # 风格市场完整性
├── platformReducer.test.ts         # 平台状态机
├── sessionRepo.test.ts             # SQLite 会话持久化
├── sessionsApi.test.ts             # REST API 集成
├── capabilities.test.ts            # Provider 能力检测
├── ttsRoute.test.ts                # TTS 端点
├── pcm.test.ts                     # PCM → WAV 转换
└── aliyunQwenRealtimeTts.test.ts   # TTS Provider 集成
```

---

## 十一、贡献指南

所有贡献遵循 [`AGENTS.md`](./AGENTS.md) 规范：

- **Conventional Commits**：`feat:` / `fix:` / `refactor:` 等
- **小 PR**：≤ 400 行净增，≤ 30 文件
- **TDD**：测试先行，80%+ 覆盖率
- **Code Review**：至少 1 人 review + `code-reviewer` agent
- **不擅自改 UI**：删除/移动已有组件必须征得用户明确同意

架构决策记录在 [`docs/decisions.md`](docs/decisions.md) 和 [`docs/adr/`](docs/adr/)。

---

## 十二、技术栈一览

### 运行时 & 框架

| 类别 | 库 | 版本 |
|------|-----|------|
| Web 框架 | [Next.js](https://nextjs.org) (App Router) | 15.1.7 |
| UI 库 | [React](https://react.dev) | 19.0.0 |
| 语言 | [TypeScript](https://www.typescriptlang.org) (`strict` + `noUncheckedIndexedAccess`) | 5.7.3 |
| 样式 | [Tailwind CSS](https://tailwindcss.com) | 3.4.17 |
| 字体 | 得意黑 Smiley Sans（自托管 woff2） | — |

### AI & LLM

| 类别 | 库 | 版本 |
|------|-----|------|
| AI SDK | [`ai`](https://sdk.vercel.ai) (Vercel AI SDK) | 6.0.204 |
| Anthropic | [`@ai-sdk/anthropic`](https://www.npmjs.com/package/@ai-sdk/anthropic) | 3.0.84 |
| DeepSeek | [`@ai-sdk/deepseek`](https://www.npmjs.com/package/@ai-sdk/deepseek) | 2.0.38 |
| Google | [`@ai-sdk/google`](https://www.npmjs.com/package/@ai-sdk/google) | 3.0.82 |
| OpenAI | [`@ai-sdk/openai`](https://www.npmjs.com/package/@ai-sdk/openai) | 3.0.71 |
| OpenAI 客户端 | [`openai`](https://www.npmjs.com/package/openai) (DashScope TTS) | 6.42.0 |
| 阿里云 SDK | [`@alicloud/pop-core`](https://www.npmjs.com/package/@alicloud/pop-core) (NLS ASR) | 1.8.0 |

### 数据 & 校验

| 类别 | 库 | 版本 |
|------|-----|------|
| Schema 校验 | [Zod](https://zod.dev) | 3.25.76 |
| SQLite | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)（同步，WAL） | 11.5.0 |
| Partial JSON | [partial-json](https://www.npmjs.com/package/partial-json)（流式解析） | 0.1.7 |
| XSS 过滤 | [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.10 |
| WebSocket | [`ws`](https://github.com/websockets/ws) | 8.21.0 |

---

## 十三、演示

<div align="center">
  <video src="https://v2i.gojia.cloud/videos/video.mp4" controls width="100%" style="max-width: 960px; border-radius: 12px;">
    您的浏览器不支持 video 标签
  </video>
  <p><em>语音 → ASR → LLM 流式 → 图表生成 — 完整管道演示</em></p>
</div>

---

## 许可证

MIT
