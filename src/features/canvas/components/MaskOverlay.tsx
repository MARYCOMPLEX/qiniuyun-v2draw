"use client";

import { useEffect, useRef, useState } from "react";

import type { ImageLayer, MaskPolygon } from "@/shared/types/layer";

interface MaskOverlayProps {
  readonly layer: ImageLayer;
  readonly mode: "drawing" | "ready";
  readonly currentPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly onAttach: (el: HTMLElement | null, layer: ImageLayer) => void;
  readonly onCommit: (polygon: MaskPolygon, replacePrompt: string) => void;
  readonly onCancel: () => void;
}

/**
 * Mask 叠加层 — 在选中 layer 上方画半透明 polygon + 输入 inpaint prompt。
 *
 * UX:
 * - drawing 状态: 半透明蓝色 polygon 跟着鼠标拖出来, 显示提示 "拖拽画区域"
 * - ready 状态: polygon 实色 + 浮出输入框 (输入 replace prompt) + 确认/取消按钮
 *
 * 坐标系: polygon points 是 layer 局部坐标 (左上 0,0), SVG viewBox 同样是 layer.size。
 */
export function MaskOverlay({
  layer,
  mode,
  currentPoints,
  onAttach,
  onCommit,
  onCancel,
}: MaskOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [replacePrompt, setReplacePrompt] = useState("");

  useEffect(() => {
    onAttach(containerRef.current, layer);
    return () => onAttach(null, layer);
  }, [layer, onAttach]);

  const halfW = layer.size.width / 2;
  const halfH = layer.size.height / 2;
  const polyPoints = currentPoints
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  const isDrawing = mode === "drawing";
  const isReady = mode === "ready";

  const handleConfirm = (): void => {
    if (!replacePrompt.trim() || currentPoints.length < 3) return;
    onCommit({ polygon: currentPoints.slice() }, replacePrompt.trim());
    setReplacePrompt("");
  };

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: layer.position.x - halfW,
        top: layer.position.y - halfH,
        width: layer.size.width,
        height: layer.size.height,
        zIndex: layer.zIndex + 100,
        cursor: isDrawing ? "crosshair" : "default",
      }}
    >
      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />

      {/* SVG polygon */}
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        viewBox={`0 0 ${layer.size.width} ${layer.size.height}`}
        preserveAspectRatio="none"
      >
        {currentPoints.length > 0 ? (
          <polygon
            points={polyPoints}
            fill={isReady ? "rgba(59,130,246,0.35)" : "rgba(59,130,246,0.2)"}
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray={isDrawing ? "6,4" : "0"}
          />
        ) : null}
      </svg>

      {/* drawing 提示 */}
      {isDrawing && currentPoints.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-md bg-black/60 px-3 py-2 text-xs uppercase tracking-[0.3em] text-white/80 backdrop-blur-md">
            按住鼠标画选区
          </p>
        </div>
      ) : null}

      {/* ready 状态: 输入 replace prompt + 确认按钮 */}
      {isReady ? (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full mt-2 flex items-center gap-2 rounded-lg border border-white/20 bg-black/70 p-2 backdrop-blur-md"
          style={{ minWidth: 320 }}
        >
          <input
            autoFocus
            value={replacePrompt}
            onChange={(e) => setReplacePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="替换为... (例: a yellow rose)"
            className="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/40 outline-none focus:bg-white/15"
          />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!replacePrompt.trim()}
            className="rounded bg-blue-500 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white transition disabled:cursor-not-allowed disabled:bg-blue-500/40 hover:bg-blue-600"
          >
            INPAINT
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
