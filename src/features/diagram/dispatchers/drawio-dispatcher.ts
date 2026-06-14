/**
 * drawio 3 工具 dispatcher — 把 LLM 流式命令应用到 DiagramContext。
 *
 * 设计要点 (借鉴 next-ai-draw-io/hooks/use-diagram-tool-handlers.ts):
 * - display_diagram: 全图替换, wrapWithMxFile + loadDiagram
 * - edit_diagram: ID 操作, 解析当前 chartXML 后逐条 update/add/delete
 * - append_diagram: 续传, 累加到当前 chartXML 末尾
 */

import {
  extractCompleteMxCells,
  replaceNodes,
  wrapWithMxFile,
} from "../utils/mxCellUtils";
import type {
  AppendDiagramCommand,
  DiagramOperation,
  DisplayDiagramCommand,
  EditDiagramCommand,
} from "@/shared/types/drawio-tools";

export interface DispatchContext {
  /** 当前 chartXML, 由 DiagramContext 提供 */
  readonly chartXML: string;
  /** 加载新 XML 到 iframe + 更新 chartXML state */
  readonly loadDiagram: (xml: string) => string | null;
}

/**
 * display_diagram: 接收 LLM 输出的 mxCell 列表, 包成 mxfile 后整图替换。
 * 流式中调用时, command.xml 可能是 partial, 用 extractCompleteMxCells 只取闭合元素。
 */
export function applyDisplayDiagram(
  command: DisplayDiagramCommand,
  ctx: DispatchContext,
  options?: { isStreaming?: boolean },
): void {
  const rawXml = command.xml ?? "";
  const sourceXml = options?.isStreaming
    ? extractCompleteMxCells(rawXml)
    : rawXml;
  if (!sourceXml.trim()) return;
  const fullXml = wrapWithMxFile(sourceXml);
  ctx.loadDiagram(fullXml);
}

/**
 * edit_diagram: 按 cell_id 逐条增删改。
 *
 * 简化策略:
 * - update / add: 用正则替换或追加目标 cell_id 的 mxCell
 * - delete: 删除目标 cell_id 的 mxCell
 *
 * 局限: 此实现假设 cell_id 在 mxCell 标签的 id 属性, 不处理嵌套引用 (source/target)。
 * 后续可扩展为完整 XML AST 解析。
 */
export function applyEditDiagram(
  command: EditDiagramCommand,
  ctx: DispatchContext,
): void {
  let xml = ctx.chartXML ?? "";
  if (!xml.trim()) {
    // 画布空, edit 退化为 display (取 add 操作的 new_xml)
    const adds = command.operations
      .filter((op) => op.operation === "add" && op.new_xml)
      .map((op) => op.new_xml as string)
      .join("\n");
    if (adds) ctx.loadDiagram(wrapWithMxFile(adds));
    return;
  }

  for (const op of command.operations) {
    xml = applySingleOperation(xml, op);
  }
  ctx.loadDiagram(xml);
}

/**
 * append_diagram: 累加 mxCell 到当前 chartXML 的 root。
 * 用于 LLM 输出被截断后的续传 (display_diagram 没说完, 接着补)。
 */
export function applyAppendDiagram(
  command: AppendDiagramCommand,
  ctx: DispatchContext,
): void {
  const rawXml = command.xml ?? "";
  const chartXml = ctx.chartXML ?? "";
  if (!chartXml.trim()) {
    ctx.loadDiagram(wrapWithMxFile(rawXml));
    return;
  }
  // 提取当前 root 内容 + 追加新 mxCell
  const currentNodes = extractCellsFromMxFile(chartXml);
  const merged = `${currentNodes}\n${rawXml}`;
  ctx.loadDiagram(replaceNodes(chartXml, merged));
}

// ─── 内部工具函数 ────────────────────────────

/**
 * 应用单条 edit 操作到 XML。
 *
 * 防御: cell_id 缺失 / 空字符串时跳过, 避免 escapeRegex(undefined) 炸 runtime。
 * (isCommandComplete 已经守在外层, 这里是双保险, 防止未来代码路径绕过)
 */
function applySingleOperation(xml: string, op: DiagramOperation): string {
  if (!op || typeof op.cell_id !== "string" || op.cell_id.length === 0) {
    return xml;
  }
  const idPattern = new RegExp(
    `<mxCell\\s+[^>]*\\bid=["']${escapeRegex(op.cell_id)}["'][^>]*(?:\\/>|><\\/mxCell>|>[\\s\\S]*?<\\/mxCell>)`,
    "g",
  );

  switch (op.operation) {
    case "delete":
      return xml.replace(idPattern, "");
    case "update":
      if (!op.new_xml) return xml;
      return xml.replace(idPattern, op.new_xml);
    case "add":
      if (!op.new_xml) return xml;
      // add 操作: 如果已存在则替换, 否则追加到 root 内
      if (idPattern.test(xml)) {
        idPattern.lastIndex = 0;
        return xml.replace(idPattern, op.new_xml);
      }
      idPattern.lastIndex = 0;
      // 在 </root> 前插入
      return xml.replace(/<\/root>/, `${op.new_xml}</root>`);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 从已包好的 mxfile 中提取 mxCell 节点列表 (跳过 root cells id 0/1)。
 */
function extractCellsFromMxFile(xml: string): string {
  const rootStart = xml.indexOf("<root>");
  const rootEnd = xml.indexOf("</root>");
  if (rootStart === -1 || rootEnd === -1) return "";
  const rootContent = xml.slice(rootStart + 6, rootEnd);
  // 去掉 root cells id="0" / id="1"
  return rootContent
    .replace(/<mxCell[^>]*\bid=["']0["'][^>]*(?:\/>|><\/mxCell>)/g, "")
    .replace(/<mxCell[^>]*\bid=["']1["'][^>]*(?:\/>|><\/mxCell>)/g, "")
    .trim();
}
