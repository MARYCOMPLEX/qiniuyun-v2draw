"use client";

import type { MarketStyle } from "@/shared/constants/marketStyles";
import type { CapabilitiesMatrix, CapabilityKind } from "@/shared/providers";

import type { CapabilityToggleState } from "../hooks/useCapabilityToggles";

interface CapabilitiesPanelProps {
  capabilities: CapabilitiesMatrix;
  toggles: CapabilityToggleState;
  isLoading: boolean;
  onToggle: (kind: CapabilityKind, enabled: boolean) => void;
  activeStyle: MarketStyle;
}

const LABELS: Record<CapabilityKind, string> = {
  llm: "LLM 路由",
  asr: "ASR 语音识别",
  tts: "TTS 语音反馈",
  image: "DIFFUSION_MELT 生图",
  search: "WEB_SEARCH 搜索",
};

const ORDER: CapabilityKind[] = ["llm", "asr", "tts", "image", "search"];

export function CapabilitiesPanel({
  capabilities,
  toggles,
  isLoading,
  onToggle,
  activeStyle,
}: CapabilitiesPanelProps) {
  const ui = activeStyle.ui;
  const inactiveTrack = ui.mode === "light" ? "rgba(15,23,42,0.12)" : "rgba(148,163,184,0.18)";
  const disabledTrack = ui.mode === "light" ? "rgba(15,23,42,0.06)" : "rgba(30,41,59,0.6)";

  return (
    <div
      className="rounded-xl border p-4 backdrop-blur-md"
      style={{ backgroundColor: ui.panelBg, borderColor: ui.panelBorder }}
    >
      <header className="mb-3 flex items-center justify-between">
        <h3
          className="text-xs uppercase tracking-widest"
          style={{ color: ui.textSuccess }}
        >
          Capabilities
        </h3>
        {isLoading && (
          <span className="text-[10px]" style={{ color: ui.textMuted }}>
            探测中…
          </span>
        )}
      </header>
      <ul className="space-y-2">
        {ORDER.map((kind) => {
          const cap = capabilities[kind];
          const enabled = toggles[kind] && cap.ready;
          const disabled = !cap.ready;
          const tooltip = cap.ready ? `Provider: ${cap.provider}` : (cap.reason ?? "未配置");
          const labelColor = disabled ? ui.textMuted : ui.textPrimary;
          const trackBg = disabled
            ? disabledTrack
            : enabled
              ? ui.textSuccess
              : inactiveTrack;
          return (
            <li
              key={kind}
              className="flex items-center justify-between gap-3"
              title={tooltip}
            >
              <span className="text-xs" style={{ color: labelColor }}>
                {LABELS[kind]}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(kind, !toggles[kind])}
                className={
                  "relative h-5 w-10 rounded-full transition " +
                  (disabled ? "cursor-not-allowed" : "cursor-pointer")
                }
                style={{ backgroundColor: trackBg }}
                aria-label={`Toggle ${kind}`}
              >
                <span
                  className={
                    "absolute top-0.5 h-4 w-4 rounded-full transition-all " +
                    (enabled ? "left-5" : "left-0.5")
                  }
                  style={{
                    backgroundColor: ui.mode === "light" ? "#ffffff" : "#f8fafc",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                  }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
