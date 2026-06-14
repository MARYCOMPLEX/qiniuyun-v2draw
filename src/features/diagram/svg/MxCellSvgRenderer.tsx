"use client";

import { useId, useMemo } from "react";

import { parseMxXml } from "./parseMxXml";
import {
  DARK_THEME,
  LIGHT_THEME,
  renderEdge,
  renderNode,
  type ThemeColors,
} from "./shapeRenderers";
import type { MxNode } from "./parseMxXml";

interface MxCellSvgRendererProps {
  /** mxfile XML 字符串 (含 mxGraphModel 包装) */
  readonly xml: string;
  /** 是否暗色模式 */
  readonly darkMode?: boolean;
  /** 容器额外 className */
  readonly className?: string;
}

const VIEWBOX_PADDING = 20;
const FALLBACK_VIEWBOX = "0 0 800 600";

/**
 * 自研 mxCell 只读 SVG 渲染器 — 替代 react-drawio iframe。
 *
 * 范围:
 * - 解析 mxfile XML, 渲染 6 种节点 (rect / rounded-rect / ellipse / rhombus
 *   / cylinder / image) + 直线/直角边 + 箭头 + 文字标签
 * - viewBox 自动按节点 bounding box 计算, 留 20px 内边距
 * - 空 / 解析失败 → 显示 "空画布" 占位文字
 *
 * 不做:
 * - 拖拽 / 选中 / 编辑 (LLM 流式更新就够用)
 * - drawio stencil 库 (AWS / K8s 等已经砍掉)
 * - 锚点精确路由 (用节点中心连线代替)
 */
export function MxCellSvgRenderer({
  xml,
  darkMode = false,
  className,
}: MxCellSvgRendererProps) {
  const markerIdBase = useId();
  const arrowMarkerId = `${markerIdBase}-arrow`.replace(/:/g, "");

  const theme: ThemeColors = darkMode ? DARK_THEME : LIGHT_THEME;
  const { nodes, edges } = useMemo(() => parseMxXml(xml), [xml]);
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);
  const viewBox = useMemo(() => computeViewBox(nodes), [nodes]);

  const isEmpty = nodes.length === 0 && edges.length === 0;

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{
        width: "100%",
        height: "100%",
        background: darkMode ? "#0f172a" : "#fafafa",
        display: "block",
      }}
    >
      <defs>
        <marker
          id={arrowMarkerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.stroke} />
        </marker>
      </defs>

      {isEmpty ? (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14}
          fill={theme.text}
          opacity={0.4}
        >
          空画布
        </text>
      ) : (
        <>
          {/* 边在节点下方, 节点遮挡边端 */}
          {edges.map((edge) => renderEdge(edge, nodeMap, theme, arrowMarkerId))}
          {nodes.map((node) => renderNode(node, theme))}
        </>
      )}
    </svg>
  );
}

function buildNodeMap(nodes: ReadonlyArray<MxNode>): ReadonlyMap<string, MxNode> {
  const map = new Map<string, MxNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

function computeViewBox(nodes: ReadonlyArray<MxNode>): string {
  if (nodes.length === 0) return FALLBACK_VIEWBOX;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const { x, y, width, height } = n.geometry;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + width > maxX) maxX = x + width;
    if (y + height > maxY) maxY = y + height;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return FALLBACK_VIEWBOX;
  const w = maxX - minX + VIEWBOX_PADDING * 2;
  const h = maxY - minY + VIEWBOX_PADDING * 2;
  return `${minX - VIEWBOX_PADDING} ${minY - VIEWBOX_PADDING} ${Math.max(w, 100)} ${Math.max(h, 100)}`;
}
