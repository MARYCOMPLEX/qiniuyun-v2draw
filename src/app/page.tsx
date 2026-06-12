"use client";

import { useCallback, useState } from "react";

import { VectorStage } from "@/features/art-canvas/components/VectorStage";
import { CapabilitiesPanel } from "@/features/voice-control/components/CapabilitiesPanel";
import { ShaderOrb } from "@/features/voice-control/components/ShaderOrb";
import { StyleMarketPanel } from "@/features/voice-control/components/StyleMarketPanel";
import { TelemetryHUD } from "@/features/voice-control/components/TelemetryHUD";
import { useCapabilities } from "@/features/voice-control/hooks/useCapabilities";
import { useCapabilityToggles } from "@/features/voice-control/hooks/useCapabilityToggles";
import { useDrawSimulator } from "@/features/voice-control/hooks/useDrawSimulator";
import { useVoiceVAD } from "@/features/voice-control/hooks/useVoiceVAD";
import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";

/**
 * 主页面 — 胶水层。
 * Why: 它只负责"特征模块的拼装与状态收敛"，不写任何业务渲染细节。
 * 风格市场切换 → QuantumOrb / VectorStage / Simulator 自动取色，
 * VAD 触发 → 调用 simulator.run 走完三阶段流式演示。
 */
export default function HomePage() {
  const [activeStyleId, setActiveStyleId] = useState<StyleId>(DEFAULT_STYLE_ID);
  const activeStyle = getStyleById(activeStyleId);
  const simulator = useDrawSimulator();
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { toggles, setToggle } = useCapabilityToggles();

  const handleUtteranceEnd = useCallback((): void => {
    simulator.run(activeStyleId);
  }, [simulator, activeStyleId]);

  const vad = useVoiceVAD({ onUtteranceEnd: handleUtteranceEnd });

  const onToggleOrb = useCallback((): void => {
    if (vad.listening) {
      vad.stop();
      return;
    }
    void vad.start().then(() => {
      simulator.run(activeStyleId);
    });
  }, [vad, simulator, activeStyleId]);

  return (
    <main
      className="grid h-screen w-screen grid-cols-[280px_1fr_340px] gap-4 p-4 transition-colors"
      style={{ backgroundColor: activeStyle.ui.canvasBg }}
    >
      <section className="flex flex-col gap-4">
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
        {vad.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            麦克风错误：{vad.error}（已自动启用模拟器流）
          </p>
        ) : null}
      </section>

      <section
        aria-label="canvas-stage"
        className="relative h-full w-full overflow-hidden rounded-2xl"
      >
        <VectorStage instruction={simulator.instruction} background={activeStyle.background} />
        <p
          className="pointer-events-none absolute left-4 top-4 text-[10px] uppercase tracking-[0.3em]"
          style={{ color: activeStyle.ui.textMuted }}
        >
          ACTIVE STYLE · {activeStyle.id}
        </p>
        <p
          className="pointer-events-none absolute bottom-4 right-4 text-[10px]"
          style={{ color: activeStyle.ui.textMuted }}
        >
          {simulator.streaming ? "STREAMING…" : "STAND BY"}
        </p>
      </section>

      <section>
        <TelemetryHUD
          style={activeStyle}
          listening={vad.listening || simulator.streaming}
          volume={vad.volume}
          logs={simulator.logs}
          latestPartialJson={simulator.latestPartialJson}
        />
      </section>
    </main>
  );
}
