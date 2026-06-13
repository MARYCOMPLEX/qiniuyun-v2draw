"use client";

import { parse, Allow } from "partial-json";
import { useCallback, useRef, useState } from "react";

import {
  buildFallbackMap,
  dispatchPartialEnvelope,
  restyleAll,
  type CanvasShape,
  type ShapeMap,
} from "@/features/art-canvas/utils/toolDispatcher";
import type { StyleId } from "@/shared/constants/marketStyles";
import type { PartialDrawTool } from "@/shared/types/schema";

export interface DrawTurnLog {
  readonly id: string;
  readonly timestamp: number;
  readonly utterance: string;
  readonly narration: string;
  readonly commandCount: number;
  readonly status: "streaming" | "done" | "error";
  readonly error?: string;
}

interface DrawStreamState {
  readonly streaming: boolean;
  readonly shapes: ShapeMap;
  readonly latestPartialJson: string;
  readonly turns: readonly DrawTurnLog[];
  readonly pendingStyleSwitch: StyleId | null;
  readonly error: string | null;
}

interface DrawStreamRunOptions {
  readonly onStyleSwitch?: (next: StyleId) => void;
}

interface DrawStreamAPI extends DrawStreamState {
  readonly run: (
    utterance: string,
    activeStyleId: StyleId,
    options?: DrawStreamRunOptions,
  ) => Promise<void>;
  readonly reset: () => void;
  /** 用户手动切风格时调用 — 重新解析所有 shape 的 stroke 色 */
  readonly restyle: (newStyleId: StyleId) => void;
}

const truncate = (text: string): string =>
  text.length > 240 ? `${text.slice(0, 237)}…` : text;

const summarizeShapes = (shapes: ShapeMap): Array<{
  id: string;
  shape: string;
  size: number;
  position: { x: number; y: number };
  useAccentColor: boolean;
}> =>
  Array.from(shapes.values()).map((s: CanvasShape) => ({
    id: s.id,
    shape: s.shape,
    size: Math.round(s.size),
    position: { x: Math.round(s.position.x), y: Math.round(s.position.y) },
    useAccentColor: s.useAccentColor,
  }));

/**
 * 真流式画图驱动 — 多工具命令版。
 * Why: streamObject().toTextStreamResponse() 流出"单一 JSON 对象的逐字 delta"。
 * 每收到一段就累积全文, 用 partial-json 容忍未闭合字段。指纹去重避免重复应用。
 * 命令通过 dispatchPartialEnvelope 增量打到 shapeMap, STYLE_TRANSFORM 走副作用通道。
 */
export function useDrawStream(): DrawStreamAPI {
  const [state, setState] = useState<DrawStreamState>({
    streaming: false,
    shapes: new Map(),
    latestPartialJson: "",
    turns: [],
    pendingStyleSwitch: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const shapesRef = useRef<ShapeMap>(new Map());

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    shapesRef.current = new Map();
    setState({
      streaming: false,
      shapes: new Map(),
      latestPartialJson: "",
      turns: [],
      pendingStyleSwitch: null,
      error: null,
    });
  }, []);

  /**
   * 用户手动切风格时调用 — 重新解析所有 shape 的 stroke 色。
   * Why: STYLE_TRANSFORM 命令会自动 restyle, 但前端风格卡点击切换不走命令通道,
   * 需要单独触发一次 restyle 让画布颜色立即跟随新风格的 palette。
   */
  const restyle = useCallback((newStyleId: StyleId): void => {
    const restyled = restyleAll(shapesRef.current, newStyleId);
    shapesRef.current = restyled;
    setState((prev) => ({ ...prev, shapes: restyled }));
  }, []);

  const run = useCallback(
    async (
      utterance: string,
      activeStyleId: StyleId,
      options?: DrawStreamRunOptions,
    ): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const turnId = `turn-${Date.now()}`;
      const turn: DrawTurnLog = {
        id: turnId,
        timestamp: Date.now(),
        utterance,
        narration: "",
        commandCount: 0,
        status: "streaming",
      };

      setState((prev) => ({
        ...prev,
        streaming: true,
        error: null,
        latestPartialJson: "",
        turns: [...prev.turns.slice(-19), turn],
      }));

      try {
        const response = await fetch("/api/generate-draw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            utterance,
            activeStyleId,
            existingShapes: summarizeShapes(shapesRef.current),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => "");
          throw new Error(`generate-draw ${response.status}: ${text.slice(0, 160)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let lastFingerprint = "";
        let lastNarration = "";
        let lastCommandCount = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });

          let parsed: PartialDrawTool | null = null;
          try {
            parsed = parse(accumulated, Allow.ALL) as PartialDrawTool;
          } catch {
            continue;
          }
          if (!parsed) continue;

          const fingerprint = JSON.stringify(parsed);
          if (fingerprint === lastFingerprint) continue;
          lastFingerprint = fingerprint;

          const outcome = dispatchPartialEnvelope(parsed, shapesRef.current, activeStyleId);
          shapesRef.current = outcome.nextMap;

          if (outcome.sideEffect.nextActiveStyleId) {
            options?.onStyleSwitch?.(outcome.sideEffect.nextActiveStyleId);
          }

          if (typeof parsed.narration === "string") lastNarration = parsed.narration;
          if (Array.isArray(parsed.commands)) lastCommandCount = parsed.commands.length;

          const fragment = truncate(fingerprint);
          setState((prev) => ({
            ...prev,
            shapes: outcome.nextMap,
            latestPartialJson: fragment,
            pendingStyleSwitch: outcome.sideEffect.nextActiveStyleId ?? null,
            turns: prev.turns.map((t) =>
              t.id === turnId
                ? { ...t, narration: lastNarration, commandCount: lastCommandCount }
                : t,
            ),
          }));
        }

        setState((prev) => ({
          ...prev,
          turns: prev.turns.map((t) => (t.id === turnId ? { ...t, status: "done" } : t)),
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "stream 失败";
        // 没画出任何东西时给个兜底
        if (shapesRef.current.size === 0) {
          shapesRef.current = buildFallbackMap(activeStyleId);
        }
        setState((prev) => ({
          ...prev,
          shapes: shapesRef.current,
          error: message,
          turns: prev.turns.map((t) =>
            t.id === turnId ? { ...t, status: "error", error: message } : t,
          ),
        }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setState((prev) => ({ ...prev, streaming: false }));
      }
    },
    [],
  );

  return { ...state, run, reset, restyle };
}
