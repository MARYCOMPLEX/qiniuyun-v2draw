/**
 * SVG 流式工具函数。
 *
 * - isSvgComplete: 检测 LLM 流式输出的 SVG 是否已闭合
 * - extractCompleteSvgGroups: 从 partial SVG 中提取已闭合的顶层 <g> 元素（渐进渲染）
 */

/**
 * 检测 SVG 字符串是否完整闭合（以 </svg> 结尾）。
 * 用于流式场景：只有完整 SVG 才送入渲染器。
 */
export function isSvgComplete(svg: string | undefined | null): boolean {
  const trimmed = svg?.trim() || "";
  if (!trimmed) return false;
  return trimmed.startsWith("<svg") && trimmed.endsWith("</svg>");
}

/**
 * 从 partial 流式 SVG 中提取可安全渲染的内容。
 *
 * 策略：找到 <svg ...> 开标签和最后一个闭合的顶层元素，
 * 包上 </svg> 构成合法 SVG 片段。
 *
 * 如果连 <svg 开标签都不完整，返回空字符串。
 */
export function extractCompleteSvgGroups(
  partial: string | undefined | null,
): string {
  if (!partial) return "";
  const trimmed = partial.trim();

  // 找 <svg ...> 开标签的结束位置
  const svgOpenEnd = findSvgOpenTagEnd(trimmed);
  if (svgOpenEnd === -1) return "";

  const header = trimmed.slice(0, svgOpenEnd);
  const body = trimmed.slice(svgOpenEnd);

  // 找最后一个已闭合的顶层元素
  const lastClosedPos = findLastClosedTopLevelElement(body);
  if (lastClosedPos <= 0) return "";

  const safeBody = body.slice(0, lastClosedPos);
  return `${header}${safeBody}</svg>`;
}

/**
 * 查找 <svg ...> 开标签的结束位置（第一个 > 的后一位）。
 * 处理 self-closing 排除：如果是 <svg.../> 则返回 -1（不合法）。
 */
function findSvgOpenTagEnd(svg: string): number {
  const match = svg.match(/^<svg[^>]*>/);
  if (!match) return -1;
  return match[0].length;
}

/**
 * 在 SVG body 中找到最后一个完全闭合的顶层元素的结束位置。
 * 顶层元素：<g>, <rect>, <circle>, <ellipse>, <path>, <line>,
 * <polyline>, <polygon>, <text>, <defs>, <use>, <image> 等。
 *
 * 自闭合元素（<xxx ... />）直接算完整。
 * 有 body 的元素需要对应的闭合标签。
 */
function findLastClosedTopLevelElement(body: string): number {
  // 匹配所有顶层闭合标签或自闭合标签的结束位置
  const closingTagPattern = /<\/(?:g|text|defs|symbol|clipPath|mask|marker|linearGradient|radialGradient|filter|pattern)>/g;
  const selfClosingPattern = /<(?:rect|circle|ellipse|path|line|polyline|polygon|use|image|stop)\s[^>]*\/>/g;

  let lastPos = 0;

  let match: RegExpExecArray | null;
  while ((match = closingTagPattern.exec(body)) !== null) {
    const end = match.index + match[0].length;
    if (end > lastPos) lastPos = end;
  }
  while ((match = selfClosingPattern.exec(body)) !== null) {
    const end = match.index + match[0].length;
    if (end > lastPos) lastPos = end;
  }

  return lastPos;
}
