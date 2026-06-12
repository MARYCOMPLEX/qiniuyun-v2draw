"use client";

import { useEffect, useRef } from "react";

import type { CanvasInstruction } from "../utils/toolDispatcher";

interface VectorStageProps {
  readonly instruction: CanvasInstruction | null;
  readonly background: string;
}

interface RenderState {
  current: { x: number; y: number; size: number };
  target: { x: number; y: number; size: number };
}

const LERP_FACTOR = 0.12;
const lerp = (current: number, target: number): number =>
  current + (target - current) * LERP_FACTOR;

const drawShape = (
  ctx: CanvasRenderingContext2D,
  shape: CanvasInstruction["shape"],
  state: RenderState["current"],
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
 * 物理缓动 Canvas。
 * Why: streamObject 在挤牙膏式补全 size/position 时，画布如果直接用最新值
 * 重绘，视觉上会"跳"。通过 rAF + LERP 把目标值平滑插值到当前值，
 * 物理层抹平网络延迟带来的颗粒感。
 */
export function VectorStage({ instruction, background }: VectorStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<RenderState>({
    current: { x: 480, y: 320, size: 0 },
    target: { x: 480, y: 320, size: 0 },
  });
  const instructionRef = useRef<CanvasInstruction | null>(null);

  useEffect(() => {
    instructionRef.current = instruction;
    if (instruction && instruction.action !== "delete") {
      stateRef.current.target = {
        x: instruction.position.x,
        y: instruction.position.y,
        size: instruction.size,
      };
    }
  }, [instruction]);

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
      const { current, target } = stateRef.current;
      current.x = lerp(current.x, target.x);
      current.y = lerp(current.y, target.y);
      current.size = lerp(current.size, target.size);

      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      const live = instructionRef.current;
      if (live && live.action !== "delete") {
        drawShape(ctx, live.shape, current, live.stroke);
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
}
