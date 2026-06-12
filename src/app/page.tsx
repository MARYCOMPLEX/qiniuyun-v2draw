"use client";

import { useCallback, useRef, useState } from "react";

import { VectorStage, type VectorStageHandle } from "@/features/art-canvas/components/VectorStage";
import { CapabilitiesPanel } from "@/features/voice-control/components/CapabilitiesPanel";
import { ShaderOrb } from "@/features/voice-control/components/ShaderOrb";
import { StyleMarketPanel } from "@/features/voice-control/components/StyleMarketPanel";
import { TelemetryHUD, type TelemetryLogEntry } from "@/features/voice-control/components/TelemetryHUD";
import { useCapabilities } from "@/features/voice-control/hooks/useCapabilities";
import { useCapabilityToggles } from "@/features/voice-control/hooks/useCapabilityToggles";
import { useDrawStream } from "@/features/voice-control/hooks/useDrawStream";
import { useVoiceVAD } from "@/features/voice-control/hooks/useVoiceVAD";
import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";

/**
 * 主页面 — 真链路 + 多工具命令版。
 * 数据流: VAD 断句 → PCM Blob → /api/asr → transcript → /api/generate-draw
 *        → 流式 commands[] → shapeMap 增量应用 → 画布缓动渲染
 */
export default function HomePage() {
  const [activeStyleId, setActiveStyleId] = useState<StyleId>(DEFAULT_STYLE_ID);
  const activeStyle = getStyleById(activeStyleId);
  const draw = useDrawStream();
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { toggles, setToggle } = useCapabilityToggles();
  const [asrError, setAsrError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const stageRef = useRef<VectorStageHandle | null>(null);

  const handleUtteranceEnd = useCallback(
    async (audio: Blob): Promise<void> => {
      setAsrError(null);
      try {
        const res = await fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "audio/pcm" },
          body: audio,
        });
        const json = (await res.json()) as
          | { success: true; data: { transcript: string; durationMs: number } }
          | { success: false; code: string; message: string };
        if (!json.success) {
          setAsrError(json.message);
          return;
        }
        const transcript = json.data.transcript;
        if (!transcript) {
          setAsrError("识别为空, 请再说一句");
          return;
        }
        setLiveTranscript(transcript);
        await draw.run(transcript, activeStyleId, {
          onStyleSwitch: (next) => setActiveStyleId(next),
        });
        setLiveTranscript("");
      } catch (error) {
        setAsrError(error instanceof Error ? error.message : "ASR 调用失败");
        setLiveTranscript("");
      }
    },
    [draw, activeStyleId],
  );

  const vad = useVoiceVAD({ onUtteranceEnd: handleUtteranceEnd });

  const onToggleOrb = useCallback((): void => {
    if (vad.listening) {
      vad.stop();
      return;
    }
    void vad.start();
  }, [vad]);

  // 把 turns 适配成老 HUD 期望的 logs 格式
  const hudLogs: readonly TelemetryLogEntry[] = draw.turns.slice(-12).map((turn) => ({
    id: turn.id,
    timestamp: turn.timestamp,
    fragment: `[${turn.status}] ${turn.utterance}${turn.narration ? ` → ${turn.narration}` : ""}`,
  }));

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
        {asrError ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            ASR: {asrError}
          </p>
        ) : null}
        {draw.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            画图: {draw.error}
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
        />
        <p
          className="pointer-events-none absolute left-5 top-5 text-xs uppercase tracking-[0.3em]"
          style={{ color: activeStyle.ui.textMuted }}
        >
          ACTIVE STYLE · {activeStyle.id}
        </p>
        <p
          className="pointer-events-none absolute bottom-5 right-5 text-xs"
          style={{ color: activeStyle.ui.textMuted }}
        >
          {draw.streaming ? "STREAMING…" : `SHAPES · ${draw.shapes.size}`}
        </p>
        {liveTranscript ? (
          <div
            className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full px-5 py-2 text-sm backdrop-blur-md"
            style={{
              backgroundColor: activeStyle.ui.panelBg,
              borderColor: activeStyle.ui.panelBorder,
              borderWidth: 1,
              color: activeStyle.ui.textPrimary,
            }}
          >
            {liveTranscript}
          </div>
        ) : null}
      </section>

      <section className="flex h-full flex-col gap-5 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <TelemetryHUD
            style={activeStyle}
            listening={vad.listening || draw.streaming}
            volume={vad.volume}
            logs={hudLogs}
            latestPartialJson={draw.latestPartialJson}
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
