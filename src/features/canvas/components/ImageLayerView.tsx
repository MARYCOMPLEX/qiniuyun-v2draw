"use client";

import type { ImageLayer } from "@/shared/types/layer";

interface ImageLayerViewProps {
  readonly layer: ImageLayer;
  readonly selected: boolean;
  readonly onSelect: (id: string, additive: boolean) => void;
}

/**
 * 单个 layer 渲染 — 用 <img> 而非 canvas 2D。
 * Why: 浏览器原生 GPU 加速 + 原生支持 transform/opacity, 比手写 canvas 更稳更快。
 */
export function ImageLayerView({ layer, selected, onSelect }: ImageLayerViewProps) {
  if (layer.status !== "done" || !layer.imageUrl) return null;

  const halfW = layer.size.width / 2;
  const halfH = layer.size.height / 2;

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(layer.id, e.shiftKey);
      }}
      className="absolute cursor-move select-none"
      style={{
        left: layer.position.x - halfW,
        top: layer.position.y - halfH,
        width: layer.size.width,
        height: layer.size.height,
        transform: `rotate(${layer.rotation}deg)`,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
        outline: selected ? "2px solid #3b82f6" : "none",
        outlineOffset: 2,
        boxShadow: selected ? "0 0 0 1px rgba(59,130,246,0.4)" : "0 4px 16px rgba(0,0,0,0.3)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={layer.imageUrl}
        alt={layer.prompt}
        draggable={false}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
