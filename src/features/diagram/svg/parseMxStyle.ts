/**
 * mxCell style 字符串解析 — 把 'rounded=1;fillColor=#dae8fc;...' 拍成结构化对象。
 *
 * 只覆盖 directorPrompt.ts 实际让 LLM 输出的 token, 不追求完整 mxgraph style 语义:
 * - shape=cylinder / ellipse / rhombus / image
 * - rounded=1 (矩形圆角)
 * - fillColor / strokeColor / strokeWidth
 * - image=<url> + imageAspect=1
 * - 边: endArrow / edgeStyle / exitX/exitY/entryX/entryY
 *
 * 见 docs/protocols/multimodal-canvas.md。
 */

export type MxShapeKind =
  | "rect"
  | "rounded-rect"
  | "ellipse"
  | "rhombus"
  | "cylinder"
  | "image";

export interface MxNodeStyle {
  readonly kind: MxShapeKind;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  /** shape=image 时的图像 url */
  readonly imageUrl?: string;
}

export interface MxEdgeStyle {
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  /** 是否带箭头 (endArrow != none) */
  readonly endArrow: boolean;
  /** 是否走直角 (orthogonalEdgeStyle) */
  readonly orthogonal: boolean;
  /** source 端锚点 (相对节点 0..1, 例 1=右边中点) */
  readonly exitX?: number;
  readonly exitY?: number;
  readonly entryX?: number;
  readonly entryY?: number;
}

/**
 * 把 'k1=v1;k2=v2;' 拆成 Record。空段忽略, 末尾分号容忍。
 */
export function tokenizeStyle(style: string | null | undefined): Record<string, string> {
  if (!style) return {};
  const result: Record<string, string> = {};
  for (const segment of style.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      // 无 value 的 key (例 'cylinder' 是 mxgraph 老语法), 视为 shape 别名
      result.shape = trimmed;
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

const sanitizeColor = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  if (raw === "none") return "none";
  return HEX_COLOR_RE.test(raw) ? raw : undefined;
};

const parseFloatSafe = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
};

const sanitizeImageUrl = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  // 只接受 http(s) / data: 协议, 防止 javascript: XSS
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^data:image\//i.test(raw)) return raw;
  return undefined;
};

/**
 * 解析节点 style → MxNodeStyle。
 * 形状判定优先级: shape=image > shape=cylinder/ellipse/rhombus > rounded=1 > 默认矩形
 */
export function parseNodeStyle(style: string | null | undefined): MxNodeStyle {
  const tokens = tokenizeStyle(style);
  const shape = tokens.shape;

  let kind: MxShapeKind = "rect";
  if (shape === "image") kind = "image";
  else if (shape === "cylinder") kind = "cylinder";
  else if (shape === "ellipse") kind = "ellipse";
  else if (shape === "rhombus") kind = "rhombus";
  else if (tokens.rounded === "1") kind = "rounded-rect";

  return {
    kind,
    fillColor: sanitizeColor(tokens.fillColor),
    strokeColor: sanitizeColor(tokens.strokeColor),
    strokeWidth: parseFloatSafe(tokens.strokeWidth),
    imageUrl: kind === "image" ? sanitizeImageUrl(tokens.image) : undefined,
  };
}

/**
 * 解析边 style → MxEdgeStyle。
 * endArrow 默认 true (LLM 不写 endArrow 时 mxgraph 也默认有箭头, 但写了 'none' 则无)。
 */
export function parseEdgeStyle(style: string | null | undefined): MxEdgeStyle {
  const tokens = tokenizeStyle(style);
  return {
    strokeColor: sanitizeColor(tokens.strokeColor),
    strokeWidth: parseFloatSafe(tokens.strokeWidth),
    endArrow: tokens.endArrow !== "none",
    orthogonal: tokens.edgeStyle === "orthogonalEdgeStyle",
    exitX: parseFloatSafe(tokens.exitX),
    exitY: parseFloatSafe(tokens.exitY),
    entryX: parseFloatSafe(tokens.entryX),
    entryY: parseFloatSafe(tokens.entryY),
  };
}
