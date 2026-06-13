"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VectorStage, type VectorStageHandle } from "@/features/art-canvas/components/VectorStage";
import { CapabilitiesPanel } from "@/features/voice-control/components/CapabilitiesPanel";
import { ShaderOrb } from "@/features/voice-control/components/ShaderOrb";
import { StyleMarketPanel } from "@/features/voice-control/components/StyleMarketPanel";
import { TelemetryHUD, type TelemetryLogEntry } from "@/features/voice-control/components/TelemetryHUD";
import { useCapabilities } from "@/features/voice-control/hooks/useCapabilities";
import { useCapabilityToggles } from "@/features/voice-control/hooks/useCapabilityToggles";
import { useDrawStream } from "@/features/voice-control/hooks/useDrawStream";
import { useRealtimeAsr } from "@/features/voice-control/hooks/useRealtimeAsr";
import { useTtsStream } from "@/features/voice-control/hooks/useTtsStream";
import { useVoiceVAD } from "@/features/voice-control/hooks/useVoiceVAD";
import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";

/**
 * 主页面 — 实时识别 + 多工具命令版。
 * 数据流: VAD 检测开口 → 浏览器直连阿里云 ws → 边推 PCM 边收 changed 事件 (实时出字)
 *        → VAD 检测结束 → ws 收 final → /api/generate-draw 流式 → shapeMap 增量渲染
 */
