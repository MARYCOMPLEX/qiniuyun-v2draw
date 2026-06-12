"use client";

import { useEffect, useMemo, useRef } from "react";

import { ShaderOrb } from "@/features/voice-control/components/ShaderOrb";
import type { DrawTurnLog } from "@/features/voice-control/hooks/useDrawStream";
import type { MarketStyle } from "@/shared/constants/marketStyles";

interface ConversationPanelProps {
  readonly style: MarketStyle;
  readonly turns: readonly DrawTurnLog[];
  readonly volume: number;
  readonly listening: boolean;
  readonly streaming: boolean;
  readonly liveTranscript: string;
  readonly latestPartialJson: string;
  readonly onToggleOrb: () => void;
}

const BAR_COUNT = 24;

const formatClock = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
};

const STATUS_LABEL: Record<DrawTurnLog["status"], string> = {
  streaming: "STREAMING",
  done: "DONE",
  error: "ERROR",
};

/**
 * 右侧对话面板 — 上滚消息列表 + 底部常驻 Orb 输入区。
 * Why: 用户更想看到"我说了什么 / 模型回应了什么 / 现在画布上有什么", 而不是
 * 流式 partial JSON 瀑布。Orb 从左下迁到这里, 视觉上更接近 Chat 输入框,
 * 且语音控件与对话流耦合更自然。
 */
export function ConversationPanel({
  style,
  turns,
  volume,
  listening,
  streaming,
  liveTranscript,
  latestPartialJson,
  onToggleOrb,
}: ConversationPanelProps) {
  const ui = style.ui;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, idx) => {
        const phase = (idx / BAR_COUNT) * Math.PI * 2;
        const energy = listening
          ? Math.min(1, volume * 6 + Math.abs(Math.sin(phase)) * 0.18)
          : 0.06;
        return Math.round(energy * 100);
      }),
    [volume, listening],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, liveTranscript, latestPartialJson]);

  const isDark = ui.mode !== "light";

  return (
    <aside
      className="flex h-full flex-col overflow-hidden rounded-2xl border backdrop-blur-md"
      style={{
        backgroundColor: ui.panelBg,
        borderColor: ui.panelBorder,
        color: ui.textPrimary,
      }}
    >
      <header
        className="flex items-center justify-between border-b px-5 py-3 text-[11px] uppercase tracking-[0.32em]"
        style={{ borderColor: ui.panelBorder, color: ui.textMuted }}
      >
        <span>CONVERSATION</span>
        <span style={{ color: style.accent }}>
          {streaming ? "STREAMING" : listening ? "LIVE" : "IDLE"}
        </span>
      </header>

      <section
        aria-label="audio-energy"
        className="grid h-12 grid-cols-24 items-end gap-[2px] border-b px-5 py-2"
        style={{ borderColor: ui.panelBorder }}
      >
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {turns.length === 0 ? (
          <p className="text-xs leading-relaxed" style={{ color: ui.textMuted }}>
            点击下方流体球开始, 说一句话试试: <br />
            「画三个圆排成一行」/「把最大的换成方块」/「切换到梵高风格」/「清空」
          </p>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="space-y-1.5">
              <div
                className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.28em]"
                style={{ color: ui.textMuted }}
              >
                <span>USER · {formatClock(turn.timestamp)}</span>
                <span style={{ color: turn.status === "error" ? "#fda4af" : style.accent }}>
                  {STATUS_LABEL[turn.status]}
                </span>
              </div>
              <div
                className="rounded-xl px-3 py-2 text-sm leading-snug"
                style={{
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(15,23,42,0.06)",
                }}
              >
                {turn.utterance}
              </div>
              {turn.narration ? (
                <div
                  className="rounded-xl border px-3 py-2 text-sm leading-snug"
                  style={{
                    borderColor: ui.panelBorder,
                    color: ui.textPrimary,
                  }}
                >
                  <span
                    className="mr-2 text-[10px] uppercase tracking-[0.28em]"
                    style={{ color: ui.textMuted }}
                  >
                    AGENT
                  </span>
                  {turn.narration}
                  {turn.commandCount > 0 ? (
                    <span className="ml-2 text-[10px]" style={{ color: ui.textMuted }}>
                      · {turn.commandCount} cmd
                    </span>
                  ) : null}
                </div>
              ) : null}
              {turn.error ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {turn.error}
                </div>
              ) : null}
            </div>
          ))
        )}

        {liveTranscript && streaming ? (
          <div
            className="rounded-xl border-dashed border px-3 py-2 text-xs leading-snug"
            style={{ borderColor: ui.panelBorder, color: ui.textMuted }}
          >
            <span className="mr-2 uppercase tracking-[0.28em]">PARTIAL</span>
            {liveTranscript}
          </div>
        ) : null}
      </div>

      <footer
        className="border-t px-4 py-4"
        style={{ borderColor: ui.panelBorder }}
      >
        {latestPartialJson ? (
          <p
            className="mb-3 line-clamp-2 break-all rounded-md px-2 py-1 font-mono text-[10px] leading-relaxed"
            style={{
              backgroundColor: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(15,23,42,0.04)",
              color: ui.textMuted,
            }}
          >
            {latestPartialJson}
          </p>
        ) : null}
        <div className="flex items-center gap-4">
          <ShaderOrb
            style={style}
            volume={volume}
            listening={listening}
            onToggle={onToggleOrb}
          />
          <div className="flex-1 text-[11px] leading-relaxed" style={{ color: ui.textMuted }}>
            {listening
              ? "持续监听, 说完自动断句送入识别"
              : streaming
              ? "正在生成画布命令…"
              : "点击启动麦克风"}
          </div>
        </div>
      </footer>
    </aside>
  );
}
