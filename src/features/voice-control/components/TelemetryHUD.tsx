"use client";

import { useMemo } from "react";

import type { MarketStyle } from "@/shared/constants/marketStyles";

export interface TelemetryLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly fragment: string;
}

interface TelemetryHUDProps {
  readonly style: MarketStyle;
  readonly listening: boolean;
  readonly volume: number;
  readonly logs: readonly TelemetryLogEntry[];
  readonly latestPartialJson: string;
}

const BAR_COUNT = 24;

const formatClock = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d
    .getMilliseconds()
    .toString()
    .padStart(3, "0")}`;
};

/**
 * 遥测 HUD。
 * Why: 把"音量条 + 流式 JSON 瀑布"两个相互独立的可视化收敛在同一面板，
 * 由父组件单向喂数据，组件本身保持纯受控、零业务状态。
 */
export function TelemetryHUD({
  style,
  listening,
  volume,
  logs,
  latestPartialJson,
}: TelemetryHUDProps) {
  const bars = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, (_, idx) => {
      const phase = (idx / BAR_COUNT) * Math.PI * 2;
      const energy = listening ? Math.min(1, volume * 6 + Math.abs(Math.sin(phase)) * 0.18) : 0.06;
      return Math.round(energy * 100);
    });
  }, [volume, listening]);

  return (
    <aside className="flex h-full w-full flex-col gap-4 rounded-2xl border border-white/10 bg-black/80 p-4 font-mono text-[11px] text-white/80 backdrop-blur">
      <header className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/50">
        <span>TELEMETRY HUD</span>
        <span style={{ color: style.accent }}>{listening ? "LIVE" : "IDLE"}</span>
      </header>

      <section aria-label="audio-energy" className="grid grid-cols-24 items-end gap-[2px] h-16">
        {bars.map((b, idx) => (
          <span
            key={idx}
            className="block w-full rounded-sm transition-[height] duration-75"
            style={{
              height: `${b}%`,
              background: `linear-gradient(180deg, ${style.palette[0]} 0%, ${style.palette[1]} 100%)`,
              opacity: listening ? 0.95 : 0.25,
            }}
          />
        ))}
      </section>

      <section aria-label="partial-json" className="rounded-md bg-white/5 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-white/40">PARTIAL_JSON</p>
        <pre className="max-h-24 overflow-hidden whitespace-pre-wrap break-all text-[10px] text-white/80">
          {latestPartialJson || "—"}
        </pre>
      </section>

      <section aria-label="log-waterfall" className="flex-1 overflow-hidden rounded-md bg-white/5 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-white/40">STREAM_LOG</p>
        <ul className="flex h-full flex-col gap-1 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <li className="text-white/30">awaiting voice trigger…</li>
          ) : (
            logs.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 text-white/40">{formatClock(entry.timestamp)}</span>
                <span className="break-all text-white/80">{entry.fragment}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </aside>
  );
}
