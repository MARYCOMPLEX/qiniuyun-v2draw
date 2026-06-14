/**
 * diagram.* 工具集 zod schema — 3 个原生 SVG 矢量图工具。
 *
 * 替代 drawio.* 命名空间，LLM 直接输出 SVG 而非 mxCell XML：
 * - diagram.display: 全图重画（完整 <svg> 标签）
 * - diagram.edit: 按 element_id 操作 <g id="X"> 块
 * - diagram.append: 续传被截断的 SVG 片段
 *
 * 与 drawio.* 并行存在，旧格式数据仍走 drawio 路径。
 */

import { z } from "zod";

export const DIAGRAM_TOOL = {
  DISPLAY: "diagram.display",
  EDIT: "diagram.edit",
  APPEND: "diagram.append",
} as const;

export type DiagramToolName = (typeof DIAGRAM_TOOL)[keyof typeof DIAGRAM_TOOL];

// ─── diagram.display ──────────────────────────

const displayDiagramCmd = z.object({
  tool: z.literal(DIAGRAM_TOOL.DISPLAY),
  svg: z.string().min(1).max(120_000),
});

// ─── diagram.edit ──────────────────────────

const editOperationSchema = z.object({
  operation: z.enum(["update", "add", "delete"]),
  element_id: z.string().min(1),
  new_svg: z.string().optional(),
});

const editDiagramCmd = z.object({
  tool: z.literal(DIAGRAM_TOOL.EDIT),
  operations: z.array(editOperationSchema).min(1).max(20),
});

// ─── diagram.append ──────────────────────────

const appendDiagramCmd = z.object({
  tool: z.literal(DIAGRAM_TOOL.APPEND),
  svg: z.string().min(1).max(120_000),
});

// ─── 顶层 union ──────────────────────────

export const diagramCommandSchema = z.discriminatedUnion("tool", [
  displayDiagramCmd,
  editDiagramCmd,
  appendDiagramCmd,
]);

export const diagramCommandSchemas = {
  displayDiagramCmd,
  editDiagramCmd,
  appendDiagramCmd,
} as const;

export type DiagramCommand = z.infer<typeof diagramCommandSchema>;
export type DisplaySvgCommand = z.infer<typeof displayDiagramCmd>;
export type EditSvgCommand = z.infer<typeof editDiagramCmd>;
export type AppendSvgCommand = z.infer<typeof appendDiagramCmd>;
export type SvgEditOperation = z.infer<typeof editOperationSchema>;

// ─── 类型守卫 ──────────────────────────

export const isDisplaySvg = (c: DiagramCommand): c is DisplaySvgCommand =>
  c.tool === DIAGRAM_TOOL.DISPLAY;
export const isEditSvg = (c: DiagramCommand): c is EditSvgCommand =>
  c.tool === DIAGRAM_TOOL.EDIT;
export const isAppendSvg = (c: DiagramCommand): c is AppendSvgCommand =>
  c.tool === DIAGRAM_TOOL.APPEND;

export const isDiagramTool = (toolName: string): toolName is DiagramToolName =>
  toolName.startsWith("diagram.");
