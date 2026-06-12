"use client";

import { useId } from "react";

import type { MarketStyle } from "@/shared/constants/marketStyles";

interface QuantumOrbProps {
  readonly style: MarketStyle;
  readonly volume: number;
  readonly listening: boolean;
  readonly onToggle: () => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * 量子奇点球。
 * Why: 用 SVG feTurbulence + feDisplacementMap 模拟硬件加速的"粘稠流体"，
 * 颜色实时绑定当前激活风格色盘；按钮形态保留以便外层接 VAD start/stop。
 */
export function QuantumOrb({ style, volume, listening, onToggle }: QuantumOrbProps) {
  const turbulenceId = useId();
  const gradientId = useId();
  const glowScale = 1 + clamp(volume * 6, 0, 0.6);
  const baseFreq = style.webgl.turbulenceFreq + (listening ? volume * 0.04 : 0);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={listening}
      aria-label="quantum-orb-trigger"
      className="relative grid h-44 w-44 place-items-center rounded-full bg-black/80 p-0 outline-none ring-1 ring-white/15 transition focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-full opacity-40 mix-blend-screen"
        style={{
          backgroundImage:
            "linear-gradient(0deg, transparent 96%, rgba(6,182,212,0.08) 100%), linear-gradient(90deg, transparent 96%, rgba(219,39,119,0.08) 100%)",
          backgroundSize: "16px 16px",
        }}
        aria-hidden
      />
      <svg
        viewBox="0 0 200 200"
        className={`h-40 w-40 ${listening ? "animate-glitch" : ""}`}
        style={{ transform: `scale(${glowScale})`, transition: "transform 80ms linear" }}
      >
        <defs>
          <filter id={turbulenceId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency={baseFreq.toFixed(4)}
              numOctaves={style.webgl.turbulenceOctaves}
              seed={listening ? 7 : 2}
            />
            <feDisplacementMap
              in="SourceGraphic"
              scale={style.webgl.displacementScale + volume * 24}
            />
          </filter>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={style.palette[0]} stopOpacity="1" />
            <stop offset="55%" stopColor={style.palette[1]} stopOpacity="0.85" />
            <stop offset="100%" stopColor={style.palette[2]} stopOpacity="0.1" />
          </radialGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="74"
          fill={`url(#${gradientId})`}
          filter={`url(#${turbulenceId})`}
        />
        <circle
          cx="100"
          cy="100"
          r="74"
          fill="none"
          stroke={style.accent}
          strokeOpacity="0.55"
          strokeWidth="1"
        />
      </svg>
      <span className="pointer-events-none absolute -bottom-7 font-mono text-[10px] uppercase tracking-[0.3em] text-white/60">
        {listening ? "LISTENING" : "TAP TO LOCK"}
      </span>
    </button>
  );
}