export default function HomePage() {
  const [activeStyleId, setActiveStyleId] = useState<StyleId>(DEFAULT_STYLE_ID);
  const activeStyle = getStyleById(activeStyleId);
  const draw = useDrawStream();
  const tts = useTtsStream();
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { toggles, setToggle } = useCapabilityToggles();
  const stageRef = useRef<VectorStageHandle | null>(null);
  const activeStyleIdRef = useRef<StyleId>(activeStyleId);
  activeStyleIdRef.current = activeStyleId;

  const [livePartial, setLivePartial] = useState<string>("");
  const [finalUtterance, setFinalUtterance] = useState<string>("");
  const [showGrid, setShowGrid] = useState<boolean>(false);

  // 用户从风格卡手动切风格时, 让画布所有图元的 stroke 跟随新风格 palette。
  // Why: STYLE_TRANSFORM 命令链路不走这条 (那是语音切风格), 但 UI 点击需要等价行为。
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    drawRef.current.restyle(activeStyleId);
  }, [activeStyleId]);

  // narration 落定后给智能体配音 — 仅当 TTS 开关开启且能力就绪。
  // Why: 用 useEffect 监听 turns 状态机 done 跃迁, 避免在流式期间反复触发;
  // ref 解耦让 capabilities/toggles 变化不打断当前播放。
  const ttsActiveRef = useRef<boolean>(false);
  ttsActiveRef.current = toggles.tts && capabilities.tts.ready;
  const ttsSpeakRef = useRef(tts.speak);
  ttsSpeakRef.current = tts.speak;
  const lastSpokenTurnRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ttsActiveRef.current) return;
    const lastDone = [...draw.turns].reverse().find((t) => t.status === "done");
    if (!lastDone) return;
    if (lastSpokenTurnRef.current === lastDone.id) return;
    const narration = lastDone.narration.trim();
    if (!narration) return;
    lastSpokenTurnRef.current = lastDone.id;
    void ttsSpeakRef.current(narration);
  }, [draw.turns]);

  const asrEvents = useMemo(
    () => ({
      onPartial: (text: string) => setLivePartial(text),
      onFinal: (text: string) => {
        setLivePartial("");
        setFinalUtterance(text);
        const trimmed = text.trim();
        if (trimmed) {
          void draw.run(trimmed, activeStyleIdRef.current, {
            onStyleSwitch: (next) => setActiveStyleId(next),
          });
        }
      },
      onError: (err: string) => console.warn("[asr] error:", err),
    }),
    [draw],
  );

  const asr = useRealtimeAsr(asrEvents);
  const asrRef = useRef(asr);
  asrRef.current = asr;

  const vadOptions = useMemo(
    () => ({
      onUtteranceStart: () => {
        setLivePartial("");
        setFinalUtterance("");
        asrRef.current.start().catch((e) => {
          console.warn("[asr] start failed:", e);
        });
      },
      onAudioFrame: (pcm: Uint8Array) => {
        asrRef.current.sendAudio(pcm);
      },
      onUtteranceEnd: () => {
        asrRef.current.stop().catch((e) => {
          console.warn("[asr] stop failed:", e);
        });
      },
    }),
    [],
  );

  const vad = useVoiceVAD(vadOptions);

  const onToggleOrb = useCallback((): void => {
    if (vad.listening) {
      vad.stop();
      asr.disconnect();
      return;
    }
    void vad.start();
  }, [vad, asr]);

  const hudLogs: readonly TelemetryLogEntry[] = draw.turns.slice(-12).map((turn) => ({
    id: turn.id,
    timestamp: turn.timestamp,
    fragment: `[${turn.status}] ${turn.utterance}${turn.narration ? ` → ${turn.narration}` : ""}`,
  }));

  const transcriptToShow = livePartial || finalUtterance;

  return (
    <main
      className="grid h-screen w-screen grid-cols-[360px_1fr_420px] gap-5 p-5 transition-colors"
      style={{ backgroundColor: activeStyle.ui.canvasBg }}
    >
      <section className="flex flex-col gap-5">
        <StyleMarketPanel
          activeStyleId={activeStyleId}
          onActivate={setActiveStyleId}
          activeStyle={activeStyle}
        />
        <CapabilitiesPanel
          capabilities={capabilities}
          toggles={toggles}
          isLoading={capabilitiesLoading}
          onToggle={setToggle}
          activeStyle={activeStyle}
        />
        {vad.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            麦克风错误: {vad.error}
          </p>
        ) : null}
        {asr.error && !/IDLE_TIMEOUT/i.test(asr.error) ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            ASR: {asr.error}
          </p>
        ) : null}
        {draw.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            画图: {draw.error}
          </p>
        ) : null}
        {tts.error ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            TTS: {tts.error}
          </p>
        ) : null}
      </section>

      <section
        aria-label="canvas-stage"
        className="relative h-full w-full overflow-hidden rounded-2xl"
      >
        <VectorStage
          ref={stageRef}
          shapes={draw.shapes}
          background={activeStyle.background}
          showGrid={showGrid}
        />
        <p
          className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 text-xs uppercase tracking-[0.3em]"
          style={{ color: activeStyle.ui.textMuted }}
        >
          <span
            aria-label={asr.connected ? "ASR online" : "ASR offline"}
            className="inline-block h-2 w-2 rounded-full transition-colors"
            style={{
              backgroundColor: asr.connected ? "#22c55e" : "#f59e0b",
              boxShadow: asr.connected
                ? "0 0 6px rgba(34, 197, 94, 0.6)"
                : "0 0 6px rgba(245, 158, 11, 0.6)",
            }}
          />
          <span>ACTIVE STYLE · {activeStyle.id}</span>
        </p>
        <button
          onClick={() => setShowGrid((v) => !v)}
          className="absolute right-5 top-5 rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.2em] transition-colors"
          style={{
            borderColor: activeStyle.ui.panelBorder,
            color: showGrid ? activeStyle.accent : activeStyle.ui.textMuted,
            backgroundColor: showGrid
              ? `${activeStyle.accent}10`
              : "transparent",
          }}
          title="切换坐标网格 (50px)"
        >
          {showGrid ? "GRID ON" : "GRID OFF"}
        </button>
        <p
          className="pointer-events-none absolute bottom-5 right-5 text-xs"
          style={{ color: activeStyle.ui.textMuted }}
        >
          {draw.streaming ? "STREAMING…" : `SHAPES · ${draw.shapes.size}`}
        </p>
        {transcriptToShow ? (
          <div
            className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full px-5 py-2 text-sm backdrop-blur-md"
            style={{
              backgroundColor: activeStyle.ui.panelBg,
              borderColor: activeStyle.ui.panelBorder,
              borderWidth: 1,
              color: activeStyle.ui.textPrimary,
              opacity: livePartial ? 1 : 0.7,
            }}
          >
            {livePartial ? "✦ " : ""}
            {transcriptToShow}
          </div>
        ) : null}
      </section>

      <section className="flex h-full flex-col gap-5 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <TelemetryHUD
            style={activeStyle}
            listening={vad.listening || asr.recognizing || draw.streaming}
            volume={vad.volume}
            logs={hudLogs}
            latestPartialJson={
              livePartial
                ? `RECOGNIZING: ${livePartial}`
                : draw.latestPartialJson
            }
          />
        </div>
        <div
          className="grid place-items-center rounded-2xl border p-6 backdrop-blur-md"
          style={{
            backgroundColor: activeStyle.ui.panelBg,
            borderColor: activeStyle.ui.panelBorder,
          }}
        >
          <ShaderOrb
            style={activeStyle}
            volume={vad.volume}
            listening={vad.listening}
            onToggle={onToggleOrb}
          />
        </div>
      </section>
    </main>
  );
}
