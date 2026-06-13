"use client";

import type { ImageLayer } from "@/shared/types/layer";

interface PlaceholderSkeletonProps {
  readonly layer: ImageLayer;
}

/**
 * 生成中占位骨架屏 — 显示 prompt 摘要 + shimmer 动画 + 进度条。
 * 替代矢量画布的 LERP 缓动, 让用户视觉上感知"AI 在工作"。
 */
export function PlaceholderSkeleton({ layer }: PlaceholderSkeletonProps) {
  if (layer.status === "done") return null;

  const halfW = layer.size.width / 2;
  const halfH = layer.size.height / 2;
  const isFailed = layer.status === "failed";
  const promptSummary =
    layer.prompt.length > 80 ? `${layer.prompt.slice(0, 77)}…` : layer.prompt;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: layer.position.x - halfW,
        top: layer.position.y - halfH,
        width: layer.size.width,
        height: layer.size.height,
        zIndex: layer.zIndex,
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: isFailed
            ? "rgba(239, 68, 68, 0.12)"
            : "rgba(59, 130, 246, 0.08)",
          borderColor: isFailed ? "rgba(239, 68, 68, 0.5)" : "rgba(59, 130, 246, 0.3)",
        }}
      >
        {!isFailed ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(110deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 70%)",
              backgroundSize: "200% 100%",
              animation: "skeleton-shimmer 1.6s ease-in-out infinite",
            }}
          />
        ) : null}

        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-white/60">
            {isFailed ? "FAILED" : layer.status === "generating" ? "GENERATING" : "QUEUED"}
          </p>
          <p className="line-clamp-3 text-sm leading-relaxed text-white/80">
            {promptSummary}
          </p>
          {isFailed && layer.error ? (
            <p className="mt-2 text-[11px] text-red-300">{layer.error}</p>
          ) : null}
        </div>

        {!isFailed ? (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-full bg-blue-400 transition-all duration-500"
              style={{ width: `${Math.max(8, layer.status === "pending" ? 8 : 50)}%` }}
            />
          </div>
        ) : null}
      </div>
      <style jsx>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
