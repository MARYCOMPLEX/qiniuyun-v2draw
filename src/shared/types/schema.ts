import { z } from "zod";

/**
 * 多工具命令集 — 单一可信来源 (Single Source of Truth)。
 *
 * 8 个细粒度工具, 借鉴 next-ai-drawio 的工具拆分思想:
 * - CREATE_SHAPES: 一次创建多个图元 (基础)
 * - MODIFY_SHAPE: 改某图元任意属性 (通用 patch)
 * - MOVE_SHAPE: 专门移动 (相对/绝对位移, 比 MODIFY 更精确)
 * - RESIZE_SHAPE: 专门缩放 (倍率/绝对值, 比 MODIFY 更精确)
 * - DELETE_SHAPE: 删一个
 * - CLEAR_CANVAS: 清空
 * - STYLE_TRANSFORM: 切风格 (副作用通道)
 * - BATCH_TRANSFORM: 批量改一组图元 (按 id 数组或筛选)
 *
 * Why 拆细: LLM 选择"专用工具"比"用通用工具填字段"更准, 也更容易在 prompt 里给示例。
 */
export const COMMAND_TYPE = {
  CREATE_SHAPES: "CREATE_SHAPES",
  MODIFY_SHAPE: "MODIFY_SHAPE",
  MOVE_SHAPE: "MOVE_SHAPE",
  RESIZE_SHAPE: "RESIZE_SHAPE",
  DELETE_SHAPE: "DELETE_SHAPE",
  CLEAR_CANVAS: "CLEAR_CANVAS",
  STYLE_TRANSFORM: "STYLE_TRANSFORM",
  BATCH_TRANSFORM: "BATCH_TRANSFORM",
} as const;

export const SHAPE_KIND = {
  CIRCLE: "circle",
  RECTANGLE: "rectangle",
  LINE: "line",
} as const;

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const shapeBlueprintSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "Shape id. For NEW shapes, leave empty or use 'new-N' — frontend assigns real id. For modifying existing, MUST match an id from canvasState.",
    ),
  shape: z.enum([SHAPE_KIND.CIRCLE, SHAPE_KIND.RECTANGLE, SHAPE_KIND.LINE]),
  position: positionSchema,
  size: z.number().nonnegative(),
  useAccentColor: z.boolean().describe("true → use style.accent, false → use style.stroke"),
});

const shapePatchSchema = z.object({
  position: positionSchema.optional(),
  size: z.number().nonnegative().optional(),
  useAccentColor: z.boolean().optional(),
  shape: z.enum([SHAPE_KIND.CIRCLE, SHAPE_KIND.RECTANGLE, SHAPE_KIND.LINE]).optional(),
});

const createShapesCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.CREATE_SHAPES),
  activeStyleId: z.string().min(1),
  shapes: z.array(shapeBlueprintSchema).min(1).max(16),
});

const modifyShapeCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.MODIFY_SHAPE),
  targetId: z.string().min(1),
  patch: shapePatchSchema,
});

const moveShapeCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.MOVE_SHAPE),
  targetId: z.string().min(1),
  /** 绝对位置 (优先) 或相对位移 (delta) — 至少一个 */
  to: positionSchema.optional(),
  delta: z
    .object({ dx: z.number().finite(), dy: z.number().finite() })
    .optional()
    .describe("Relative offset, e.g. {dx: 50, dy: 0} = move 50px right"),
});

const resizeShapeCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.RESIZE_SHAPE),
  targetId: z.string().min(1),
  /** 绝对尺寸 (优先) 或缩放倍率 — 至少一个 */
  size: z.number().nonnegative().optional(),
  scale: z
    .number()
    .positive()
    .optional()
    .describe("Multiplier, e.g. 1.5 = bigger by 50%, 0.8 = smaller to 80%"),
});

const deleteShapeCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.DELETE_SHAPE),
  targetId: z.string().min(1),
});

const clearCanvasCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.CLEAR_CANVAS),
});

const styleTransformCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.STYLE_TRANSFORM),
  activeStyleId: z.string().min(1),
});

const batchTransformCommand = z.object({
  commandType: z.literal(COMMAND_TYPE.BATCH_TRANSFORM),
  /** id 数组 (优先) 或按 shape kind 筛选 */
  targetIds: z.array(z.string()).optional(),
  filterShape: z.enum([SHAPE_KIND.CIRCLE, SHAPE_KIND.RECTANGLE, SHAPE_KIND.LINE]).optional(),
  patch: shapePatchSchema,
});

const drawCommandSchema = z.discriminatedUnion("commandType", [
  createShapesCommand,
  modifyShapeCommand,
  moveShapeCommand,
  resizeShapeCommand,
  deleteShapeCommand,
  clearCanvasCommand,
  styleTransformCommand,
  batchTransformCommand,
]);

/**
 * LLM 单次回复的顶层契约。
 */
export const drawToolSchema = z.object({
  commands: z.array(drawCommandSchema).min(1).max(8),
  narration: z.string().max(200).optional().describe("一句中文反馈, 不超过 30 字"),
});

export type DrawToolEnvelope = z.infer<typeof drawToolSchema>;
export type DrawCommand = z.infer<typeof drawCommandSchema>;
export type CreateShapesCommand = z.infer<typeof createShapesCommand>;
export type ModifyShapeCommand = z.infer<typeof modifyShapeCommand>;
export type MoveShapeCommand = z.infer<typeof moveShapeCommand>;
export type ResizeShapeCommand = z.infer<typeof resizeShapeCommand>;
export type DeleteShapeCommand = z.infer<typeof deleteShapeCommand>;
export type ClearCanvasCommand = z.infer<typeof clearCanvasCommand>;
export type StyleTransformCommand = z.infer<typeof styleTransformCommand>;
export type BatchTransformCommand = z.infer<typeof batchTransformCommand>;
export type ShapeBlueprint = z.infer<typeof shapeBlueprintSchema>;
export type ShapePatch = z.infer<typeof shapePatchSchema>;

export const isCreateShapes = (c: DrawCommand): c is CreateShapesCommand =>
  c.commandType === COMMAND_TYPE.CREATE_SHAPES;
export const isModifyShape = (c: DrawCommand): c is ModifyShapeCommand =>
  c.commandType === COMMAND_TYPE.MODIFY_SHAPE;
export const isMoveShape = (c: DrawCommand): c is MoveShapeCommand =>
  c.commandType === COMMAND_TYPE.MOVE_SHAPE;
export const isResizeShape = (c: DrawCommand): c is ResizeShapeCommand =>
  c.commandType === COMMAND_TYPE.RESIZE_SHAPE;
export const isDeleteShape = (c: DrawCommand): c is DeleteShapeCommand =>
  c.commandType === COMMAND_TYPE.DELETE_SHAPE;
export const isClearCanvas = (c: DrawCommand): c is ClearCanvasCommand =>
  c.commandType === COMMAND_TYPE.CLEAR_CANVAS;
export const isStyleTransform = (c: DrawCommand): c is StyleTransformCommand =>
  c.commandType === COMMAND_TYPE.STYLE_TRANSFORM;
export const isBatchTransform = (c: DrawCommand): c is BatchTransformCommand =>
  c.commandType === COMMAND_TYPE.BATCH_TRANSFORM;

/** 流式中间态 — partial JSON 在每一帧都不完整。 */
export type PartialDrawTool = {
  commands?: Array<Partial<DrawCommand> & { commandType?: DrawCommand["commandType"] }>;
  narration?: string;
};
