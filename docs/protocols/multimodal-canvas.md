# 多模态画布协议 v1.0

> 本协议是 voice-canvas 转型为 **「语音操控的多模态 AI 创作平台」** 的核心契约。
> 所有 LLM 工具、画布数据模型、平台交互、流式协议、扩展规范都在此文档定义。
>
> 协议命名空间: `canvas.*`(业务工具) / `platform.*`(平台工具)
> 状态: ACTIVE · 维护者: 架构组 · 创建日期: 2026-06-13

---

## 1. 产品定位与设计哲学

### 1.1 定位转变

| 维度 | 矢量画布(旧) | 多模态画布(新) |
|---|---|---|
| 画布载体 | 几何 shape | **AI 生成的图像 layer** |
| LLM 角色 | 几何工程师 | **创意导演 + 任务编排** |
| 生成方式 | 同步流式 commands | **异步多模态生图(5-30s)** |
| 用户交互 | 看几何动起来 | **看图像渐进出现, 可重生成** |
| 调用对象 | 自己绘 | DALL-E / Stable Diffusion / 通义万相 / Doubao |

LLM **不再"画"**, 而是**写好的 prompt + 调用生图工具 + 决定布局**。

### 1.2 核心设计哲学:**双层工具集架构**

```
┌─────────────────────────────────────────────────┐
│              LLM 决策层                          │
└──────────────┬──────────────────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌─────────────┐   ┌─────────────────┐
│ 业务工具      │   │ 平台工具         │
│ canvas.*    │   │ platform.*      │
│ 改 LayerMap │   │ 改 UIState      │
└─────────────┘   └─────────────────┘
```

**两类工具严格隔离:**
- 业务工具(`canvas.*`): 只动 layer 数据, 不碰 UI 状态
- 平台工具(`platform.*`): 只动 UI 状态, 不碰 layer 数据
- 两者通过 React props 解耦, **永不交叉**

**Why**: 平台级 OS 范本要求工具与业务解耦, 后续添加新业务能力或新平台能力都不会互相污染。

---

## 2. 数据模型

### 2.1 ImageLayer (业务图层)

```typescript
interface ImageLayer {
  /** 前端分配的唯一 id, 格式: l-{ts36}-{n} */
  id: string;
  /** 异步生图任务 id, null = 同步操作或未启动 */
  jobId: string | null;
  status: "pending" | "generating" | "done" | "failed";

  // 内容
  imageUrl: string | null;       // CDN URL 或 dataURL
  thumbnailUrl: string | null;
  prompt: string;                // 原始生成 prompt
  negativePrompt?: string;
  seed?: number;                 // 用于复现
  modelId: string;               // 用了哪个生图模型

  // 衍生关系
  parentLayerId?: string;        // inpaint/edit/variation 的源 layer
  generation: number;            // 0=原始 1=重生成 N=...

  // 布局 (无限画布坐标系)
  position: { x: number; y: number };  // 中心点
  size: { width: number; height: number };
  rotation: number;              // 角度
  opacity: number;               // 0-1
  zIndex: number;                // 越大越上

  // 选区 (用于 inpaint)
  mask?: { polygon: Array<{ x: number; y: number }> } | null;

  // 时序
  createdAt: number;
  completedAt: number | null;
}

type LayerMap = Map<string, ImageLayer>;
```

### 2.2 InfiniteCanvas (无限画布容器)

```typescript
interface CanvasState {
  layers: LayerMap;
  viewport: Viewport;
  selectedLayerIds: ReadonlySet<string>;
  /** 默认舞台矩形 = UI 中间区域映射的画布坐标 */
  defaultStageRect: { x: number; y: number; w: number; h: number };
  /** 命令历史栈 (用于撤销, 见 §6) */
  history: HistoryEntry[];
}

interface Viewport {
  pan: { x: number; y: number };  // 画布平移 (px in screen space)
  zoom: number;                    // 0.1 - 4.0
}
```

### 2.3 PlatformState (平台 UI 状态)

```typescript
interface PlatformState {
  activeStyleId: StyleId;          // 当前主题
  panels: {
    leftSidebar: boolean;
    capabilitiesPanel: boolean;
    historyPanel: boolean;
  };
  voice: {
    listening: boolean;
    ttsEnabled: boolean;
  };
  showGrid: boolean;
  /** 视口控制 (zoom/pan 走 canvas, 但平台工具能间接调用) */
  viewportMirror?: Viewport;
}
```

---

