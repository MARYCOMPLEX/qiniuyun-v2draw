/**
 * mxCell XML 工具函数 — 精简自 next-ai-draw-io/lib/utils.ts (Apache-2.0)。
 *
 * 仅保留 voice-canvas 多模态画布需要的核心函数:
 * - isMxCellXmlComplete: 流式截断检测
 * - extractCompleteMxCells: 流式中只取已闭合元素 (渐进渲染关键)
 * - wrapWithMxFile: 把 mxCell 列表包成完整 mxfile 喂 drawio iframe
 * - replaceNodes: 在已有 chartXML 中替换/新增 mxCell (display_diagram 用)
 *
 * 不抄: validateMxCellStructure / autoFixXml / parseXmlTags 等大型校验逻辑,
 * 等出了具体 bug 再按需补充。Source 见 README/CHANGELOG。
 */

const ROOT_CELLS = '<mxCell id="0"/><mxCell id="1" parent="0"/>';

/** 真实图判定阈值 — 短于此长度视为空模板 (跟 next-ai-draw-io 一致) */
export const MIN_REAL_DIAGRAM_LENGTH = 300;

export function isRealDiagram(xml: string | undefined | null): boolean {
  return !!xml && xml.length > MIN_REAL_DIAGRAM_LENGTH;
}

/**
 * 检测 LLM 流式输出的 mxCell XML 是否完整 (未被 token 限制截断)。
 * 完整: 最后一个 mxCell 以 /> 或 </mxCell> 结尾, 之后只有闭合包装标签或空白。
 */
export function isMxCellXmlComplete(xml: string | undefined | null): boolean {
  const trimmed = xml?.trim() || "";
  if (!trimmed) return false;

  const lastSelfClose = trimmed.lastIndexOf("/>");
  const lastMxCellClose = trimmed.lastIndexOf("</mxCell>");
  const lastValidEnd = Math.max(lastSelfClose, lastMxCellClose);
  if (lastValidEnd === -1) return false;

  const endOffset = lastMxCellClose > lastSelfClose ? 9 : 2;
  const suffix = trimmed.slice(lastValidEnd + endOffset);
  return /^(\s*<\/[^>]+>)*\s*$/.test(suffix);
}

/**
 * 从 partial 流式 XML 中只提取已经完整闭合的 mxCell 元素。
 * 这是渐进渲染的关键 — 流到一半的元素不渲染, 等下一帧补全再渲染。
 */
export function extractCompleteMxCells(xml: string | undefined | null): string {
  if (!xml) return "";

  const completeCells: Array<{ index: number; text: string }> = [];
  // 自闭合: <mxCell ... />
  const selfClosingPattern = /<mxCell\s+[^>]*\/>/g;
  // 嵌套: <mxCell ...><mxGeometry .../></mxCell>
  const nestedPattern = /<mxCell\s+[^>]*>[\s\S]*?<\/mxCell>/g;

  let match: RegExpExecArray | null;
  while ((match = selfClosingPattern.exec(xml)) !== null) {
    completeCells.push({ index: match.index, text: match[0] });
  }
  while ((match = nestedPattern.exec(xml)) !== null) {
    completeCells.push({ index: match.index, text: match[0] });
  }

  completeCells.sort((a, b) => a.index - b.index);

  const seen = new Set<number>();
  return completeCells
    .filter((c) => {
      if (seen.has(c.index)) return false;
      seen.add(c.index);
      return true;
    })
    .map((c) => c.text)
    .join("\n");
}

/**
 * 把 LLM 生成的 mxCell 列表包成完整 mxfile 结构, 供 drawio iframe load()。
 * 自动剥离 LLM 误加的 root cell (id="0" / id="1") 和包装标签。
 */
export function wrapWithMxFile(xml: string): string {
  if (!xml || !xml.trim()) {
    return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>${ROOT_CELLS}</root></mxGraphModel></diagram></mxfile>`;
  }
  if (xml.includes("<mxfile")) return xml;
  if (xml.includes("<mxGraphModel")) {
    return `<mxfile><diagram name="Page-1" id="page-1">${xml}</diagram></mxfile>`;
  }

  let content = xml;
  if (xml.includes("<root>")) {
    content = xml.replace(/<\/?root>/g, "").trim();
  }

  // 剥离 LLM provider 的尾部包装标签 (DeepSeek / Anthropic 等不同, 统一处理)
  const lastSelfClose = content.lastIndexOf("/>");
  const lastMxCellClose = content.lastIndexOf("</mxCell>");
  const lastValidEnd = Math.max(lastSelfClose, lastMxCellClose);
  if (lastValidEnd !== -1) {
    const endOffset = lastMxCellClose > lastSelfClose ? 9 : 2;
    const suffix = content.slice(lastValidEnd + endOffset);
    if (/^(\s*<\/[^>]+>)*\s*$/.test(suffix)) {
      content = content.slice(0, lastValidEnd + endOffset);
    }
  }

  // 去掉 LLM 误加的 root cells (id="0" / id="1")
  content = content
    .replace(/<mxCell[^>]*\bid=["']0["'][^>]*(?:\/>|><\/mxCell>)/g, "")
    .replace(/<mxCell[^>]*\bid=["']1["'][^>]*(?:\/>|><\/mxCell>)/g, "")
    .trim();

  return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>${ROOT_CELLS}${content}</root></mxGraphModel></diagram></mxfile>`;
}

/**
 * 把一段新的 mxCell 内容替换/合并到已有 chartXML 的 root 里。
 * 用法: 流式 display_diagram 每帧都用这个把 partial 内容塞进 baseXML。
 *
 * 简化策略: 找到 <root> ... </root>, 保留 root cells (id 0/1), 替换其余。
 * 完整版见 next-ai-draw-io/lib/utils.ts:379+ (含更多 edge 处理)。
 */
export function replaceNodes(currentXML: string, nodes: string): string {
  const rootStart = currentXML.indexOf("<root>");
  const rootEnd = currentXML.indexOf("</root>");
  if (rootStart === -1 || rootEnd === -1) {
    // 没结构, 强制重建
    return wrapWithMxFile(nodes);
  }

  const before = currentXML.slice(0, rootStart + 6); // 含 <root>
  const after = currentXML.slice(rootEnd); // 从 </root> 开始
  return `${before}${ROOT_CELLS}${nodes}${after}`;
}
