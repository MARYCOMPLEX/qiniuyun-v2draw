import { z } from "zod";

/**
 * 工具类型常量 — 单一可信来源 (Single Source of Truth)。
 * Why: 用 const 对象代替散落的字符串字面量，避免 typo 导致的判别失败；
 * 也方便 toolDispatcher 与 schema 同步演进。
 */
export const TOOL_TYPE = {
  ATOMIC_SHAPE: "ATOMIC_SHAPE",
  DIFFUSION_MELT: "DIFFUSION_MELT",
  WEB_SEARCH: "WEB_SEARCH",
} as const;

export const SHAPE_KIND = {
  CIRCLE: "circle",
  RECTANGLE: "rectangle",
  LINE: "line",
} as const;

export const SHAPE_ACTION = {
  CREATE: "create",
  MODIFY: "modify",
  DELETE: "delete",
} as const;

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const atomicShapeSchema = z.object({
  toolType: z.literal(TOOL_TYPE.ATOMIC_SHAPE),
  action: z.enum([SHAPE_ACTION.CREATE, SHAPE_ACTION.MODIFY, SHAPE_ACTION.DELETE]),
  shape: z.enum([SHAPE_KIND.CIRCLE, SHAPE_KIND.RECTANGLE, SHAPE_KIND.LINE]),
  activeStyleId: z.string().min(1),
  useAccentColor: z.boolean(),
  position: positionSchema,
  size: z.number().nonnegative(),
});

const diffusionMeltSchema = z.object({
  toolType: z.literal(TOOL_TYPE.DIFFUSION_MELT),
  refinedPrompt: z.string().min(1),
});

const webSearchSchema = z.object({
  toolType: z.literal(TOOL_TYPE.WEB_SEARCH),
  searchQuery: z.string().min(1),
  targetLayerId: z.string().min(1),
});

/**
 * 多维 Discriminated Union — 大模型流式输出的工具契约。
 * Why: 统一以 `toolType` 作为判别键，保证 streamObject 在挤牙膏式补全时
 * 能在任意中间态被前端校验/降级，避免半成品对象击穿渲染层。
 */
export const drawToolSchema = z.discriminatedUnion("toolType", [
  atomicShapeSchema,
  diffusionMeltSchema,
  webSearchSchema,
]);

export type DrawTool = z.infer<typeof drawToolSchema>;
export type AtomicShapeTool = z.infer<typeof atomicShapeSchema>;
export type DiffusionMeltTool = z.infer<typeof diffusionMeltSchema>;
export type WebSearchTool = z.infer<typeof webSearchSchema>;

export const isAtomicShape = (tool: DrawTool): tool is AtomicShapeTool =>
  tool.toolType === TOOL_TYPE.ATOMIC_SHAPE;

export const isDiffusionMelt = (tool: DrawTool): tool is DiffusionMeltTool =>
  tool.toolType === TOOL_TYPE.DIFFUSION_MELT;

export const isWebSearch = (tool: DrawTool): tool is WebSearchTool =>
  tool.toolType === TOOL_TYPE.WEB_SEARCH;

/**
 * 流式中间态 — `streamObject` 在每一帧仅吐出 partial JSON。
 * Why: 显式建模"半成品"避免在 useObject 钩子里到处 `?.` 兜底。
 */
export type PartialDrawTool = Partial<DrawTool> & { toolType?: DrawTool["toolType"] };
