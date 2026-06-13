"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { ImageLayerView } from "./ImageLayerView";
import { PlaceholderSkeleton } from "./PlaceholderSkeleton";
import { ViewportControls } from "./ViewportControls";
import { useViewport } from "../hooks/useViewport";
import type { LayerMap } from "@/shared/types/layer";

interface InfiniteStageProps {
  readonly layers: LayerMap;
  readonly selectedLayerIds: ReadonlySet<string>;
  readonly onSelect: (id: string, additive: boolean) => void;
  readonly onDeselectAll: () => void;
  readonly background: string;
  readonly accentColor: string;
  readonly showGrid?: boolean;
  /** 默认舞台矩形 (UI 中间区域映射的画布坐标), 用于 fit 时居中 */
  readonly defaultStageRect?: { x: number; y: number; w: number; h: number };
}

export interface InfiniteStageHandle {
  captureSnapshot(): string | null;
}

const GRID_STEP = 50;

/**
 * 无限画布舞台 — 替代旧 VectorStage。
 *
 * 数据载体: LayerMap (图像 layer) 而非 ShapeMap (几何 shape)。
 * 渲染层: DOM <img> 而非 canvas 2D, 利用浏览器 GPU 加速。
 * 视口: pan/zoom transform, 整个画布世界以 stage 容器为视口, 内部任意 (x,y) 坐标。
 */
export const InfiniteStage = forwardRef<InfiniteStageHandle, InfiniteStageProps>(
  function InfiniteStage(
    {
      layers,
      selectedLayerIds,
      onSelect,
      onDeselectAll,
      background,
      accentColor,
      showGrid = false,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { viewport, isPanning, attach, zoomBy, fit, actual } = useViewport();

    useImperativeHandle(ref, () => ({
      captureSnapshot: (): string | null => {
        // PR-G/截图回路会用 html-to-image 库实现, 这里先返回 null 占位
        return null;
      },
    }), []);

    const setRefs = useCallback(
      (el: HTMLDivElement | null): void => {
        containerRef.current = el;
        attach(el);
      },
      [attach],
    );

    const layersArray = Array.from(layers.values()).sort((a, b) => a.zIndex - b.zIndex);

    const onContainerMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (e.target === containerRef.current) {
          onDeselectAll();
        }
      },
      [onDeselectAll],
    );

    return (
      <div
        ref={setRefs}
        onMouseDown={onContainerMouseDown}
        className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10"
        style={{
          backgroundColor: background,
          cursor: isPanning ? "grabbing" : "default",
        }}
        aria-label="infinite-canvas-stage"
      >
        {/* world layer — 所有 layer 都画在这一层, 应用统一的 pan/zoom transform */}
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
            width: 0,
            height: 0,
          }}
        >
          {/* 网格 (世界坐标, 跟着视口缩放) */}
          {showGrid ? <CanvasGrid /> : null}

          {layersArray.map((layer) =>
            layer.status === "done" ? (
              <ImageLayerView
                key={layer.id}
                layer={layer}
                selected={selectedLayerIds.has(layer.id)}
                onSelect={onSelect}
              />
            ) : (
              <PlaceholderSkeleton key={layer.id} layer={layer} />
            ),
          )}
        </div>

        <ViewportControls
          viewport={viewport}
          onZoomIn={() => zoomBy(0.2)}
          onZoomOut={() => zoomBy(-0.2)}
          onFit={fit}
          onActual={actual}
          accentColor={accentColor}
        />
      </div>
    );
  },
);

/**
 * 网格 overlay — 在 world 坐标系画 50px 网格。
 * 用 SVG 生成 pattern 比 canvas 2D 更省 (浏览器原生重复)。
 */
function CanvasGrid() {
  const size = 4000; // 足够大覆盖典型画布
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: -size / 2, top: -size / 2, width: size, height: size }}
      viewBox={`0 0 ${size} ${size}`}
    >
      <defs>
        <pattern id="grid-pattern" width={GRID_STEP} height={GRID_STEP} patternUnits="userSpaceOnUse">
          <path
            d={`M ${GRID_STEP} 0 L 0 0 0 ${GRID_STEP}`}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      {/* 中心十字 */}
      <line
        x1={size / 2 - 20}
        y1={size / 2}
        x2={size / 2 + 20}
        y2={size / 2}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      <line
        x1={size / 2}
        y1={size / 2 - 20}
        x2={size / 2}
        y2={size / 2 + 20}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
    </svg>
  );
}
