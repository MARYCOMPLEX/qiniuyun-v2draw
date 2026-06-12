"use client";

import type { CapabilitiesMatrix, CapabilityKind } from "@/shared/providers";

import type { CapabilityToggleState } from "../hooks/useCapabilityToggles";

interface CapabilitiesPanelProps {
  capabilities: CapabilitiesMatrix;
  toggles: CapabilityToggleState;
  isLoading: boolean;
  onToggle: (kind: CapabilityKind, enabled: boolean) => void;
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
}: CapabilitiesPanelProps) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-black/60 p-4 backdrop-blur">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-cyan-300/80">
          Capabilities
        </h3>
        {isLoading && (
          <span className="text-[10px] font-mono text-cyan-400/60">探测中…</span>
        )}
      </header>
      <ul className="space-y-2">
        {ORDER.map((kind) => {
          const cap = capabilities[kind];
          const enabled = toggles[kind] && cap.ready;
          const disabled = !cap.ready;
          const tooltip = cap.ready
            ? `Provider: ${cap.provider}`
            : (cap.reason ?? "未配置");
          return (
            <li
              key={kind}
              className="flex items-center justify-between gap-3"
              title={tooltip}
            >
              <span
                className={
                  disabled
                    ? "text-xs font-mono text-slate-600"
                    : "text-xs font-mono text-slate-200"
                }
              >
                {LABELS[kind]}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(kind, !toggles[kind])}
                className={
                  "relative h-5 w-10 rounded-full transition " +
                  (disabled
                    ? "cursor-not-allowed bg-slate-800"
                    : enabled
                      ? "bg-cyan-500/80"
                      : "bg-slate-700")
                }
                aria-label={`Toggle ${kind}`}
              >
                <span
                  className={
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all " +
                    (enabled ? "left-5" : "left-0.5")
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
