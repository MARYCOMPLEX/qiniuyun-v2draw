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
 * Why: 把"音量条 + 流式 JSON 瀑布"两个独立可视化收敛在同一面板,
 * 父组件单向喂数据, 组件零业务状态。配色全部走 ui token, 主题切换实时生效。
 */
export function TelemetryHUD({
  style,
  listening,
  volume,
  logs,
  latestPartialJson,
}: TelemetryHUDProps) {
  const ui = style.ui;
  const subPanelBg = ui.mode === "light" ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.04)";
  const placeholderColor = ui.mode === "light" ? "rgba(15,23,42,0.4)" : "rgba(248,250,252,0.35)";

  const bars = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, (_, idx) => {
      const phase = (idx / BAR_COUNT) * Math.PI * 2;
      const energy = listening
        ? Math.min(1, volume * 6 + Math.abs(Math.sin(phase)) * 0.18)
        : 0.06;
      return Math.round(energy * 100);
    });
  }, [volume, listening]);

  return (
    <aside
      className="flex h-full w-full flex-col gap-5 rounded-2xl border p-5 text-[13px] backdrop-blur-md"
      style={{
        backgroundColor: ui.panelBg,
        borderColor: ui.panelBorder,
        color: ui.textPrimary,
      }}
    >
      <header
        className="flex items-center justify-between text-xs uppercase tracking-[0.3em]"
        style={{ color: ui.textMuted }}
      >
        <span>TELEMETRY HUD</span>
        <span style={{ color: style.accent }}>{listening ? "LIVE" : "IDLE"}</span>
      </header>

      <section aria-label="audio-energy" className="grid h-20 grid-cols-24 items-end gap-[2px]">
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

      <section
        aria-label="partial-json"
        className="rounded-md p-3"
        style={{ backgroundColor: subPanelBg }}
      >
        <p
          className="mb-1.5 text-xs uppercase tracking-[0.3em]"
          style={{ color: ui.textMuted }}
        >
          PARTIAL_JSON
        </p>
        <pre
          className="max-h-28 overflow-hidden whitespace-pre-wrap break-all text-xs"
          style={{ color: ui.textPrimary }}
        >
          {latestPartialJson || "—"}
        </pre>
      </section>

      <section
        aria-label="log-waterfall"
        className="flex-1 overflow-hidden rounded-md p-3"
        style={{ backgroundColor: subPanelBg }}
      >
        <p
          className="mb-1.5 text-xs uppercase tracking-[0.3em]"
          style={{ color: ui.textMuted }}
        >
          STREAM_LOG
        </p>
        <ul className="flex h-full flex-col gap-1.5 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <li style={{ color: placeholderColor }}>awaiting voice trigger…</li>
          ) : (
            logs.map((entry) => (
              <li key={entry.id} className="flex gap-2 text-xs">
                <span className="shrink-0" style={{ color: ui.textMuted }}>
                  {formatClock(entry.timestamp)}
                </span>
                <span className="break-all" style={{ color: ui.textPrimary }}>
                  {entry.fragment}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </aside>
  );
}
