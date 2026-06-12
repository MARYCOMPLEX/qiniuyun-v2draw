# next-ai-draw-io 架构分析 (Part 2 · 优化路线与落地)

> 上半部见 `next-ai-draw-io-analysis.md`

---

## 五、推荐的优化路线(按 ROI 排序)

> 每条都有"它做了什么 / 你怎么落"两段。前 3 条基本是"几小时上手,效果立竿见影"。

### Path 1 · 截图反馈回路(MVP,2 小时)

**为什么先做这个**: 这是你提的核心需求,链路最短,改动只在前后端各加一段。

**它做了什么**:
- 画布渲染后 → 抓 PNG → 发给视觉模型 → 拿到 issues → 反馈给主 LLM → 自动重试

**怎么落地**(伪代码,直接照搬即可):

`src/features/art-canvas/components/VectorStage.tsx` 加截图 API:
```ts
// 暴露给上层
useImperativeHandle(ref, () => ({
  captureSnapshot: () => canvasRef.current?.toDataURL("image/png") ?? null,
}));
```

`src/app/api/validate-canvas/route.ts` 新建:
```ts
export async function POST(req: Request) {
  const { imageBase64, userUtterance, instruction } = await req.json();

  const result = await provider.generate({
    model: VLM_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "image", image: imageBase64 },
        { type: "text", text: `用户说"${userUtterance}",当前画了 ${JSON.stringify(instruction)}。
          是否符合用户意图?如果不符合,从这几个维度回答:
          - position 位置对吗
          - size 大小对吗
          - shape 形状对吗
          - 风格匹配吗
          返回 { valid: boolean, issues: string[] }`}
      ]
    }],
  });
  return Response.json(JSON.parse(result.text));
}
```

`useDrawSimulator` (or 真实流式 hook)末尾加:
```ts
const png = stageRef.current?.captureSnapshot();
if (png) {
  const validation = await fetch("/api/validate-canvas", { ... });
  if (!validation.valid) {
    // 重新调一次主 LLM,把 issues 作为附加 context
    runWithFeedback(activeStyleId, validation.issues);
  }
}
```

**关键**: 这是闭环里最值钱的部分 — 模型看见自己的输出,这是它学不会的反思能力的人工补丁。

### Path 2 · Schema 扩到三动作 + 多步工具链(1 天)

**它做了什么**:
- `display_diagram` / `edit_diagram` / `append_diagram` 让 LLM 能精确控制"重画 vs 微调 vs 续传"

**怎么落地**:

扩 `drawToolSchema`(`src/shared/types/schema.ts`):
```ts
const modifyShapeSchema = z.object({
  toolType: z.literal("MODIFY_SHAPE"),
  targetId: z.string(),  // 要改哪个
  patch: z.object({       // 部分字段, 都是可选
    size: z.number().optional(),
    position: positionSchema.optional(),
    useAccentColor: z.boolean().optional(),
  }),
});

const deleteShapeSchema = z.object({
  toolType: z.literal("DELETE_SHAPE"),
  targetId: z.string(),
});

export const drawToolSchema = z.discriminatedUnion("toolType", [
  atomicShapeSchema,    // 原来的 create
  modifyShapeSchema,    // ★ 新
  deleteShapeSchema,    // ★ 新
  diffusionMeltSchema,
  webSearchSchema,
]);
```

`toolDispatcher.ts` 加分支处理。**画布维护一个 `shapesById: Map<string, CanvasInstruction>`**,这一步很关键 — 之前只有"当前一帧",改完就需要持久化所有 shape。

route.ts 开 `stopWhen: stepCountIs(3)`(用 `streamText` 的话):
```ts
streamText({
  model,
  tools: { atomic_shape: ..., modify_shape: ..., delete_shape: ... },
  stopWhen: stepCountIs(3),  // 一回话最多调 3 次 tool
});
```

之后用户说"画三个递增大小的圆排成一行",LLM 会连续吐 3 次 ATOMIC_SHAPE,前端依次渲染。

### Path 3 · 历史栈 + 撤销(2 小时)

**它做了什么**:
- 每次 LLM 编辑前 push 一份完整状态到 history,UI 提供"返回上一步"

