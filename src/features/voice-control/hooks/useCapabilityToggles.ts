"use client";

import { useCallback, useEffect, useState } from "react";

import type { CapabilityKind } from "@/shared/providers";

const STORAGE_KEY = "voice-canvas:capability-toggles";

/**
 * 用户对各能力开关的本地偏好。
 * Why: localStorage 让浏览器重启后保留选择；TTS 等可选能力默认 false。
 */
export type CapabilityToggleState = Record<CapabilityKind, boolean>;

const DEFAULT_STATE: CapabilityToggleState = {
  llm: true,
  asr: true,
  tts: false,
  image: true,
  search: true,
};

const readFromStorage = (): CapabilityToggleState => {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<CapabilityToggleState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
};

interface UseCapabilityTogglesResult {
  toggles: CapabilityToggleState;
  setToggle: (kind: CapabilityKind, enabled: boolean) => void;
}

export const useCapabilityToggles = (): UseCapabilityTogglesResult => {
  const [toggles, setToggles] = useState<CapabilityToggleState>(DEFAULT_STATE);

  useEffect(() => {
    setToggles(readFromStorage());
  }, []);

  const setToggle = useCallback((kind: CapabilityKind, enabled: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [kind]: enabled };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // localStorage 不可用（隐私模式）— 静默降级，开关仍然生效但不会持久化
        }
      }
      return next;
    });
  }, []);

  return { toggles, setToggle };
};
