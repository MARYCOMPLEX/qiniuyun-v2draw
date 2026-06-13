"use client";

import { useCallback, useRef, useState } from "react";

import {
  applyUndo,
  dispatchSyncCommand,
} from "../dispatchers/sync-dispatcher";
import { dispatchAsyncCommand } from "../dispatchers/async-dispatcher";
import { useJobStream, type JobDoneEvent, type JobFailedEvent } from "./useJobStream";
import {
  platformCommandToAction,
  type PlatformAction,
} from "@/features/platform/reducer";
import type {
  CanvasCommand,
  PartialCanvasEnvelope,
} from "@/shared/types/canvas-tools";
import type {
  HistoryEntry,
  ImageLayer,
  LayerMap,
} from "@/shared/types/layer";
import {
  CANVAS_TOOL,
  isCanvasTool,
  isHistoryTracked,
  isPlatformTool,
} from "@/shared/types/tools";

export interface CanvasOrchestratorState {
  readonly layers: LayerMap;
  readonly history: ReadonlyArray<HistoryEntry>;
  readonly streaming: boolean;
  readonly latestNarration: string | null;
  readonly error: string | null;
}

export interface UseCanvasOrchestratorParams {
  readonly activeStyleId: string;
  /** 当 LLM 命令包含 platform.* 时, 上层用这个 dispatch 应用 */
  readonly platformDispatch: (action: PlatformAction) => void;
}

export interface UseCanvasOrchestratorResult extends CanvasOrchestratorState {
  /** 用户说一句话 → 调 LLM → 流式分发命令 */
  readonly run: (utterance: string) => Promise<void>;
  readonly reset: () => void;
}

const HISTORY_MAX = 50;

/**
 * 多模态画布主编排器 — 唯一的命令落地点。
 *
 * 数据流:
 *   用户说话 → ASR transcript → run(utterance)
 *      → POST /api/generate-draw (LLM 流式吐 commands JSON)
 *      → partial-json 解析每帧
 *      → 完整命令立即分发:
 *           platform.* → platformDispatch
 *           canvas.* 同步 (move/resize/...) → dispatchSyncCommand
 *           canvas.* 异步 (generate/edit/...) → dispatchAsyncCommand + fetch /api/canvas/generate
 *      → SSE (useJobStream) 收到 job-done → 替换 layer.imageUrl
 */