**怎么落地**(`useDrawSimulator`):
```ts
const historyRef = useRef<Array<{instruction, timestamp}>>([]);

const run = (...) => {
  if (state.instruction) {
    historyRef.current.push({
      instruction: state.instruction,
      timestamp: Date.now(),
    });
  }
  // ... 原 run 逻辑
};

const undo = () => {
  const prev = historyRef.current.pop();
  if (prev) setState(s => ({ ...s, instruction: prev.instruction }));
};
```

UI 层加个"↶"按钮调 `undo()`。极简实现 30 分钟就能上,语音场景下尤其关键 — 用户说错就能立即回滚,不用纠正一遍。

### Path 4 · 流式 partial 的安全裁切(1 小时,扩多图元时再做)

当前你 `dispatchPartialTool` 是"全字段到齐才渲染"。多图元后不行 — 第一个 shape 全字段到齐,第二个还在补全,第二个会一直卡住第一个不渲染。

照 `extractCompleteMxCells` 思路改:
```ts
// shapes 是数组而非单对象
const dispatchPartialShapes = (partial: Partial<{ shapes: PartialShape[] }>): CanvasInstruction[] => {
  return (partial.shapes ?? [])
    .filter(isCompleteAtomic)  // 只取已经完整的
    .map(toCanvasInstruction);
};
```

### Path 5 · Prompt Cache 接入(看 Provider 支持)

你的 yunwu 走 `gemini-3-flash-preview` 不一定支持 caching。如果接 Anthropic Claude 4.x、Gemini 1.5+ 就能用。

把 `buildIronWallPrompt(activeStyle)` 拆成两段 system message:
```ts
{ role: "system", content: STATIC_RULES,                 cache: true }   // 风格无关的铁壁规则
{ role: "system", content: buildStyleContext(activeStyle) }              // 当前风格 token
```

### Path 6 · 自动重试

把当前 simulator 改成真链路 + 自动重试:
```ts
let retryCount = 0;
const MAX_RETRY = 3;
while (retryCount < MAX_RETRY) {
  const result = await streamFromAPI(...);
  if (result.error) {
    retryCount++;
    appendUserMessage(`上一次失败: ${result.error}, 请重试`);
    continue;
  }
  break;
}
```

### Path 7 · 截图持久化 + 会话存档(远期)

next-ai-draw-io 的 `diagramHistory` 同时存 svg + xml,svg 给 UI 列表用。你可以每隔 N 秒/N 次操作把 `{ snapshot: PNG, instructions: [...], userUtterance: "..." }` 存 IndexedDB(用 `idb` 库)。这样:
- 用户能回看自己 30 分钟前画了什么
- 可以做"画作分享"(导出 PNG)
- 可以做"语音 - 截图 - 指令"三元组的训练数据收集

---

## 六、对当前 VOICE CANVAS 架构的具体修改清单

### 6.1 `src/features/voice-control/hooks/useDrawSimulator.ts`
**问题**: 函数名叫 simulator,实质就是当前的"出图大脑"。建议按 `useDrawDirector` 之类重命名,因为它最终要兼容真链路。

**改造方向**:
```ts
useDrawDirector({
  mode: "simulator" | "live-stream",  // 一个开关切真假链路
  onValidationFail?: (issues) => void, // 截图反馈钩子
})
```

### 6.2 `src/features/art-canvas/utils/toolDispatcher.ts`
现在只处理 ATOMIC_SHAPE,加上 MODIFY/DELETE 后,需要画布维护一个 `Map<id, instruction>` 而不是单 instruction。VectorStage 也要改成"按 id 索引绘制" — 这是从"演示原型"到"真用"的最大改动。

### 6.3 `src/features/art-canvas/components/VectorStage.tsx`
- 暴露 `captureSnapshot()` 方法
- 维护 `shapesByIdRef: Map<string, RenderState>`
- 每帧遍历 map 重绘所有 shapes(不是只画一个)
- 删除时从 map 移除

### 6.4 `src/app/api/`
- 新建 `validate-canvas/route.ts` — VLM 反馈端点
- `generate-draw/route.ts` 加 `stopWhen` 多步工具

