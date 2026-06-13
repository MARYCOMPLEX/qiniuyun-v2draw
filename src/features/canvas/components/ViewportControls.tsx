"use client";

import type { Viewport } from "@/shared/types/layer";

interface ViewportControlsProps {
  readonly viewport: Viewport;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onActual: () => void;
  readonly accentColor: string;
}

/**
 * 视口控制浮动条 — 画布右下角, 显示当前 zoom + 4 个按钮。
 *
 * Why: 鼠标键盘交互不直观, 浮动条作为补充。
 * 平台工具 platform.zoom_canvas 的 UI 等价物。
 */
export function ViewportControls({
  viewport,
  onZoomIn,
  onZoomOut,
  onFit,
  onActual,
  accentColor,
}: ViewportControlsProps) {
  const zoomPct = Math.round(viewport.zoom * 100);

  return (
    <div className="pointer-events-auto absolute bottom-5 right-5 flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 p-1 backdrop-blur-md">
      <button
        type="button"
        onClick={onZoomOut}
        title="缩小 (滚轮)"
        className="grid h-7 w-7 place-items-center rounded text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        −
      </button>
      <button
        type="button"
        onClick={onActual}
        title="实际大小 (100%)"
        className="px-2 py-0.5 text-[11px] font-mono tracking-wider text-white/80 transition hover:text-white"
        style={{ color: zoomPct === 100 ? accentColor : undefined }}
      >
        {zoomPct}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        title="放大 (滚轮)"
        className="grid h-7 w-7 place-items-center rounded text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        title="适配画布 (双击空白)"
        className="ml-1 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/60 transition hover:text-white"
      >
        FIT
      </button>
    </div>
  );
}
