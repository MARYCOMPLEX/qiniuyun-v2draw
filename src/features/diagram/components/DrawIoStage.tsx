"use client";

import { DrawIoEmbed } from "react-drawio";

import { useDiagram } from "../contexts/DiagramContext";

interface DrawIoStageProps {
  /** drawio UI 主题: "min" 简约 / "kennedy" 默认 / "dark" / "atlas" / "sketch" 手绘 */
  readonly drawioUi?: "min" | "kennedy" | "dark" | "atlas" | "sketch";
  /** dark mode (跟 platform.activeStyleId 联动) */
  readonly darkMode?: boolean;
}

/**
 * drawio 画布容器 — 把 react-drawio 包成 voice-canvas 用的组件。
 *
 * 接 DiagramContext 拿 drawioRef / onDrawioLoad / handleDiagramAutoSave / handleDiagramExport。
 * 必须在 <DiagramProvider> 内使用。
 *
 * key 含 drawioUi/darkMode/lang — 这些变化时强制 iframe 重挂载, drawio 重新初始化。
 * onDrawioLoad 收到 ready 信号会自动 reload chartXML (无缝切主题)。
 */
export function DrawIoStage({ drawioUi = "min", darkMode = false }: DrawIoStageProps) {
  const { drawioRef, onDrawioLoad, handleDiagramAutoSave, handleDiagramExport } =
    useDiagram();

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10">
      <DrawIoEmbed
        key={`${drawioUi}-${darkMode}`}
        ref={drawioRef}
        autosave
        onAutoSave={handleDiagramAutoSave}
        onExport={handleDiagramExport}
        onLoad={onDrawioLoad}
        urlParameters={{
          ui: drawioUi,
          spin: false,
          libraries: false,
          saveAndExit: false,
          noSaveBtn: true,
          noExitBtn: true,
          dark: darkMode || drawioUi === "dark",
        }}
      />
    </div>
  );
}