## 3. 业务工具集 (canvas.*) — 18 个

按职责分 5 类。每个工具都有 `scope: "canvas"`, `affects: "layerMap"`。

### 3.1 生成类 (Generation, 5 个, 全部异步)

| 工具 | 入参 | 影响 | 备注 |
|---|---|---|---|
| `canvas.generate_image` | `prompt, position?, size?, style?` | 新增 1 个 layer | 通用文生图 |
| `canvas.generate_background` | `prompt, mood?` | 新增背景 layer (zIndex=0, 占满 stage) | 全画布背景 |
| `canvas.generate_character` | `prompt, position?, transparentBg?` | 新增角色 layer (zIndex>背景) | 自动透明背景 |
| `canvas.generate_variations` | `prompt, count(2-4)` | 新增 N 个 layer 并排 | 让用户选 |
| `canvas.generate_reference_compose` | `prompt, referenceLayerIds[]` | 新增 1 个 layer | 参考其他 layer 合成 |

### 3.2 编辑类 (Editing, 6 个, 全部异步)

| 工具 | 入参 | 影响 |
|---|---|---|
| `canvas.edit_image` | `targetLayerId, prompt, strength` | 替换 imageUrl, 保留 layer id |
| `canvas.inpaint_layer` | `targetLayerId, maskPolygon, replacePrompt` | 局部重绘, 保留 mask 之外区域 |
| `canvas.outpaint_layer` | `targetLayerId, direction, prompt?` | 边缘扩展, layer size 变大 |
| `canvas.style_transfer` | `targetLayerId, stylePrompt` | 风格迁移 |
| `canvas.remove_background` | `targetLayerId` | 一键抠图 |
| `canvas.upscale_layer` | `targetLayerId, scale(2|4)` | 提升分辨率 |

### 3.3 布局类 (Layout, 5 个, 同步)

| 工具 | 入参 | 影响 |
|---|---|---|
| `canvas.move_layer` | `targetLayerId, to?, delta?` | layer.position |
| `canvas.resize_layer` | `targetLayerId, size?, scale?` | layer.size |
| `canvas.rotate_layer` | `targetLayerId, degrees` | layer.rotation |
| `canvas.set_layer_props` | `targetLayerId, opacity?, zIndex?` | 透明度/层级 |
| `canvas.arrange_layers` | `pattern: "grid"|"row"|"column"|"radial", layerIds[]` | 批量布局 |

### 3.4 删除/组合 (2 个, 同步)

| 工具 | 入参 | 影响 |
|---|---|---|
| `canvas.delete_layer` | `targetLayerId` | 移除 |
| `canvas.clear_canvas` | - | 全清 (历史可撤销) |

### 3.5 反馈类 (2 个)

| 工具 | 入参 | 同步? |
|---|---|---|
| `canvas.regenerate_layer` | `targetLayerId, feedback?` | ✅ 异步 |
| `canvas.undo` | `steps?(1)` | 同步, 从 history 恢复 |

---

## 4. 平台工具集 (platform.*) — 8 个 (全部同步)

`scope: "platform"`, `affects: "uiState"`。

| 工具 | 入参 | 影响 | 入历史? |
|---|---|---|---|
| `platform.set_theme` | `themeId: StyleId` | activeStyleId | ✅ |
| `platform.open_panel` | `panelId: "capabilities"|"history"|"left_sidebar"` | panels.* | ❌ |
| `platform.close_panel` | `panelId` | panels.* | ❌ |
| `platform.toggle_voice` | `enabled?: boolean` | voice.listening | ❌ |
| `platform.toggle_tts` | `enabled?: boolean` | voice.ttsEnabled | ❌ |
| `platform.toggle_grid` | `enabled?: boolean` | showGrid | ❌ |
| `platform.zoom_canvas` | `mode: "fit"|"actual"|delta` | viewport.zoom | ❌ |
| `platform.pan_canvas` | `to?, delta?` | viewport.pan | ❌ |

### 4.1 主题切换标准化 (解决"切换不生效")

**根因**: 之前主题切换有两个入口 (UI 风格卡 + 语音 STYLE_TRANSFORM), 走不同的状态更新路径, 导致 layer.stroke 偶发不跟随。

**新规范**:
1. **唯一 reducer**: `platformReducer` 是主题切换的唯一处理点
2. **两条路径同入口**: UI 点击 → `dispatch({type: 'platform/set_theme'})`; 语音工具 → 同样 dispatch
3. **副作用集中**: layer 颜色 restyle 在 reducer 里**同步触发**, 不分散在 useEffect
4. **不可变**: 每次切换创建新 PlatformState, 所有依赖通过 React Context 传递

