"use client";

import "./canvas-marquee.css";

interface CanvasMarqueeProps {
  /** 是否启用 (一般跟 streaming || 任何 running 异步任务联动) */
  readonly active: boolean;
  /** 边框圆角, 默认 16px (跟外层 rounded-2xl 协调) */
  readonly radius?: number;
}

/**
 * 画布四周跑马灯 + 呼吸闪烁 — streaming / 异步任务进行中的环境氛围。
 *
 * 双层视觉:
 * 1. 外层 conic-gradient 顺时针旋转 (跑马灯) — 4s 一圈, 流光感
 * 2. 内层 box-shadow 双向呼吸 — 1.6s 周期, 强弱交替的霓虹边
 *
 * 实现:
 * - position absolute inset:-2px, 让流光跑在画布外缘 1-2 px 处
 * - pointer-events: none 不挡画布操作
 * - z-index 4 (低于 StreamingOrbFx 的 5, 后者覆盖整个画布)
 * - active=false 时整个层不渲染 (避免 GPU 持续合成)
 */
export function CanvasMarquee({ active, radius = 16 }: CanvasMarqueeProps) {
  if (!active) return null;
  return (
    <div
      className="canvas-marquee"
      style={{ borderRadius: `${radius}px` }}
      aria-hidden
    >
      <div className="canvas-marquee__beam" style={{ borderRadius: `${radius}px` }} />
      <div className="canvas-marquee__pulse" style={{ borderRadius: `${radius}px` }} />
    </div>
  );
}
