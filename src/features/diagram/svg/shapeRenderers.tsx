/**
 * 把 MxNode 的形状渲染成 SVG <g> 子树。
 *
 * 6 种形状: rect / rounded-rect / ellipse / rhombus / cylinder / image
 * 文字标签统一用 <text> dominant-baseline=middle 居中。
 *
 * 颜色 fallback: 节点 fill 默认 #ffffff (浅) / #2a2a2a (深),
 * stroke 默认 #1f2937 / #d1d5db, 由组件传入 themeFill / themeStroke。
 */

import type { ReactElement } from "react";

import type { MxEdge, MxNode } from "./parseMxXml";

export interface ThemeColors {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

export const LIGHT_THEME: ThemeColors = {
  fill: "#ffffff",
  stroke: "#1f2937",
  text: "#0f172a",
};

export const DARK_THEME: ThemeColors = {
  fill: "#1e293b",
  stroke: "#cbd5e1",
  text: "#f1f5f9",
};

const DEFAULT_STROKE_WIDTH = 1.5;
const TEXT_FONT_SIZE = 12;

/** 节点 = SVG <g> 子树 (形状 + 居中文字) */
export function renderNode(node: MxNode, theme: ThemeColors): ReactElement {
  const { id, value, geometry: g, style } = node;
  const fill = style.fillColor ?? theme.fill;
  const stroke = style.strokeColor ?? theme.stroke;
  const strokeWidth = style.strokeWidth ?? DEFAULT_STROKE_WIDTH;

  const cx = g.x + g.width / 2;
  const cy = g.y + g.height / 2;

  const shapeEl = renderShape(node, fill, stroke, strokeWidth);
  const labelEl = value ? (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={TEXT_FONT_SIZE}
      fill={theme.text}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {value}
    </text>
  ) : null;

  return (
    <g key={id} data-mx-cell={id}>
      {shapeEl}
      {labelEl}
    </g>
  );
}

function renderShape(
  node: MxNode,
  fill: string,
  stroke: string,
  strokeWidth: number,
): ReactElement {
  const { geometry: g, style } = node;
  const { kind } = style;

  if (kind === "image" && style.imageUrl) {
    return (
      <image
        href={style.imageUrl}
        x={g.x}
        y={g.y}
        width={g.width}
        height={g.height}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }

  if (kind === "ellipse") {
    return (
      <ellipse
        cx={g.x + g.width / 2}
        cy={g.y + g.height / 2}
        rx={g.width / 2}
        ry={g.height / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (kind === "rhombus") {
    const cx = g.x + g.width / 2;
    const cy = g.y + g.height / 2;
    const points = `${cx},${g.y} ${g.x + g.width},${cy} ${cx},${g.y + g.height} ${g.x},${cy}`;
    return (
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (kind === "cylinder") {
    return renderCylinder(g.x, g.y, g.width, g.height, fill, stroke, strokeWidth);
  }

  // rect / rounded-rect (默认)
  const rx = kind === "rounded-rect" ? Math.min(8, g.width / 6) : 0;
  return (
    <rect
      x={g.x}
      y={g.y}
      width={g.width}
      height={g.height}
      rx={rx}
      ry={rx}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function renderCylinder(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
): ReactElement {
  const ry = Math.min(h * 0.15, 12);
  const topCy = y + ry;
  const bottomCy = y + h - ry;
  // 主体: 顶椭圆 + 两侧直线 + 底椭圆 (使用 path 一笔画 fill)
  const bodyPath =
    `M ${x} ${topCy} ` +
    `A ${w / 2} ${ry} 0 0 1 ${x + w} ${topCy} ` +
    `L ${x + w} ${bottomCy} ` +
    `A ${w / 2} ${ry} 0 0 1 ${x} ${bottomCy} Z`;
  return (
    <g>
      <path d={bodyPath} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <ellipse
        cx={x + w / 2}
        cy={topCy}
        rx={w / 2}
        ry={ry}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </g>
  );
}

/** 边 = SVG <path>, 用节点中心点连线 (简化, 不做精确锚点路由) */
export function renderEdge(
  edge: MxEdge,
  nodeMap: ReadonlyMap<string, MxNode>,
  theme: ThemeColors,
  markerId: string,
): ReactElement | null {
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  if (!src || !tgt) return null;

  const stroke = edge.style.strokeColor ?? theme.stroke;
  const strokeWidth = edge.style.strokeWidth ?? DEFAULT_STROKE_WIDTH;

  const sx = src.geometry.x + src.geometry.width / 2;
  const sy = src.geometry.y + src.geometry.height / 2;
  const tx = tgt.geometry.x + tgt.geometry.width / 2;
  const ty = tgt.geometry.y + tgt.geometry.height / 2;

  // 直线 or 直角 (orthogonal): 中点折线
  let d: string;
  if (edge.style.orthogonal) {
    const mx = (sx + tx) / 2;
    d = `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ty} L ${tx} ${ty}`;
  } else {
    d = `M ${sx} ${sy} L ${tx} ${ty}`;
  }

  return (
    <path
      key={edge.id}
      data-mx-cell={edge.id}
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      markerEnd={edge.style.endArrow ? `url(#${markerId})` : undefined}
    />
  );
}