---

## 5. 流式协议 (三阶段)

### 5.1 阶段 1 · LLM 决策 (秒级)

```http
POST /api/generate-draw
Content-Type: application/json

{
  "utterance": "切到梵高风格再画一只森林狐狸",
  "canvasState": "{...}",
  "platformState": "{...}"
}
```

LLM 输出 (流式 partial JSON):

```json
{
  "commands": [
    { "tool": "platform.set_theme", "args": { "themeId": "SKILL_VAN_GOGH" } },
    {
      "tool": "canvas.generate_background",
      "args": { "prompt": "magical forest, golden hour, cinematic, hyper-realistic, 8k" }
    },
    {
      "tool": "canvas.generate_character",
      "args": { "prompt": "cute red fox sitting on moss, transparent bg" }
    }
  ],
  "narration": "切到梵高,正在画森林与狐狸"
}
```

**前端立即同步执行**所有平台工具 + 同步业务工具(MOVE 等)。
**异步业务工具**(GENERATE_*) 提交到后端任务队列, 创建 placeholder layer (status=pending)。

### 5.2 阶段 2 · 异步生图 (SSE)

```http
GET /api/canvas/jobs/stream?sessionId=xxx
Accept: text/event-stream
─────────────────────────────────────────────────
event: job-progress
data: {"jobId":"j-123","status":"generating","progress":0.4}

event: job-done
data: {"jobId":"j-123","layerId":"l-1","imageUrl":"https://...","seed":42}

event: job-failed
data: {"jobId":"j-456","error":"NSFW filter triggered"}
```

### 5.3 阶段 3 · 前端渲染

- 收到 `job-done` → 找对应 layerId → 替换 imageUrl → 淡入动画
- 收到 `job-failed` → 标记 status=failed, UI 显示重试按钮 + 错误原因
- 所有 layer 完成 → narration 朗读 (TTS)

### 5.4 错误协议

```typescript
interface CommandResult {
  commandId: string;
  ok: boolean;
  error?: { code: string; message: string };
}

// 标准错误码
// CANVAS_LAYER_NOT_FOUND - targetLayerId 不存在
// CANVAS_GENERATION_FAILED - 生图模型错
// CANVAS_NSFW_FILTERED - 内容审核拒绝
// CANVAS_INVALID_PARAMS - 入参不合法
// PLATFORM_INVALID_THEME - 主题 id 不存在
// PLATFORM_INVALID_PANEL - 面板 id 不存在
```

异步生图失败 → layer.status = "failed", UI 显示重试按钮。
平台工具失败极少发生(同步本地操作), 除非参数非法。
LLM 调错工具 → 后端 zod validate 失败返 422, 前端把错误注入下次 LLM context。

---

## 6. 历史栈 (Undo/Redo)

### 6.1 范围

| 工具类别 | 入历史? | 说明 |
|---|---|---|
| 业务工具 (canvas.*) | ✅ 全部 | 创建/编辑/移动/删除都可撤销 |
| `platform.set_theme` | ✅ 唯一例外 | 主题切换可撤销 |
| 其他平台工具 | ❌ | 面板开关/语音开关不入历史 (无业务意义) |

### 6.2 历史条目结构

```typescript
interface HistoryEntry {
  id: string;
  timestamp: number;
  command: { tool: string; args: object };
  /** 应用前的快照 (用于撤销) */
  beforeSnapshot: {
    layers: LayerMap;
    activeStyleId?: StyleId;
  };
}
```

历史栈最多保留 50 条, FIFO 滚动删除旧的。

---

## 7. 无限画布交互

### 7.1 视口操作

| 操作 | 行为 |
|---|---|
| 滚轮 | 缩放 (鼠标位置为锚点) |
| Space + 拖拽 / 中键拖拽 | 平移视口 |
| 双击空白 | `platform.zoom_canvas mode=fit` (自动缩放显示所有 layer) |
| Cmd/Ctrl + 0 | `platform.zoom_canvas mode=actual` (100%) |

### 7.2 Layer 交互

