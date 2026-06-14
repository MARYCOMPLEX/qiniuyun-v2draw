/**
 * /api/generate-draw 的 canvasState 拼装 helper — 抽到独立模块以便单测,
 * 因为 Next.js route.ts 不允许暴露 POST/GET/runtime 之外的命名导出。
 *
 * 输入: 已通过 zod 校验的请求 payload (chartXML / existingShapes)。
 * 输出: 注入到 LLM system prompt 末尾的 markdown 块, 缺数据返回 undefined。
 */

export interface CanvasStateInput {
  /** 当前画布内容 — SVG 或 mxCell XML, LLM edit 引用 element_id/cell_id 的依据 */
  readonly chartXML?: string;
  /** image layer 元数据列表 (坐标 + prompt 摘要) */
  readonly existingShapes?: ReadonlyArray<unknown>;
}

function detectFormat(xml: string): "svg" | "mxcell" {
  return xml.trimStart().startsWith("<svg") ? "svg" : "mxcell";
}

export function buildCanvasState(
  data: CanvasStateInput,
): string | undefined {
  const parts: string[] = [];

  const xml = data.chartXML?.trim();
  if (xml) {
    const fmt = detectFormat(xml);
    const label =
      fmt === "svg"
        ? "### chartXML (current SVG, diagram.edit 必须引用其中的 <g id=\"X\">)"
        : "### chartXML (current mxfile, drawio.edit_diagram 必须引用其中的 cell_id)";
    parts.push(`${label}\n\`\`\`${fmt === "svg" ? "svg" : "xml"}\n${xml}\n\`\`\``);
  }

  if (data.existingShapes && data.existingShapes.length > 0) {
    parts.push(
      `### existingShapes (image layer 元数据)\n\`\`\`json\n${JSON.stringify(data.existingShapes, null, 2)}\n\`\`\``,
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
