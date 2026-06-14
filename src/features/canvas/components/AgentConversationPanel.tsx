"use client";

import { useEffect, useMemo, useRef } from "react";

import type { MarketStyle } from "@/shared/constants/marketStyles";

import type {
  AgentAction,
  ConversationTurn,
} from "../types/conversation";

interface AgentConversationPanelProps {
  readonly style: MarketStyle;
  readonly turns: ReadonlyArray<ConversationTurn>;
  /** 实时 ASR partial (识别中的灰字) */
  readonly livePartial?: string;
  /** 当前是否在 streaming (LLM 正在吐 commands) */
  readonly streaming: boolean;
  /** 麦克风音量 (0-1) — 用于顶部音量条柱 */
  readonly volume?: number;
  /** VAD 是否在监听 — 控制音量条活跃度 */
  readonly listening?: boolean;
}

const formatClock = (ts: number): string => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const pad = (n: number): string => n.toString().padStart(2, "0");

const STATUS_LABEL: Record<AgentAction["status"], string> = {
  pending: "待执行",
  running: "进行中",
  done: "完成",
  failed: "失败",
};

const BAR_COUNT = 24;

const STATUS_COLOR: Record<AgentAction["status"], string> = {
  pending: "rgba(148, 163, 184, 0.6)",
  running: "rgba(96, 165, 250, 0.9)",
  done: "rgba(74, 222, 128, 0.9)",
  failed: "rgba(248, 113, 113, 0.9)",
};

/**
 * Agent 对话面板 — 替代旧的 STREAM LOG 一行式日志。
 *
 * 显示:
 * - 用户消息 (右对齐, 灰色边框)
 * - 智能体消息 (左对齐, 包含 narration + 动作 chip 列表)
 * - 实时 ASR partial 在底部预览
 * - 自动滚动到最新消息
 */
export function AgentConversationPanel({
  style,
  turns,
  livePartial,
  streaming,
  volume = 0,
  listening = false,
}: AgentConversationPanelProps) {
  const ui = style.ui;
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // 24 格音量条 — 监听时按 RMS + 正弦相位生成动效, 静默时矮稳
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

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, livePartial, streaming]);

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
        className="flex items-center justify-between border-b px-5 py-3 text-xs uppercase tracking-[0.3em]"
        style={{ borderColor: ui.panelBorder, color: ui.textMuted }}
      >
        <span>AGENT 对话</span>
        <span style={{ color: streaming ? style.accent : ui.textMuted }}>
          {streaming ? "思考中..." : `${turns.length} 轮`}
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

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3">
        {turns.length === 0 && !livePartial ? (
          <p className="mt-12 text-center text-xs leading-relaxed" style={{ color: ui.textMuted }}>
            点击下方流体球开始, 用语音指挥智能体作画。
            <br />
            示例: 「画一只森林里的狐狸」
          </p>
        ) : null}

        {turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} style={style} />
        ))}

        {livePartial ? (
          <div className="my-2 flex justify-end">
            <div
              className="max-w-[85%] rounded-2xl px-3 py-2 text-sm italic"
              style={{
                backgroundColor: "rgba(148, 163, 184, 0.15)",
                color: ui.textMuted,
              }}
            >
              ✦ {livePartial}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function TurnView({ turn, style }: { turn: ConversationTurn; style: MarketStyle }) {
  const ui = style.ui;

  return (
    <div className="my-3">
      {/* 用户消息 — 右对齐 */}
      <div className="mb-2 flex justify-end">
        <div className="max-w-[85%]">
          <div
            className="text-right text-[10px] uppercase tracking-wider"
            style={{ color: ui.textMuted }}
          >
            你 · {formatClock(turn.timestamp)}
          </div>
          <div
            className="mt-1 rounded-2xl rounded-tr-sm px-3 py-2 text-sm"
            style={{
              backgroundColor: `${style.accent}20`,
              border: `1px solid ${style.accent}40`,
              color: ui.textPrimary,
            }}
          >
            {turn.userUtterance}
          </div>
        </div>
      </div>

      {/* 智能体消息 — 左对齐 */}
      <div className="flex justify-start">
        <div className="max-w-[90%] flex-1">
          <div
            className="flex items-center gap-2 text-[10px] uppercase tracking-wider"
            style={{ color: ui.textMuted }}
          >
            <span>智能体</span>
            {turn.turnIndex > 1 ? (
              <span className="rounded px-1 py-0.5 text-[9px]"
                style={{ backgroundColor: `${style.accent}30` }}>
                第 {turn.turnIndex} 轮
              </span>
            ) : null}
            <span className="ml-auto" style={{ color: STATUS_COLOR[mapTurnStatus(turn.status)] }}>
              {turnStatusText(turn.status)}
            </span>
          </div>

          {turn.narration ? (
            <div
              className="mt-1 rounded-2xl rounded-tl-sm px-3 py-2 text-sm"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                color: ui.textPrimary,
              }}
            >
              {turn.narration}
            </div>
          ) : turn.status === "streaming" ? (
            <div
              className="mt-1 rounded-2xl rounded-tl-sm px-3 py-2 text-sm italic"
              style={{ color: ui.textMuted }}
            >
              <ThinkingDots />
            </div>
          ) : null}

          {/* 动作 chip 列表 */}
          {turn.actions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {turn.actions.map((action, i) => (
                <ActionChip key={i} action={action} ui={ui} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionChip({
  action,
  ui,
}: {
  action: AgentAction;
  ui: MarketStyle["ui"];
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]"
      style={{
        borderColor: STATUS_COLOR[action.status],
        backgroundColor: `${STATUS_COLOR[action.status].replace("0.9", "0.08").replace("0.6", "0.05")}`,
        color: ui.textPrimary,
      }}
      title={action.error ?? STATUS_LABEL[action.status]}
    >
      <StatusIcon status={action.status} />
      <span>{action.summary}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: AgentAction["status"] }) {
  if (status === "running") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full animate-pulse"
        style={{ backgroundColor: STATUS_COLOR.running }}
      />
    );
  }
  if (status === "done") {
    return <span style={{ color: STATUS_COLOR.done }}>✓</span>;
  }
  if (status === "failed") {
    return <span style={{ color: STATUS_COLOR.failed }}>✗</span>;
  }
  return <span style={{ color: STATUS_COLOR.pending }}>○</span>;
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      正在思考
      <span className="inline-block animate-pulse">...</span>
    </span>
  );
}

const mapTurnStatus = (s: ConversationTurn["status"]): AgentAction["status"] => {
  if (s === "streaming") return "running";
  if (s === "executing") return "running";
  if (s === "done") return "done";
  return "failed";
};

const turnStatusText = (s: ConversationTurn["status"]): string => {
  if (s === "streaming") return "推理中";
  if (s === "executing") return "执行中";
  if (s === "done") return "已完成";
  return "失败";
};
