"use client";

import { useEffect, useState } from "react";

import type { CapabilitiesMatrix, CapabilitySnapshot } from "@/shared/providers";

const ALL_NOT_READY: CapabilitySnapshot = {
  ready: false,
  provider: null,
  reason: "正在探测…",
};

const INITIAL: CapabilitiesMatrix = {
  llm: ALL_NOT_READY,
  asr: ALL_NOT_READY,
  tts: ALL_NOT_READY,
  image: ALL_NOT_READY,
  search: ALL_NOT_READY,
};

interface UseCapabilitiesResult {
  capabilities: CapabilitiesMatrix;
  isLoading: boolean;
  error: string | null;
}

/**
 * 启动时拉取 /api/capabilities，结果作为 UI 开关与 toolDispatcher 的真值来源。
 * Why: 客户端无法直接读 process.env，必须经由后端纯函数 detectCapabilities 探测。
 */
export const useCapabilities = (): UseCapabilitiesResult => {
  const [capabilities, setCapabilities] = useState<CapabilitiesMatrix>(INITIAL);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch("/api/capabilities", { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { success: boolean; data: CapabilitiesMatrix };
        if (!cancelled && body.success) {
          setCapabilities(body.data);
        }
      } catch (err) {
        if (!cancelled && (err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { capabilities, isLoading, error };
};
