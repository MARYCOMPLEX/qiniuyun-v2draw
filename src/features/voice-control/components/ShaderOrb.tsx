"use client";

import { useState } from "react";

import type { MarketStyle } from "@/shared/constants/marketStyles";

import { useFluidShader } from "../hooks/useFluidShader";

interface ShaderOrbProps {
  readonly style: MarketStyle;
  readonly volume: number;
  readonly listening: boolean;
  readonly onToggle: () => void;
}

/**
 * Shader 流体球 — 替换原 SVG QuantumOrb。
 * Why: WebGL 着色器画粘稠流体远比 feTurbulence 自然且 GPU 加速,
 * 同时通过 uniform 把 marketStyle.palette + 麦克风音量 + 听写态实时注入,
 * 主题切换 / 用户说话强度 / 静默都能在视觉上即时反映。
 */
export function ShaderOrb({ style, volume, listening, onToggle }: ShaderOrbProps) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useFluidShader({ canvas, style, volume, listening });

  const ringColor = style.ui.mode === "light" ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.18)";
  const labelColor = style.ui.textMuted;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={listening}
      aria-label="shader-orb-trigger"
      className="relative grid h-44 w-44 place-items-center overflow-hidden rounded-full p-0 outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-400"
      style={{ boxShadow: `inset 0 0 0 1px ${ringColor}` }}
    >
      <canvas
        ref={setCanvas}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-7 text-[10px] uppercase tracking-[0.3em]"
        style={{ color: labelColor }}
      >
        {listening ? "LISTENING" : "TAP TO LOCK"}
      </span>
    </button>
  );
}
