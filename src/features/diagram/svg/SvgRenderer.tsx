"use client";

import { useMemo } from "react";

import { sanitizeSvg } from "./sanitizeSvg";

interface SvgRendererProps {
  readonly svg: string;
  readonly darkMode?: boolean;
  readonly className?: string;
}

const THEME_VARS_LIGHT = {
  "--vc-bg": "#fafafa",
  "--vc-stroke": "#1f2937",
  "--vc-fill": "#ffffff",
  "--vc-text": "#0f172a",
  "--vc-accent": "#3b82f6",
} as const;

const THEME_VARS_DARK = {
  "--vc-bg": "#0f172a",
  "--vc-stroke": "#cbd5e1",
  "--vc-fill": "#1e293b",
  "--vc-text": "#f1f5f9",
  "--vc-accent": "#60a5fa",
} as const;

/**
 * 原生 SVG 渲染器 — 接收 LLM 直接输出的 SVG，sanitize 后渲染。
 *
 * 相比 MxCellSvgRenderer:
 * - 不需要解析 mxCell XML，直接渲染完整 SVG
 * - 支持全部 SVG 特性（渐变/滤镜/贝塞尔/marker 等）
 * - DOMPurify 保证安全（去除 script/事件/危险 URL）
 * - CSS 变量注入实现主题切换
 */
export function SvgRenderer({ svg, darkMode = false, className }: SvgRendererProps) {
  const sanitized = useMemo(() => sanitizeSvg(svg), [svg]);

  if (!sanitized) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: darkMode ? "#0f172a" : "#fafafa",
          color: darkMode ? "#f1f5f9" : "#0f172a",
          opacity: 0.4,
          fontSize: 14,
        }}
      >
        空画布
      </div>
    );
  }

  const themeVars = darkMode ? THEME_VARS_DARK : THEME_VARS_LIGHT;

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: darkMode ? "#0f172a" : "#fafafa",
        color: darkMode ? THEME_VARS_DARK["--vc-text"] : THEME_VARS_LIGHT["--vc-text"],
        ...themeVars,
      } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
