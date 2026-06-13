/**
 * 多模态画布工具集 zod schema (新协议) — 27 工具:
 *   19 业务 (canvas.*) + 8 平台 (platform.*)。
 *
 * 这个文件跟 schema.ts (旧矢量画布) 平行存在, PR-A 阶段只新增不删除。
 * PR-D 接通后端流式后会让旧 schema.ts 退出, 此文件成为唯一 schema 入口。
 *
 * 见 docs/protocols/multimodal-canvas.md。
 */

import { z } from "zod";

import { CANVAS_TOOL, PLATFORM_TOOL } from "./tools";

// ─── 共用基本类型 ──────────────────────────────

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const sizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

const maskPolygonSchema = z.object({
  polygon: z.array(positionSchema).min(3).max(64),
});

// ─── canvas.* 业务工具 (19) ───────────────────

const generateImageCmd = z.object({
  tool: z.literal(CANVAS_TOOL.GENERATE_IMAGE),
  prompt: z.string().min(1).max(2000),
  negativePrompt: z.string().max(1000).optional(),
  position: positionSchema.optional(),
  size: sizeSchema.optional(),
  style: z.string().max(200).optional(),
  modelId: z.string().optional(),
});

const generateBackgroundCmd = z.object({
  tool: z.literal(CANVAS_TOOL.GENERATE_BACKGROUND),
  prompt: z.string().min(1).max(2000),
  mood: z.string().max(100).optional(),
});

const generateCharacterCmd = z.object({
  tool: z.literal(CANVAS_TOOL.GENERATE_CHARACTER),
  prompt: z.string().min(1).max(2000),
  position: positionSchema.optional(),
  transparentBg: z.boolean().default(true),
});

const generateVariationsCmd = z.object({
  tool: z.literal(CANVAS_TOOL.GENERATE_VARIATIONS),
  prompt: z.string().min(1).max(2000),
  count: z.number().int().min(2).max(4),
});

const generateReferenceComposeCmd = z.object({
  tool: z.literal(CANVAS_TOOL.GENERATE_REFERENCE_COMPOSE),
  prompt: z.string().min(1).max(2000),
  referenceLayerIds: z.array(z.string()).min(1).max(4),
});

const editImageCmd = z.object({
  tool: z.literal(CANVAS_TOOL.EDIT_IMAGE),
  targetLayerId: z.string(),
  prompt: z.string().min(1).max(2000),
  strength: z.number().min(0.1).max(0.9).default(0.5),
});

const inpaintLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.INPAINT_LAYER),
  targetLayerId: z.string(),
  maskPolygon: maskPolygonSchema,
  replacePrompt: z.string().min(1).max(2000),
});

const outpaintLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.OUTPAINT_LAYER),
  targetLayerId: z.string(),
  direction: z.enum(["top", "bottom", "left", "right", "all"]),
  prompt: z.string().max(2000).optional(),
});

const styleTransferCmd = z.object({
  tool: z.literal(CANVAS_TOOL.STYLE_TRANSFER),
  targetLayerId: z.string(),
  stylePrompt: z.string().min(1).max(500),
});

const removeBackgroundCmd = z.object({
  tool: z.literal(CANVAS_TOOL.REMOVE_BACKGROUND),
  targetLayerId: z.string(),
});

const upscaleLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.UPSCALE_LAYER),
  targetLayerId: z.string(),
  scale: z.union([z.literal(2), z.literal(4)]),
});

const moveLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.MOVE_LAYER),
  targetLayerId: z.string(),
  to: positionSchema.optional(),
  delta: z
    .object({ dx: z.number().finite(), dy: z.number().finite() })
    .optional(),
});

const resizeLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.RESIZE_LAYER),
  targetLayerId: z.string(),
  size: sizeSchema.optional(),
  scale: z.number().positive().optional(),
});

const rotateLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.ROTATE_LAYER),
  targetLayerId: z.string(),
  degrees: z.number().finite(),
});

const setLayerPropsCmd = z.object({
  tool: z.literal(CANVAS_TOOL.SET_LAYER_PROPS),
  targetLayerId: z.string(),
  opacity: z.number().min(0).max(1).optional(),
  zIndex: z.number().int().optional(),
});

const arrangeLayersCmd = z.object({
  tool: z.literal(CANVAS_TOOL.ARRANGE_LAYERS),
  pattern: z.enum(["grid", "row", "column", "radial"]),
  layerIds: z.array(z.string()).min(2),
});

const deleteLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.DELETE_LAYER),
  targetLayerId: z.string(),
});

const clearCanvasCmd = z.object({
  tool: z.literal(CANVAS_TOOL.CLEAR_CANVAS),
});

const regenerateLayerCmd = z.object({
  tool: z.literal(CANVAS_TOOL.REGENERATE_LAYER),
  targetLayerId: z.string(),
  feedback: z.string().max(500).optional(),
});

const undoCmd = z.object({
  tool: z.literal(CANVAS_TOOL.UNDO),
  steps: z.number().int().min(1).max(20).default(1),
});

