"use client";

import { MxCellSvgRenderer } from "../svg/MxCellSvgRenderer";
import { useDiagram } from "../contexts/DiagramContext";

interface DrawIoStageProps {
  /** dark mode (跟 platform.activeStyleId 联动) */
  readonly darkMode?: boolean;
}

/**
 * 画布容器 — 自研 SVG 渲染器替代 react-drawio iframe。
 *
 * 必须在 <DiagramProvider> 内使用。从 DiagramContext 读 chartXML 直接喂给
 * <MxCellSvgRenderer>, 一次性渲染节点 + 边 + 文字 + 图像 mxCell。
 *
 * 跟 iframe 版本相比:
 * - 移除 drawioUi 主题选项 (LLM 不再走 drawio 自带 UI)
 * - 移除 onAutoSave 回调 (只读引擎不接受用户编辑, chartXML 由 LLM 流式更新)
 * - 移除 onLoad 信号 (直接渲染, 没有 iframe ready 等待)
 */
export function DrawIoStage({ darkMode = false }: DrawIoStageProps) {
  const { chartXML } = useDiagram();

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10">
      <MxCellSvgRenderer xml={chartXML} darkMode={darkMode} />
    </div>
  );
}
