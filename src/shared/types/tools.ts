/**
 * 工具命名空间 — 双层架构核心常量。
 *
 * 业务工具 (canvas.*): 只动 LayerMap, 不碰 UI 状态。
 * 平台工具 (platform.*): 只动 PlatformState, 不碰 layer 数据。
 *
 * Why: 平台级 OS 范本要求工具与业务严格解耦, 后续添加新能力都不会互相污染。
 * 见 docs/protocols/multimodal-canvas.md §1.2。
 */

export const CANVAS_TOOL = {
  // 生成类 (5 个, 异步)
  GENERATE_IMAGE: "canvas.generate_image",
  GENERATE_BACKGROUND: "canvas.generate_background",
  GENERATE_CHARACTER: "canvas.generate_character",
  GENERATE_VARIATIONS: "canvas.generate_variations",
  GENERATE_REFERENCE_COMPOSE: "canvas.generate_reference_compose",

  // 编辑类 (6 个, 异步)
  EDIT_IMAGE: "canvas.edit_image",
  INPAINT_LAYER: "canvas.inpaint_layer",
  OUTPAINT_LAYER: "canvas.outpaint_layer",
  STYLE_TRANSFER: "canvas.style_transfer",
  REMOVE_BACKGROUND: "canvas.remove_background",
  UPSCALE_LAYER: "canvas.upscale_layer",

  // 布局类 (5 个, 同步)
  MOVE_LAYER: "canvas.move_layer",
  RESIZE_LAYER: "canvas.resize_layer",
  ROTATE_LAYER: "canvas.rotate_layer",
  SET_LAYER_PROPS: "canvas.set_layer_props",
  ARRANGE_LAYERS: "canvas.arrange_layers",

  // 删除/组合 (2 个, 同步)
  DELETE_LAYER: "canvas.delete_layer",
  CLEAR_CANVAS: "canvas.clear_canvas",

  // 反馈类 (2 个)
  REGENERATE_LAYER: "canvas.regenerate_layer",
  UNDO: "canvas.undo",
} as const;

export const PLATFORM_TOOL = {
  SET_THEME: "platform.set_theme",
  OPEN_PANEL: "platform.open_panel",
  CLOSE_PANEL: "platform.close_panel",
  TOGGLE_VOICE: "platform.toggle_voice",
  TOGGLE_TTS: "platform.toggle_tts",
  TOGGLE_GRID: "platform.toggle_grid",
  ZOOM_CANVAS: "platform.zoom_canvas",
  PAN_CANVAS: "platform.pan_canvas",
} as const;

export type CanvasToolName = (typeof CANVAS_TOOL)[keyof typeof CANVAS_TOOL];
export type PlatformToolName = (typeof PLATFORM_TOOL)[keyof typeof PLATFORM_TOOL];
export type ToolName = CanvasToolName | PlatformToolName;

/** 哪些工具是异步 (需要走 job store + SSE) */
export const ASYNC_CANVAS_TOOLS: ReadonlySet<CanvasToolName> = new Set<CanvasToolName>([
  CANVAS_TOOL.GENERATE_IMAGE,
  CANVAS_TOOL.GENERATE_BACKGROUND,
  CANVAS_TOOL.GENERATE_CHARACTER,
  CANVAS_TOOL.GENERATE_VARIATIONS,
  CANVAS_TOOL.GENERATE_REFERENCE_COMPOSE,
  CANVAS_TOOL.EDIT_IMAGE,
  CANVAS_TOOL.INPAINT_LAYER,
  CANVAS_TOOL.OUTPAINT_LAYER,
  CANVAS_TOOL.STYLE_TRANSFER,
  CANVAS_TOOL.REMOVE_BACKGROUND,
  CANVAS_TOOL.UPSCALE_LAYER,
  CANVAS_TOOL.REGENERATE_LAYER,
]);

/** 哪些命令入历史栈 (用于 undo) */
export const HISTORY_TRACKED_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  ...Object.values(CANVAS_TOOL).filter((t) => t !== CANVAS_TOOL.UNDO),
  PLATFORM_TOOL.SET_THEME,
]);

export const isCanvasTool = (name: string): name is CanvasToolName =>
  name.startsWith("canvas.");

export const isPlatformTool = (name: string): name is PlatformToolName =>
  name.startsWith("platform.");

export const isAsyncTool = (name: string): boolean =>
  ASYNC_CANVAS_TOOLS.has(name as CanvasToolName);

export const isHistoryTracked = (name: string): boolean =>
  HISTORY_TRACKED_TOOLS.has(name as ToolName);