### 6.5 `src/shared/providers/`
你 ASR/TTS/Image 那几个目录现在还是占位骨架。**先不用全填**。截图反馈回路只用 LLM provider,你已经有了。

---

## 七、核心借鉴的 5 个心智模型

写下来当备忘:

1. **整图 XML > 增量指令** — 把状态完全交给一种"可序列化的完整描述"管理,前后端、缓存、历史、撤销都共用这一份。你的画布等价物是"shape map + style id"。

2. **工具集是契约,不是 RPC** — `display/edit/append` 三件套之所以好用,是因为它们覆盖了"重做/微调/补全"三种语义,而不是按 CRUD 分。语音场景的契约可能是 "create/modify/delete/批量重置"。

3. **错误是模型的一部分** — 截断、JSON 错、视觉不符、XML 不合法 → 把错误信息原文喂回模型 + 自动重试,不要前端兜底。前端兜底永远不如模型自修。

4. **流式 = 视觉化 progress** — 部分输出立刻渲染(只渲染已完整的子集)是用户体感"AI 在画"的关键。LERP 缓动是这一原则在 canvas 上的物理实现。

5. **截图回路是 VLM 时代的标配** — 这不是 next-ai-draw-io 独有,Cursor / v0 / Bolt 全在做。文本-视觉-文本的闭环让模型看见自己的"产物",才能真做迭代。

---

## 八、它没解决但你需要解决的问题

1. **语音连续指令**: next-ai-draw-io 是"用户输入 → AI 出图 → 用户再输入"的回合制。你是语音流,VAD 断句后可能用户还在说。要不要打断当前生成?边听边改?这是它没考虑的命题。
2. **风格的语义化**: 它的图就是技术图,无 style 概念。你的"赛博朋克 / 梵高 / 黑曜石"风格如何让 LLM 理解为不只是"配色变了"而是"绘画语言变了"?提示词里如何编码风格?这条值得单开一份 prompt 实验文档。
3. **shader 与 LLM 的解耦**: 你现在 shader 是 UI 层,LLM 不知道它存在。如果想让"听到鼓点 shader 抖动" 也是 LLM 控制的,需要把 shader uniform 也作为 tool 入参。这是非常远的事,但架构上要预留。

---

## 九、第一步建议

**今晚做哪一个**:

我推荐 **Path 1 (截图反馈回路 MVP)**,理由:
- 你提了这个需求,且当前链路最短能验证
- 改动只在 VectorStage + 新 API,不动主链路
- 能让你立刻看到"模型自己改"的效果,信心很足
- 成本: 2 小时工作量

完成后再上 **Path 3 (历史栈)** —— 30 分钟,但用户体验提升巨大。

Path 2 (schema 扩展) 影响面最大,要等 Path 1 验证后再做,顺便把 simulator 替换成真链路。

---

## 附录: 我读了哪些文件

| 文件 | 行数 | 看点 |
|---|---|---|
| `app/api/chat/route.ts` | 869 | 后端编排, tool 定义, prompt cache, JSON 修复 |
| `lib/system-prompts.ts` | 410 | 铁壁规则, 边路由 7 法 |
| `hooks/use-diagram-tool-handlers.ts` | 580 | 工具回调, VLM 验证, 重试 |
| `contexts/diagram-context.tsx` | 419 | 画布 ref, 截图导出, 历史 |
| `components/chat-panel.tsx` | 1465 | useChat 编排, 自动重试触发 |
| `components/chat-message-display.tsx` | ~1000 | 流式 partial 渲染, 防抖, mxCell 裁切 |
| `package.json` | 142 | 依赖技术栈全景 |
| `README.md` | ~120 | 产品定位与功能列表 |

总读 ~3743 行核心 + 周边 ~2000 行参考。

---

## 附录: 它 vs 你 一句话对比

> next-ai-draw-io 是 "**对话改 XML, XML 渲染图**" 的工程化样板。
> VOICE CANVAS 是 "**语音改物理画布**" 的艺术化探索。
> 抽掉表层差异, 它们在 LLM-as-protocol 这层是相通的, 这就是为什么它的工程经验对你完全适用。
