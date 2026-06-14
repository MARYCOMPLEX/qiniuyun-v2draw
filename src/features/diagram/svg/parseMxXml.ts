/**
 * mxfile XML → 结构化节点数组解析。
 *
 * 设计选择: 用 regex 而不是 DOMParser。
 * - 跟现有 mxCellUtils 一致 (已经在用 regex 抠 mxCell)
 * - 不引入新依赖 / 不需要浏览器 DOM, 测试可在 node env 跑
 * - LLM 输出格式可控 (directorPrompt 严格规定 mxCell 结构), 不需要完整 XML 解析能力
 *
 * 局限:
 * - 不处理 XML 注释 (LLM 已被 prompt 禁止输出)
 * - 不处理 CDATA / 自定义实体
 * - 属性值假设用双引号 (drawio 默认就是)
 */

import {
  parseEdgeStyle,
  parseNodeStyle,
  type MxEdgeStyle,
  type MxNodeStyle,
} from "./parseMxStyle";

export interface MxGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MxNode {
  readonly id: string;
  readonly value: string | null;
  readonly geometry: MxGeometry;
  readonly style: MxNodeStyle;
}

export interface MxEdge {
  readonly id: string;
  readonly value: string | null;
  readonly source: string;
  readonly target: string;
  readonly style: MxEdgeStyle;
}

export interface ParsedMxModel {
  readonly nodes: ReadonlyArray<MxNode>;
  readonly edges: ReadonlyArray<MxEdge>;
}

const MX_CELL_RE =
  /<mxCell\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;

const MX_GEOMETRY_RE =
  /<mxGeometry\s+([^/>]*)\/>/;

/** 提取 attr="value" 形式的属性值 (双引号优先, 单引号兜底) */
const ATTR_RE_DOUBLE = (name: string): RegExp =>
  new RegExp(`\\b${name}="([^"]*)"`);
const ATTR_RE_SINGLE = (name: string): RegExp =>
  new RegExp(`\\b${name}='([^']*)'`);

const getAttr = (raw: string, name: string): string | null => {
  const m = raw.match(ATTR_RE_DOUBLE(name)) ?? raw.match(ATTR_RE_SINGLE(name));
  if (!m || m[1] === undefined) return null;
  return decodeXmlEntities(m[1]);
};

const decodeXmlEntities = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const parseFloatSafe = (raw: string | null): number => {
  if (raw === null) return 0;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

const parseGeometry = (innerXml: string | undefined): MxGeometry => {
  if (!innerXml) return { x: 0, y: 0, width: 0, height: 0 };
  const m = innerXml.match(MX_GEOMETRY_RE);
  if (!m || m[1] === undefined) return { x: 0, y: 0, width: 0, height: 0 };
  const attrs = m[1];
  return {
    x: parseFloatSafe(getAttr(attrs, "x")),
    y: parseFloatSafe(getAttr(attrs, "y")),
    width: parseFloatSafe(getAttr(attrs, "width")),
    height: parseFloatSafe(getAttr(attrs, "height")),
  };
};

/**
 * 解析完整 mxfile XML → 节点 + 边数组。
 *
 * 跳过 root cells (id="0" / id="1"), 这些是 drawio 内部锚点不渲染。
 * 无 vertex / edge 标记的 cell 默认按节点处理 (容错: LLM 偶尔忘标 vertex)。
 */
export function parseMxXml(xml: string | null | undefined): ParsedMxModel {
  if (!xml || !xml.trim()) return { nodes: [], edges: [] };

  const nodes: MxNode[] = [];
  const edges: MxEdge[] = [];

  MX_CELL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MX_CELL_RE.exec(xml)) !== null) {
    const attrsRaw = match[1] ?? "";
    const inner = match[2]; // undefined if self-closing
    const id = getAttr(attrsRaw, "id");
    if (!id || id === "0" || id === "1") continue;

    const isEdge = getAttr(attrsRaw, "edge") === "1";
    const value = getAttr(attrsRaw, "value");
    const styleStr = getAttr(attrsRaw, "style");

    if (isEdge) {
      const source = getAttr(attrsRaw, "source") ?? "";
      const target = getAttr(attrsRaw, "target") ?? "";
      edges.push({
        id,
        value,
        source,
        target,
        style: parseEdgeStyle(styleStr),
      });
      continue;
    }

    nodes.push({
      id,
      value,
      geometry: parseGeometry(inner),
      style: parseNodeStyle(styleStr),
    });
  }

  return { nodes, edges };
}
