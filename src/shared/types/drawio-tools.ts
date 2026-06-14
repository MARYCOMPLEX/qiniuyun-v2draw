/**
 * drawio 工具集 zod schema — 4 个工具, 抄自 next-ai-draw-io/app/api/chat/route.ts。
 *
 * 这些工具跟现有的 canvas.* / platform.* 命名空间并行存在:
 * - drawio.display_diagram: 全图重画 (display 模式)
 * - drawio.edit_diagram: ID 操作 (update/add/delete cell)
 * - drawio.append_diagram: 续传被截断的 XML
 * - drawio.get_shape_library: 查 shape library 文档 (AWS / K8s 等)
 *
 * 命名空间 "drawio.*" 让 LLM 决策时清楚: 这是矢量信息图工具, 跟 canvas.generate_image
 * (图像) / platform.set_theme (UI) 区分开来。
 *
 * 见 docs/protocols/multimodal-canvas.md。
 */

import { z } from "zod";

export const DRAWIO_TOOL = {
  DISPLAY_DIAGRAM: "drawio.display_diagram",
  EDIT_DIAGRAM: "drawio.edit_diagram",
  APPEND_DIAGRAM: "drawio.append_diagram",
  GET_SHAPE_LIBRARY: "drawio.get_shape_library",
} as const;

export type DrawioToolName = (typeof DRAWIO_TOOL)[keyof typeof DRAWIO_TOOL];

// ─── display_diagram ──────────────────────────

const displayDiagramCmd = z.object({
  tool: z.literal(DRAWIO_TOOL.DISPLAY_DIAGRAM),
  /** 完整的 mxCell 列表 (不含 mxfile/mxGraphModel/root 包装), 前端自动补包装 */
  xml: z.string().min(1).max(60_000),
});

// ─── edit_diagram ──────────────────────────

const editOperationSchema = z.object({
  operation: z.enum(["update", "add", "delete"]),
  cell_id: z.string().min(1),
  /** update/add 必填 (完整 mxCell XML), delete 不需要 */
  new_xml: z.string().optional(),
});

const editDiagramCmd = z.object({
  tool: z.literal(DRAWIO_TOOL.EDIT_DIAGRAM),
  operations: z.array(editOperationSchema).min(1).max(20),
});

// ─── append_diagram ──────────────────────────

const appendDiagramCmd = z.object({
  tool: z.literal(DRAWIO_TOOL.APPEND_DIAGRAM),
  /** 续传的 mxCell 片段 — 上次 display_diagram 因 token 限制被截断时调用 */
  xml: z.string().min(1).max(60_000),
});

// ─── get_shape_library ──────────────────────────

/**
 * 支持的 shape library 名 — 跟 docs/shape-libraries/*.md 一一对应。
 * voice-canvas 初期精简到 4 个 (基础) + AWS/K8s/Azure (云架构常用)。
 * 完整 31 个见 next-ai-draw-io。
 */
export const SHAPE_LIBRARIES = [
  "flowchart",
  "basic",
  "arrows2",
  "network",
  "aws4",
  "azure2",
  "gcp2",
  "kubernetes",
  "bpmn",
] as const;

const getShapeLibraryCmd = z.object({
  tool: z.literal(DRAWIO_TOOL.GET_SHAPE_LIBRARY),
  library: z.enum(SHAPE_LIBRARIES),
});

// ─── 顶层 union ──────────────────────────

export const drawioCommandSchema = z.discriminatedUnion("tool", [
  displayDiagramCmd,
  editDiagramCmd,
  appendDiagramCmd,
  getShapeLibraryCmd,
]);

/** 单条 drawio 命令的内部 cmd schemas — 给统一 union 拼接用 */
export const drawioCommandSchemas = {
  displayDiagramCmd,
  editDiagramCmd,
  appendDiagramCmd,
  getShapeLibraryCmd,
} as const;

export type DrawioCommand = z.infer<typeof drawioCommandSchema>;
export type DisplayDiagramCommand = z.infer<typeof displayDiagramCmd>;
export type EditDiagramCommand = z.infer<typeof editDiagramCmd>;
export type AppendDiagramCommand = z.infer<typeof appendDiagramCmd>;
export type GetShapeLibraryCommand = z.infer<typeof getShapeLibraryCmd>;
export type DiagramOperation = z.infer<typeof editOperationSchema>;

// ─── 类型守卫 ──────────────────────────

export const isDisplayDiagram = (c: DrawioCommand): c is DisplayDiagramCommand =>
  c.tool === DRAWIO_TOOL.DISPLAY_DIAGRAM;
export const isEditDiagram = (c: DrawioCommand): c is EditDiagramCommand =>
  c.tool === DRAWIO_TOOL.EDIT_DIAGRAM;
export const isAppendDiagram = (c: DrawioCommand): c is AppendDiagramCommand =>
  c.tool === DRAWIO_TOOL.APPEND_DIAGRAM;
export const isGetShapeLibrary = (c: DrawioCommand): c is GetShapeLibraryCommand =>
  c.tool === DRAWIO_TOOL.GET_SHAPE_LIBRARY;

export const isDrawioTool = (toolName: string): toolName is DrawioToolName =>
  toolName.startsWith("drawio.");