// ─── platform.* 平台工具 (8) ──────────────────

const setThemeCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.SET_THEME),
  themeId: z.string().min(1),
});

const openPanelCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.OPEN_PANEL),
  panelId: z.enum(["capabilities", "history", "left_sidebar"]),
});

const closePanelCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.CLOSE_PANEL),
  panelId: z.enum(["capabilities", "history", "left_sidebar"]),
});

const toggleVoiceCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.TOGGLE_VOICE),
  enabled: z.boolean().optional(),
});

const toggleTtsCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.TOGGLE_TTS),
  enabled: z.boolean().optional(),
});

const toggleGridCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.TOGGLE_GRID),
  enabled: z.boolean().optional(),
});

const zoomCanvasCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.ZOOM_CANVAS),
  mode: z.enum(["fit", "actual"]).optional(),
  delta: z.number().optional(),
});

const panCanvasCmd = z.object({
  tool: z.literal(PLATFORM_TOOL.PAN_CANVAS),
  to: positionSchema.optional(),
  delta: z
    .object({ dx: z.number().finite(), dy: z.number().finite() })
    .optional(),
});

// ─── 顶层 envelope ────────────────────────────

export const canvasCommandSchema = z.discriminatedUnion("tool", [
  generateImageCmd,
  generateBackgroundCmd,
  generateCharacterCmd,
  generateVariationsCmd,
  generateReferenceComposeCmd,
  editImageCmd,
  inpaintLayerCmd,
  outpaintLayerCmd,
  styleTransferCmd,
  removeBackgroundCmd,
  upscaleLayerCmd,
  moveLayerCmd,
  resizeLayerCmd,
  rotateLayerCmd,
  setLayerPropsCmd,
  arrangeLayersCmd,
  deleteLayerCmd,
  clearCanvasCmd,
  regenerateLayerCmd,
  undoCmd,
  setThemeCmd,
  openPanelCmd,
  closePanelCmd,
  toggleVoiceCmd,
  toggleTtsCmd,
  toggleGridCmd,
  zoomCanvasCmd,
  panCanvasCmd,
]);

export const canvasEnvelopeSchema = z.object({
  commands: z.array(canvasCommandSchema).min(1).max(8),
  narration: z.string().max(200).optional(),
});

export type CanvasCommand = z.infer<typeof canvasCommandSchema>;
export type CanvasEnvelope = z.infer<typeof canvasEnvelopeSchema>;

// ─── 单条命令类型导出 ─────────────────────────

export type GenerateImageCommand = z.infer<typeof generateImageCmd>;
export type GenerateBackgroundCommand = z.infer<typeof generateBackgroundCmd>;
export type GenerateCharacterCommand = z.infer<typeof generateCharacterCmd>;
export type GenerateVariationsCommand = z.infer<typeof generateVariationsCmd>;
export type GenerateReferenceComposeCommand = z.infer<typeof generateReferenceComposeCmd>;
export type EditImageCommand = z.infer<typeof editImageCmd>;
export type InpaintLayerCommand = z.infer<typeof inpaintLayerCmd>;
export type OutpaintLayerCommand = z.infer<typeof outpaintLayerCmd>;
export type StyleTransferCommand = z.infer<typeof styleTransferCmd>;
export type RemoveBackgroundCommand = z.infer<typeof removeBackgroundCmd>;
export type UpscaleLayerCommand = z.infer<typeof upscaleLayerCmd>;
export type MoveLayerCommand = z.infer<typeof moveLayerCmd>;
export type ResizeLayerCommand = z.infer<typeof resizeLayerCmd>;
export type RotateLayerCommand = z.infer<typeof rotateLayerCmd>;
export type SetLayerPropsCommand = z.infer<typeof setLayerPropsCmd>;
export type ArrangeLayersCommand = z.infer<typeof arrangeLayersCmd>;
export type DeleteLayerCommand = z.infer<typeof deleteLayerCmd>;
export type ClearCanvasCommand = z.infer<typeof clearCanvasCmd>;
export type RegenerateLayerCommand = z.infer<typeof regenerateLayerCmd>;
export type UndoCommand = z.infer<typeof undoCmd>;

export type SetThemeCommand = z.infer<typeof setThemeCmd>;
export type OpenPanelCommand = z.infer<typeof openPanelCmd>;
export type ClosePanelCommand = z.infer<typeof closePanelCmd>;
export type ToggleVoiceCommand = z.infer<typeof toggleVoiceCmd>;
export type ToggleTtsCommand = z.infer<typeof toggleTtsCmd>;
export type ToggleGridCommand = z.infer<typeof toggleGridCmd>;
export type ZoomCanvasCommand = z.infer<typeof zoomCanvasCmd>;
export type PanCanvasCommand = z.infer<typeof panCanvasCmd>;

/**
 * 流式中间态 — partial JSON 在每一帧都不完整。
 */
export type PartialCanvasEnvelope = {
  commands?: Array<Partial<CanvasCommand> & { tool?: string }>;
  narration?: string;
};
