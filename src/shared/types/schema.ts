import { z } from "zod";

/**
 * 多工具命令集 — 单一可信来源 (Single Source of Truth)。
 * Why: 第一代 ATOMIC_SHAPE 一次只能画一个原子图形, 体感"low"。新一代把工具集
 * 升级为命令数组, LLM 一次回复内可同时下发"创建多个 / 修改某个 / 删除某个 /
 * 清空 / 切风格", 让"画三个递增大小的圆排成一行"这类指令成为一阶可表达。
 */
export const COMMAND_TYPE = {
  CREATE_SHAPES: "CREATE_SHAPES",
  MODIFY_SHAPE: "MODIFY_SHAPE",
  DELETE_SHAPE: "DELETE_SHAPE",
  CLEAR_CANVAS: "CLEAR_CANVAS",
  STYLE_TRANSFORM: "STYLE_TRANSFORM",
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
  id: z.string().min(1).describe("画布唯一 ID, 用于后续 modify/delete"),
  shape: z.enum([SHAPE_KIND.CIRCLE, SHAPE_KIND.RECTANGLE, SHAPE_KIND.LINE]),
  position: positionSchema,
  size: z.number().nonnegative(),
  useAccentColor: z.boolean().describe("true 用风格 accent, false 用 stroke"),
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

const drawCommandSchema = z.discriminatedUnion("commandType", [
  createShapesCommand,
  modifyShapeCommand,
  deleteShapeCommand,
  clearCanvasCommand,
  styleTransformCommand,
]);

/**
 * LLM 单次回复的顶层契约。
 * Why: 用 commands[] 替代单 tool, 避免每次只能下一条指令的瓶颈。
 * narration 给前端在对话面板做一句话总结展示, 不影响画布。
 */
export const drawToolSchema = z.object({
  commands: z.array(drawCommandSchema).min(1).max(8),
  narration: z.string().max(200).optional().describe("对用户的一句中文反馈, 不要超过 30 字"),
});

export type DrawToolEnvelope = z.infer<typeof drawToolSchema>;
export type DrawCommand = z.infer<typeof drawCommandSchema>;
export type CreateShapesCommand = z.infer<typeof createShapesCommand>;
export type ModifyShapeCommand = z.infer<typeof modifyShapeCommand>;
export type DeleteShapeCommand = z.infer<typeof deleteShapeCommand>;
export type ClearCanvasCommand = z.infer<typeof clearCanvasCommand>;
export type StyleTransformCommand = z.infer<typeof styleTransformCommand>;
export type ShapeBlueprint = z.infer<typeof shapeBlueprintSchema>;
export type ShapePatch = z.infer<typeof shapePatchSchema>;

export const isCreateShapes = (c: DrawCommand): c is CreateShapesCommand =>
  c.commandType === COMMAND_TYPE.CREATE_SHAPES;
export const isModifyShape = (c: DrawCommand): c is ModifyShapeCommand =>
  c.commandType === COMMAND_TYPE.MODIFY_SHAPE;
export const isDeleteShape = (c: DrawCommand): c is DeleteShapeCommand =>
  c.commandType === COMMAND_TYPE.DELETE_SHAPE;
export const isClearCanvas = (c: DrawCommand): c is ClearCanvasCommand =>
  c.commandType === COMMAND_TYPE.CLEAR_CANVAS;
export const isStyleTransform = (c: DrawCommand): c is StyleTransformCommand =>
  c.commandType === COMMAND_TYPE.STYLE_TRANSFORM;

/**
 * 流式中间态 — partial JSON 在每一帧都不完整。
 * Why: 显式建模半成品, 避免 hook 里到处 `?.` 兜底。
 */
export type PartialDrawTool = {
  commands?: Array<Partial<DrawCommand> & { commandType?: DrawCommand["commandType"] }>;
  narration?: string;
};
