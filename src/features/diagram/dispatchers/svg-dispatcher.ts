/**
 * diagram.* 工具 dispatcher — 把 LLM 的 SVG 命令应用到 DiagramContext。
 *
 * 与 drawio-dispatcher 并行存在：
 * - diagram.display: 全图替换，直接存入 SVG 字符串
 * - diagram.edit: 按 element_id 操作 <g id="X"> 块
 * - diagram.append: 在 </svg> 前插入续传片段
 */

import { extractCompleteSvgGroups } from "../utils/svgUtils";
import type {
  AppendSvgCommand,
  DisplaySvgCommand,
  EditSvgCommand,
  SvgEditOperation,
} from "@/shared/types/diagram-tools";

export interface DispatchContext {
  readonly chartXML: string;
  readonly loadDiagram: (xml: string) => string | null;
}

/**
 * diagram.display: 全图替换为 LLM 输出的完整 SVG。
 * 流式中调用时，用 extractCompleteSvgGroups 只渲染已闭合的部分。
 */
export function applyDisplaySvg(
  command: DisplaySvgCommand,
  ctx: DispatchContext,
  options?: { isStreaming?: boolean },
): void {
  const rawSvg = command.svg ?? "";
  const source = options?.isStreaming
    ? extractCompleteSvgGroups(rawSvg)
    : rawSvg;
  if (!source.trim()) return;
  ctx.loadDiagram(source);
}

/**
 * diagram.edit: 按 element_id 逐条增删改 SVG 中的 <g id="X"> 块。
 */
export function applyEditSvg(
  command: EditSvgCommand,
  ctx: DispatchContext,
): void {
  let svg = ctx.chartXML ?? "";
  if (!svg.trim()) {
    // 画布空，edit 中的 add 操作退化为 display
    const adds = command.operations
      .filter((op) => op.operation === "add" && op.new_svg)
      .map((op) => op.new_svg as string)
      .join("\n");
    if (adds) {
      ctx.loadDiagram(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">${adds}</svg>`,
      );
    }
    return;
  }

  for (const op of command.operations) {
    svg = applySvgOperation(svg, op);
  }
  ctx.loadDiagram(svg);
}

/**
 * diagram.append: 在当前 SVG 的 </svg> 前插入续传片段。
 */
export function applyAppendSvg(
  command: AppendSvgCommand,
  ctx: DispatchContext,
): void {
  const rawSvg = command.svg ?? "";
  const current = ctx.chartXML ?? "";

  if (!current.trim()) {
    ctx.loadDiagram(rawSvg);
    return;
  }

  const insertPoint = current.lastIndexOf("</svg>");
  if (insertPoint === -1) {
    ctx.loadDiagram(rawSvg);
    return;
  }

  const merged = current.slice(0, insertPoint) + rawSvg + current.slice(insertPoint);
  ctx.loadDiagram(merged);
}

// ─── 内部工具函数 ────────────────────────────

function applySvgOperation(svg: string, op: SvgEditOperation): string {
  if (!op || typeof op.element_id !== "string" || op.element_id.length === 0) {
    return svg;
  }

  const escapedId = escapeRegex(op.element_id);
  // 匹配 <g id="X">...</g>（含嵌套 <g>）
  const groupPattern = new RegExp(
    `<g\\s+[^>]*\\bid=["']${escapedId}["'][^>]*>[\\s\\S]*?<\\/g>`,
    "g",
  );

  switch (op.operation) {
    case "delete":
      return svg.replace(groupPattern, "");
    case "update":
      if (!op.new_svg) return svg;
      return svg.replace(groupPattern, op.new_svg);
    case "add":
      if (!op.new_svg) return svg;
      // add：如果已存在则替换，否则在 </svg> 前插入
      if (groupPattern.test(svg)) {
        groupPattern.lastIndex = 0;
        return svg.replace(groupPattern, op.new_svg);
      }
      const insertPoint = svg.lastIndexOf("</svg>");
      if (insertPoint === -1) return svg + op.new_svg;
      return svg.slice(0, insertPoint) + op.new_svg + svg.slice(insertPoint);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
