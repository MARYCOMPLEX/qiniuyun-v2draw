"use client";

import { useCallback, useRef, useState } from "react";

import {
  buildFallbackInstruction,
  dispatchPartialTool,
  type CanvasInstruction,
} from "@/features/art-canvas/utils/toolDispatcher";
import type { TelemetryLogEntry } from "@/features/voice-control/components/TelemetryHUD";
import type { PartialDrawTool } from "@/shared/types/schema";
import type { StyleId } from "@/shared/constants/marketStyles";

interface SimulatorState {
  readonly streaming: boolean;
  readonly logs: readonly TelemetryLogEntry[];
  readonly latestPartialJson: string;
  readonly instruction: CanvasInstruction | null;
}

interface SimulatorAPI extends SimulatorState {
  readonly run: (activeStyleId: StyleId) => void;
  readonly reset: () => void;
}

const FRAME_DELAYS_MS = [60, 90, 120, 150, 180, 220, 260];

const buildIncrementalFrames = (activeStyleId: StyleId): readonly PartialDrawTool[] => {
  const base = {
    toolType: "ATOMIC_SHAPE" as const,
    action: "create" as const,
    shape: "circle" as const,
    activeStyleId,
    useAccentColor: true,
    position: { x: 480, y: 320 },
  };
  return [
    { toolType: "ATOMIC_SHAPE" },
    { ...base, size: 6 },
    { ...base, size: 18 },
    { ...base, size: 38 },
    { ...base, size: 72 },
    { ...base, size: 110 },
    { ...base, size: 138 },
  ];
};

const truncateJson = (frame: PartialDrawTool): string => {
  const raw = JSON.stringify(frame);
  return raw.length > 240 ? `${raw.slice(0, 237)}…` : raw;
};

/**
 * 全链路数据流模拟器。
 * Why: 在没有 OPENAI_API_KEY 的本地或评审环境下，仍然能完整演示三阶段：
 * 原子骨架 → HUD 闪烁 → 物理缓动平滑。和真路由共用 toolDispatcher，
 * 一旦真接入流式接口可直接替换喂数源。
 */
export function useDrawSimulator(): SimulatorAPI {
  const [state, setState] = useState<SimulatorState>({
    streaming: false,
    logs: [],
    latestPartialJson: "",
    instruction: null,
  });
  const timersRef = useRef<number[]>([]);

  const reset = useCallback((): void => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setState({ streaming: false, logs: [], latestPartialJson: "", instruction: null });
  }, []);

  const run = useCallback(
    (activeStyleId: StyleId): void => {
      reset();
      const frames = buildIncrementalFrames(activeStyleId);
      setState((prev) => ({ ...prev, streaming: true, instruction: null }));

      let cumulativeDelay = 0;
      frames.forEach((frame, idx) => {
        cumulativeDelay += FRAME_DELAYS_MS[idx % FRAME_DELAYS_MS.length]!;
        const timerId = window.setTimeout(() => {
          const instructionId = `sim-${activeStyleId}`;
          const dispatched = dispatchPartialTool(frame, instructionId);
          const fragment = truncateJson(frame);
          setState((prev) => ({
            streaming: idx < frames.length - 1,
            logs: [
              ...prev.logs.slice(-12),
              {
                id: `log-${idx}-${cumulativeDelay}`,
                timestamp: Date.now(),
                fragment,
              },
            ],
            latestPartialJson: fragment,
            instruction: dispatched ?? prev.instruction,
          }));
        }, cumulativeDelay);
        timersRef.current.push(timerId);
      });

      const fallbackTimer = window.setTimeout(() => {
        setState((prev) =>
          prev.instruction
            ? prev
            : { ...prev, instruction: buildFallbackInstruction(activeStyleId) },
        );
      }, cumulativeDelay + 320);
      timersRef.current.push(fallbackTimer);
    },
    [reset],
  );

  return { ...state, run, reset };
}