| 操作 | 行为 |
|---|---|
| 单击 | 选中 (蓝框) |
| 拖拽 | 移动 layer |
| 8 个角点拖拽 | 缩放 (保持比例 / Shift 不锁比例) |
| Shift+点击 | 多选 |
| 右键 | 菜单 (重生成/删除/复制) |
| 双击 | 进入"编辑模式"(显示 mask 工具) |
| Lasso 套索 (编辑模式) | 画 mask polygon → 触发 inpaint |

### 7.3 Mask 标准

mask polygon 坐标系跟 layer 坐标系一致(layer 的左上角是原点 0,0)。
LLM 生成的 mask 可以是矩形(4 个点)或自由多边形。

---

## 8. 扩展指南

### 8.1 添加新业务工具

1. `src/shared/types/schema.ts` 加入 zod schema, **命名 `canvas.xxx`**
2. `src/features/canvas/dispatchers/business.ts` 加 dispatcher 分支
3. 异步: `src/app/api/canvas/jobs/` 加 worker
4. system prompt 加示例

### 8.2 添加新平台工具

1. `src/shared/types/schema.ts` 加入 zod schema, **命名 `platform.xxx`**
2. `src/features/platform/dispatchers/platform.ts` 加 reducer 分支
3. 把效果连接到对应 React state(通过 `platformReducer`)
4. system prompt 加示例

### 8.3 严格约束

- ❌ 平台工具**不可以**直接改 layer
- ❌ 业务工具**不可以**改 UI 状态
- ✅ 两者通过 React props 解耦
- ✅ 工具命名遵守 `<scope>.<verb>_<object>` 模式

---

## 9. Image Provider 协议

### 9.1 配置

```bash
# .env.local
IMAGE2_API_KEY=sk-xxx       # OpenAI 兼容生图端点 API Key
IMAGE2_URL=https://yunwu.ai # baseURL (会自动追加 /v1)
IMAGE2_MODEL=gpt-image-1    # 默认模型, 可被工具入参覆盖
```

### 9.2 Provider 接口

```typescript
interface ImageProvider {
  generate(req: ImageGenerateRequest): Promise<ImageGenerateResult>;
  edit(req: ImageEditRequest): Promise<ImageGenerateResult>;
  inpaint(req: ImageInpaintRequest): Promise<ImageGenerateResult>;
}

interface ImageGenerateResult {
  imageUrl: string;
  thumbnailUrl: string;
  seed?: number;
  modelId: string;
}
```

### 9.3 Job Store

简单内存版 (生产可换 Redis):

```typescript
interface ImageJob {
  id: string;
  command: string;          // canvas.generate_image / edit / inpaint
  status: "queued" | "generating" | "done" | "failed";
  progress: number;         // 0-1
  prompt: string;
  result?: ImageGenerateResult;
  error?: string;
  layerId: string;          // 关联的 placeholder layer id
  startedAt: number;
}
```

---

## 10. PR 路线图

| PR | 范围 | 工作量 |
|---|---|---|
| **PR-A** | 协议文档 + zod schema + 类型 (无运行时) | 0.5 天 |
| **PR-B** | Image Provider + /api/canvas/generate /edit /jobs | 0.5 天 |
| **PR-C** | InfiniteStage + ImageLayerView + Viewport | 1 天 |
| **PR-D** | useCanvasOrchestrator + SSE + Job Store | 1 天 |
| **PR-E** | platformReducer + 8 平台工具 + 主题标准化 | 0.5 天 |
| **PR-F** | directorPrompt 重写 + 25 工具决策树 + 8 示例 | 0.5 天 |
| **PR-G** | Mask 选区 + Inpaint UI | 1 天 |

每个 PR 独立合并、独立测试、可独立 revert。

---

## 11. 兼容性与迁移

### 11.1 旧矢量画布的命运

旧的 `CREATE_SHAPES / MOVE_SHAPE` 等工具(共 8 个)会**全部移除**, 不保留兼容层。
原因: 矢量画布与图像画布的数据模型完全不同, 兼容层会让系统状态混乱。

### 11.2 风格市场保留方式

保留 3 个风格 (CYBER_PUNK / VAN_GOGH / OBSIDIAN) 作为 **prompt 后缀模板**:
- 用户切到梵高风格 → 后续 `canvas.generate_*` 自动追加 "in Van Gogh oil painting style, expressive brushstrokes"
- 切到赛博朋克 → "cyberpunk neon, blade runner aesthetic, rainy night"
- 切到黑曜石 → "dark obsidian texture, minimalist, low-key lighting"

### 11.3 ASR / VAD / Voice Orb / TTS 全部保留

这是产品差异化, 一字不动。
