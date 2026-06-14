"use client";

import { MxCellSvgRenderer } from "../svg/MxCellSvgRenderer";
import { SvgRenderer } from "../svg/SvgRenderer";
import { useDiagram } from "../contexts/DiagramContext";

interface DrawIoStageProps {
  readonly darkMode?: boolean;
}

type DiagramFormat = "svg" | "mxfile" | "empty";

function detectFormat(content: string): DiagramFormat {
  const trimmed = content.trim();
  if (!trimmed) return "empty";
  if (trimmed.startsWith("<svg")) return "svg";
  return "mxfile";
}

/**
 * 画布容器 — 根据内容格式路由到对应渲染器。
 *
 * - SVG 格式 → SvgRenderer（原生 SVG，DOMPurify sanitize）
 * - mxfile 格式 → MxCellSvgRenderer（旧 mxCell 解析渲染，向后兼容）
 * - 空内容 → SvgRenderer 显示占位
 */
export function DrawIoStage({ darkMode = false }: DrawIoStageProps) {
  const { chartXML } = useDiagram();
  const format = detectFormat(chartXML);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10">
      {format === "svg" ? (
        <SvgRenderer svg={chartXML} darkMode={darkMode} />
      ) : (
        <MxCellSvgRenderer xml={chartXML} darkMode={darkMode} />
      )}
    </div>
  );
}
