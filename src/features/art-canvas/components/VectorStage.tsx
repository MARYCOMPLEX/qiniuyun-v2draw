"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { CanvasShape, ShapeMap } from "../utils/toolDispatcher";

interface VectorStageProps {
  readonly shapes: ShapeMap;
  readonly background: string;
  readonly showGrid?: boolean;
}

export interface VectorStageHandle {
  captureSnapshot(): string | null;
}

interface RenderEntry {
  current: { x: number; y: number; size: number };
  target: { x: number; y: number; size: number };
  shape: CanvasShape["shape"];
  stroke: string;
}

const LERP_FACTOR = 0.12;
const GRID_STEP = 50;
const lerp = (current: number, target: number): number =>
  current + (target - current) * LERP_FACTOR;

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void => {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.beginPath();
  for (let x = GRID_STEP; x < width; x += GRID_STEP) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = GRID_STEP; y < height; y += GRID_STEP) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  // 中心十字 (480, 320 是约定中心, 但实际居中按 canvas 大小)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(width / 2 - 20, height / 2);
  ctx.lineTo(width / 2 + 20, height / 2);
  ctx.moveTo(width / 2, height / 2 - 20);
  ctx.lineTo(width / 2, height / 2 + 20);
  ctx.stroke();
  ctx.restore();
};

const drawShape = (
  ctx: CanvasRenderingContext2D,
  shape: CanvasShape["shape"],
  state: RenderEntry["current"],
  stroke: string,
): void => {
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.shadowColor = stroke;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(state.x, state.y, Math.max(1, state.size), 0, Math.PI * 2);
  } else if (shape === "rectangle") {
    const half = state.size;
    ctx.rect(state.x - half, state.y - half, half * 2, half * 2);
  } else {
    ctx.moveTo(state.x - state.size, state.y);
    ctx.lineTo(state.x + state.size, state.y);
  }
  ctx.stroke();
};

/**
 * 多图元物理缓动 Canvas。
 * Why: 用 Map<id, RenderEntry> 替代单 instruction, 每个 shape 独立 LERP 收敛。
 * shape 出现 → entry 加入 map; shape 消失 → entry 从 map 移除; 修改 → 更新 target。
 * captureSnapshot 通过 ref 暴露, 用于截图反馈回路 (Path 1 MVP)。
 */
export const VectorStage = forwardRef<VectorStageHandle, VectorStageProps>(
  function VectorStage({ shapes, background, showGrid = false }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const entriesRef = useRef<Map<string, RenderEntry>>(new Map());
    const shapesRef = useRef<ShapeMap>(shapes);
    const showGridRef = useRef<boolean>(showGrid);

    useEffect(() => {
      showGridRef.current = showGrid;
    }, [showGrid]);

    useImperativeHandle(
      ref,
      () => ({
        captureSnapshot: (): string | null => {
          const canvas = canvasRef.current;
          if (!canvas) return null;
          try {
            return canvas.toDataURL("image/png");
          } catch {
            return null;
          }
        },
      }),
      [],
    );

    useEffect(() => {
      shapesRef.current = shapes;
      const entries = entriesRef.current;
      // 新增/更新 target
      for (const [id, shape] of shapes) {
        const existing = entries.get(id);
        if (existing) {
          existing.target = { x: shape.position.x, y: shape.position.y, size: shape.size };
          existing.shape = shape.shape;
          existing.stroke = shape.stroke;
        } else {
          entries.set(id, {
            current: { x: shape.position.x, y: shape.position.y, size: 0 },
            target: { x: shape.position.x, y: shape.position.y, size: shape.size },
            shape: shape.shape,
            stroke: shape.stroke,
          });
        }
      }
      // 不在新 map 里的 entry 直接删 (后续可改成"缩到 0 再删"的退场动画)
      for (const id of entries.keys()) {
        if (!shapes.has(id)) entries.delete(id);
      }
    }, [shapes]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const setupRetina = (): void => {
        const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
        const { clientWidth, clientHeight } = canvas;
        canvas.width = clientWidth * dpr;
        canvas.height = clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      setupRetina();
      window.addEventListener("resize", setupRetina);

      let rafId = 0;
      const tick = (): void => {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

        if (showGridRef.current) {
          drawGrid(ctx, canvas.clientWidth, canvas.clientHeight);
        }

        for (const entry of entriesRef.current.values()) {
          entry.current.x = lerp(entry.current.x, entry.target.x);
          entry.current.y = lerp(entry.current.y, entry.target.y);
          entry.current.size = lerp(entry.current.size, entry.target.size);
          drawShape(ctx, entry.shape, entry.current, entry.stroke);
        }

        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", setupRetina);
      };
    }, [background]);

    return (
      <canvas
        ref={canvasRef}
        className="h-full w-full rounded-2xl border border-white/10"
        aria-label="voice-canvas-stage"
      />
    );
  },
);