export function useCanvasOrchestrator(
  params: UseCanvasOrchestratorParams,
): UseCanvasOrchestratorResult {
  const [layers, setLayers] = useState<LayerMap>(new Map());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [latestNarration, setLatestNarration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const historyRef = useRef(history);
  historyRef.current = history;
  const activeStyleIdRef = useRef(params.activeStyleId);
  activeStyleIdRef.current = params.activeStyleId;
  const platformDispatchRef = useRef(params.platformDispatch);
  platformDispatchRef.current = params.platformDispatch;
  const abortRef = useRef<AbortController | null>(null);
  const appliedCommandIdsRef = useRef<Set<string>>(new Set());

  // 推历史栈, 限制 HISTORY_MAX
  const pushHistory = useCallback((entry: HistoryEntry): void => {
    setHistory((prev) => {
      const next = [...prev, entry];
      return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
    });
  }, []);

  // SSE 监听:job-done 替换图, job-failed 标记失败
  useJobStream({
    onDone: (event: JobDoneEvent) => {
      setLayers((prev) => {
        const target = prev.get(event.layerId);
        if (!target) return prev;
        const next = new Map(prev);
        next.set(event.layerId, {
          ...target,
          status: "done",
          imageUrl: event.imageUrl,
          thumbnailUrl: event.thumbnailUrl ?? event.imageUrl,
          modelId: event.modelId,
          seed: event.seed,
          jobId: event.jobId,
          completedAt: Date.now(),
        });
        return next;
      });
    },
    onFailed: (event: JobFailedEvent) => {
      setLayers((prev) => {
        const target = prev.get(event.layerId);
        if (!target) return prev;
        const next = new Map(prev);
        next.set(event.layerId, {
          ...target,
          status: "failed",
          error: event.error,
          jobId: event.jobId,
          completedAt: Date.now(),
        });
        return next;
      });
    },
  });

  /**
   * 应用一条完整命令 — platform/sync/async 三路分流。
   * 异步命令会立即 fetch, 不等结果 (jobId 通过 SSE 反向通知)。
   */
  const applyCommand = useCallback(
    async (command: CanvasCommand): Promise<void> => {
      // platform.* → 走 reducer
      if (isPlatformTool(command.tool)) {
        const action = platformCommandToAction(command as Parameters<typeof platformCommandToAction>[0]);
        platformDispatchRef.current(action);
        if (isHistoryTracked(command.tool)) {
          pushHistory({
            id: `h-${Date.now().toString(36)}`,
            timestamp: Date.now(),
            tool: command.tool,
            args: command as unknown as Record<string, unknown>,
            beforeSnapshot: {
              layers: layersRef.current,
              activeStyleId: activeStyleIdRef.current,
            },
          });
        }
        return;
      }

      if (!isCanvasTool(command.tool)) return;

      // canvas.undo — 弹历史栈
      if (command.tool === CANVAS_TOOL.UNDO) {
        const { nextLayers, remainingHistory } = applyUndo(
          (command as { steps?: number }).steps ?? 1,
          historyRef.current,
        );
        setLayers(nextLayers);
        setHistory(remainingHistory);
        return;
      }

      // 异步命令 (生图 / 编辑)
      if (isAsyncCanvasTool(command.tool)) {
        const result = dispatchAsyncCommand(command, layersRef.current);
        if (result.placeholderLayer) {
          setLayers(result.nextLayers);
          if (isHistoryTracked(command.tool)) {
            pushHistory({
              id: `h-${Date.now().toString(36)}`,
              timestamp: Date.now(),
              tool: command.tool,
              args: command as unknown as Record<string, unknown>,
              beforeSnapshot: {
                layers: layersRef.current,
                activeStyleId: activeStyleIdRef.current,
              },
            });
          }
          if (result.fetchPayload) {
            void fetch("/api/canvas/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(result.fetchPayload),
            }).then(async (res) => {
              if (!res.ok) {
                console.warn("[orchestrator] generate fetch failed:", res.status);
                setLayers((prev) => {
                  const target = prev.get(result.placeholderLayer!.id);
                  if (!target) return prev;
                  const next = new Map(prev);
                  next.set(target.id, {
                    ...target,
                    status: "failed",
                    error: `生图请求失败: ${res.status}`,
                    completedAt: Date.now(),
                  });
                  return next;
                });
                return;
              }
              const body = (await res.json()) as { data?: { jobId: string } };
              const jobId = body.data?.jobId;
              if (jobId) {
                setLayers((prev) => {
                  const target = prev.get(result.placeholderLayer!.id);
                  if (!target) return prev;
                  const next = new Map(prev);
                  next.set(target.id, { ...target, jobId });
                  return next;
                });
              }
            }).catch((err) => {
              console.warn("[orchestrator] generate fetch error:", err);
            });
          }
        }
        return;
      }

      // 同步命令 (布局 / 删除)
      const result = dispatchSyncCommand(
        command,
        layersRef.current,
        activeStyleIdRef.current,
      );
      setLayers(result.nextLayers);
      if (result.historyEntry) pushHistory(result.historyEntry);
    },
    [pushHistory],
  );

  const run = useCallback(
    async (utterance: string): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setError(null);
      appliedCommandIdsRef.current.clear();

      try {
        const response = await fetch("/api/generate-draw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            utterance,
            activeStyleId: activeStyleIdRef.current,
            existingShapes: Array.from(layersRef.current.values()).map((l) => ({
              id: l.id,
              shape: "image",
              size: Math.max(l.size.width, l.size.height),
              position: l.position,
              prompt: l.prompt,
            })),
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`generate-draw ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        const { parse, Allow } = await import("partial-json");

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });

          let partial: PartialCanvasEnvelope | null = null;
          try {
            partial = parse(accumulated, Allow.ALL) as PartialCanvasEnvelope;
          } catch {
            continue;
          }
          if (!partial?.commands) continue;

          for (let i = 0; i < partial.commands.length; i++) {
            const cmd = partial.commands[i];
            if (!cmd?.tool) continue;
            const fingerprint = `${i}:${JSON.stringify(cmd)}`;
            if (appliedCommandIdsRef.current.has(fingerprint)) continue;
            // 只应用看起来"完整"的命令 — 字段够齐全
            if (!isCommandComplete(cmd)) continue;
            appliedCommandIdsRef.current.add(fingerprint);
            await applyCommand(cmd as CanvasCommand);
          }

          if (partial.narration) setLatestNarration(partial.narration);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "stream 失败";
        console.warn("[orchestrator] run error:", msg);
        setError(msg);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [applyCommand],
  );

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLayers(new Map());
    setHistory([]);
    setStreaming(false);
    setLatestNarration(null);
    setError(null);
  }, []);

  return { layers, history, streaming, latestNarration, error, run, reset };
}

// 工具: 判断 canvas tool 是否异步
function isAsyncCanvasTool(tool: string): boolean {
  return (
    tool === CANVAS_TOOL.GENERATE_IMAGE ||
    tool === CANVAS_TOOL.GENERATE_BACKGROUND ||
    tool === CANVAS_TOOL.GENERATE_CHARACTER ||
    tool === CANVAS_TOOL.GENERATE_VARIATIONS ||
    tool === CANVAS_TOOL.GENERATE_REFERENCE_COMPOSE ||
    tool === CANVAS_TOOL.EDIT_IMAGE ||
    tool === CANVAS_TOOL.INPAINT_LAYER ||
    tool === CANVAS_TOOL.OUTPAINT_LAYER ||
    tool === CANVAS_TOOL.STYLE_TRANSFER ||
    tool === CANVAS_TOOL.REMOVE_BACKGROUND ||
    tool === CANVAS_TOOL.UPSCALE_LAYER ||
    tool === CANVAS_TOOL.REGENERATE_LAYER
  );
}

// 工具: 命令完整性检查 — 流式中间帧字段不全时跳过
function isCommandComplete(cmd: { tool?: string; [k: string]: unknown }): boolean {
  if (!cmd.tool) return false;
  if (cmd.tool === CANVAS_TOOL.CLEAR_CANVAS) return true;
  if (typeof cmd.tool !== "string") return false;
  // 大部分命令都有 prompt 或 targetLayerId
  if ("prompt" in cmd) return typeof cmd.prompt === "string" && cmd.prompt.length > 0;
  if ("targetLayerId" in cmd) return typeof cmd.targetLayerId === "string";
  if ("themeId" in cmd) return typeof cmd.themeId === "string";
  if ("panelId" in cmd) return typeof cmd.panelId === "string";
  return true; // toggle_* / pan/zoom 没必填字段
}

// 暴露 ImageLayer 类型给消费者
export type { ImageLayer };
