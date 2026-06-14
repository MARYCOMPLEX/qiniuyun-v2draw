"use client";

import { useCallback, useRef, useState } from "react";

import {
  applyAppendDiagram,
  applyDisplayDiagram,
  applyEditDiagram,
} from "@/features/diagram/dispatchers/drawio-dispatcher";
import { isMxCellXmlComplete } from "@/features/diagram/utils/mxCellUtils";
import { buildImageMxCell } from "@/features/diagram/utils/imageMxCell";
import {
  isDrawioTool,
  DRAWIO_TOOL,
  type DrawioCommand,
  type EditDiagramCommand,
} from "@/shared/types/drawio-tools";
import {
  applyUndo,
  dispatchSyncCommand,
} from "../dispatchers/sync-dispatcher";
import { dispatchAsyncCommand } from "../dispatchers/async-dispatcher";
import { useJobStream, type JobDoneEvent, type JobFailedEvent } from "./useJobStream";
import {
  allocateTurnId,
  buildActionSummary,
  buildHistoryMessages,
  type AgentAction,
  type ConversationTurn,
} from "../types/conversation";
import {
  platformCommandToAction,
  type PlatformAction,
} from "@/features/platform/reducer";
import type {
  CanvasCommand,
} from "@/shared/types/canvas-tools";
import type { PartialUnifiedEnvelope } from "@/shared/types/unified-tools";
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
  readonly turns: ReadonlyArray<ConversationTurn>;
  readonly streaming: boolean;
  readonly latestNarration: string | null;
  readonly error: string | null;
}

export interface UseCanvasOrchestratorParams {
  readonly activeStyleId: string;
  /** 当 LLM 命令包含 platform.* 时, 上层用这个 dispatch 应用 */
  readonly platformDispatch: (action: PlatformAction) => void;
  /** drawio dispatch context — 当 LLM 命令包含 drawio.* 时调用 */
  readonly diagramDispatch?: {
    readonly chartXML: string;
    readonly loadDiagram: (xml: string) => string | null;
  };
}

export interface UseCanvasOrchestratorResult extends CanvasOrchestratorState {
  /** 用户说一句话 → 调 LLM → 流式分发命令 */
  readonly run: (utterance: string) => Promise<void>;
  readonly reset: () => void;
}

const HISTORY_MAX = 50;
const CONTEXT_MAX_TURNS = 5;

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
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
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
  const diagramDispatchRef = useRef(params.diagramDispatch);
  diagramDispatchRef.current = params.diagramDispatch;

  /**
   * 更新最新 turn (immutable patch)。
   * 用 ref 闭包保证 SSE 异步回调能拿到最新状态。
   */
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const currentTurnIdRef = useRef<string | null>(null);

  const patchCurrentTurn = useCallback(
    (patch: (turn: ConversationTurn) => ConversationTurn): void => {
      setTurns((prev) => {
        const id = currentTurnIdRef.current;
        if (!id) return prev;
        return prev.map((t) => (t.id === id ? patch(t) : t));
      });
    },
    [],
  );

  /** 按 layerId 找到对应的 action 并更新状态 + 检查 turn 是否全部完成 */
  const patchActionByLayerId = useCallback(
    (layerId: string, status: AgentAction["status"], errorMsg?: string): void => {
      setTurns((prev) =>
        prev.map((t) => {
          const hadMatch = t.actions.some((a) => a.layerId === layerId);
          if (!hadMatch) return t;
          const nextActions = t.actions.map((a) =>
            a.layerId === layerId ? { ...a, status, error: errorMsg } : a,
          );
          // 如果该 turn 还在 executing 且无 running, 落定终态
          let nextStatus = t.status;
          if (t.status === "executing") {
            const stillRunning = nextActions.some((a) => a.status === "running");
            if (!stillRunning) {
              const hasFailed = nextActions.some((a) => a.status === "failed");
              nextStatus = hasFailed ? "failed" : "done";
            }
          }
          return { ...t, actions: nextActions, status: nextStatus };
        }),
      );
    },
    [],
  );
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
      const layerSnapshotRef: { value: ImageLayer | null } = { value: null };
      setLayers((prev) => {
        const target = prev.get(event.layerId);
        if (!target) return prev;
        const next = new Map(prev);
        const updated: ImageLayer = {
          ...target,
          status: "done",
          imageUrl: event.imageUrl,
          thumbnailUrl: event.thumbnailUrl ?? event.imageUrl,
          modelId: event.modelId,
          seed: event.seed,
          jobId: event.jobId,
          completedAt: Date.now(),
        };
        next.set(event.layerId, updated);
        layerSnapshotRef.value = updated;
        return next;
      });
      patchActionByLayerId(event.layerId, "done");

      // ★ 把生成的图注入 drawio 画布 (作 image mxCell)
      const dispatch = diagramDispatchRef.current;
      const snap = layerSnapshotRef.value;
      if (dispatch && snap) {
        const mxCellXml = buildImageMxCell({
          id: snap.id,
          imageUrl: event.imageUrl,
          position: snap.position,
          size: snap.size,
          aspectLocked: true,
        });
        const editCmd: EditDiagramCommand = {
          tool: DRAWIO_TOOL.EDIT_DIAGRAM,
          operations: [
            {
              operation: "add",
              cell_id: snap.id,
              new_xml: mxCellXml,
            },
          ],
        };
        applyEditDiagram(editCmd, dispatch);
      }
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
      patchActionByLayerId(event.layerId, "failed", event.error);
    },
  });

  /**
   * 应用一条完整命令 — platform/sync/async 三路分流。
   * 异步命令会立即 fetch, 不等结果 (jobId 通过 SSE 反向通知)。
   */
  const applyCommand = useCallback(
    async (command: CanvasCommand | DrawioCommand): Promise<void> => {
      const summary = buildActionSummary(
        command.tool,
        command as unknown as Record<string, unknown>,
      );

      // drawio.* → 走 diagram dispatcher
      if (isDrawioTool(command.tool)) {
        const dispatch = diagramDispatchRef.current;
        if (!dispatch) {
          console.warn("[orchestrator] drawio command but no diagramDispatch:", command.tool);
          return;
        }
        const drawioCmd = command as DrawioCommand;
        switch (drawioCmd.tool) {
          case "drawio.display_diagram":
            applyDisplayDiagram(drawioCmd, dispatch);
            break;
          case "drawio.edit_diagram":
            applyEditDiagram(drawioCmd, dispatch);
            break;
          case "drawio.append_diagram":
            applyAppendDiagram(drawioCmd, dispatch);
            break;
          case "drawio.get_shape_library":
            // 服务端 tool execute 已直接返回内容给 LLM, 客户端无操作
            break;
        }
        patchCurrentTurn((t) => ({
          ...t,
          actions: [...t.actions, { tool: command.tool, summary, status: "done" }],
        }));
        return;
      }

      // platform.* → 走 reducer
      if (isPlatformTool(command.tool)) {
        const action = platformCommandToAction(command as Parameters<typeof platformCommandToAction>[0]);
        platformDispatchRef.current(action);
        // 平台工具同步, action 立即 done
        patchCurrentTurn((t) => ({
          ...t,
          actions: [...t.actions, { tool: command.tool, summary, status: "done" }],
        }));
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
        patchCurrentTurn((t) => ({
          ...t,
          actions: [...t.actions, { tool: command.tool, summary, status: "done" }],
        }));
        return;
      }

      // 异步命令 (生图 / 编辑)
      if (isAsyncCanvasTool(command.tool)) {
        const result = dispatchAsyncCommand(command as CanvasCommand, layersRef.current);
        if (result.placeholderLayer) {
          setLayers(result.nextLayers);
          // 异步: action 进 running, 关联 layerId, 等 SSE 改成 done/failed
          const layerId = result.placeholderLayer.id;
          patchCurrentTurn((t) => ({
            ...t,
            actions: [...t.actions, { tool: command.tool, summary, status: "running", layerId }],
          }));
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
          if (result.fetchPayload && result.fetchPayload.prompt?.trim()) {
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
        command as CanvasCommand,
        layersRef.current,
        activeStyleIdRef.current,
      );
      setLayers(result.nextLayers);
      if (result.historyEntry) pushHistory(result.historyEntry);
      // 同步命令立即 done
      patchCurrentTurn((t) => ({
        ...t,
        actions: [...t.actions, { tool: command.tool, summary, status: "done" }],
      }));
    },
    [pushHistory, patchCurrentTurn],
  );

  const run = useCallback(
    async (utterance: string): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setError(null);
      appliedCommandIdsRef.current.clear();

      // 创建一个新 turn — 状态 streaming, 无 narration / 无 actions
      const turnId = allocateTurnId();
      currentTurnIdRef.current = turnId;
      const newTurn: ConversationTurn = {
        id: turnId,
        timestamp: Date.now(),
        userUtterance: utterance,
        narration: null,
        actions: [],
        status: "streaming",
        turnIndex: 1,
      };
      setTurns((prev) => [...prev, newTurn]);

      try {
        const history = buildHistoryMessages(turnsRef.current, CONTEXT_MAX_TURNS);
        const response = await fetch("/api/generate-draw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            utterance,
            activeStyleId: activeStyleIdRef.current,
            history,
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

          let partial: PartialUnifiedEnvelope | null = null;
          try {
            partial = parse(accumulated, Allow.ALL) as PartialUnifiedEnvelope;
          } catch {
            continue;
          }
          if (!partial?.commands) continue;

          for (let i = 0; i < partial.commands.length; i++) {
            const cmd = partial.commands[i];
            if (!cmd?.tool) continue;
            // fingerprint: 同一 index + 同一 tool 视为同一条命令, 不论后续字段如何补全。
            // Why: partial 流式中字段渐进增长, 不能用 JSON.stringify 当指纹 (每帧都不一样)。
            const fingerprint = `${i}:${cmd.tool}`;
            if (appliedCommandIdsRef.current.has(fingerprint)) continue;
            // 只应用看起来"完整"的命令 — 字段够齐全
            if (!isCommandComplete(cmd)) continue;
            appliedCommandIdsRef.current.add(fingerprint);
            // 进入 executing 状态
            patchCurrentTurn((t) => ({ ...t, status: "executing" }));
            await applyCommand(cmd as CanvasCommand | DrawioCommand);
          }

          if (partial.narration) {
            setLatestNarration(partial.narration);
            patchCurrentTurn((t) => ({ ...t, narration: partial!.narration ?? null }));
          }
        }
        // LLM 流结束 — turn 状态根据 actions 判断
        patchCurrentTurn((t) => {
          const hasFailed = t.actions.some((a) => a.status === "failed");
          const stillRunning = t.actions.some((a) => a.status === "running");
          // 如果有 running 的异步任务, 保持 executing 让 SSE 完成
          if (stillRunning) return { ...t, status: "executing" };
          return { ...t, status: hasFailed ? "failed" : "done" };
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "stream 失败";
        console.warn("[orchestrator] run error:", msg);
        setError(msg);
        patchCurrentTurn((t) => ({ ...t, status: "failed" }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [applyCommand, patchCurrentTurn],
  );

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLayers(new Map());
    setHistory([]);
    setTurns([]);
    setStreaming(false);
    setLatestNarration(null);
    setError(null);
    currentTurnIdRef.current = null;
  }, []);

  return { layers, history, turns, streaming, latestNarration, error, run, reset };
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
  // drawio.* 字段独立校验, 优先级最高
  if (cmd.tool === "drawio.display_diagram" || cmd.tool === "drawio.append_diagram") {
    if (typeof cmd.xml !== "string" || cmd.xml.length === 0) return false;
    // ★ 关键: xml 还在流式累加时不应用, 等最后一个 mxCell 闭合再 dispatch
    return isMxCellXmlComplete(cmd.xml);
  }
  if (cmd.tool === "drawio.edit_diagram") {
    return Array.isArray(cmd.operations) && cmd.operations.length > 0;
  }
  if (cmd.tool === "drawio.get_shape_library") {
    return typeof cmd.library === "string";
  }
  // 大部分命令都有 prompt 或 targetLayerId
  if ("prompt" in cmd) return typeof cmd.prompt === "string" && cmd.prompt.length > 0;
  if ("targetLayerId" in cmd) return typeof cmd.targetLayerId === "string";
  if ("themeId" in cmd) return typeof cmd.themeId === "string";
  if ("panelId" in cmd) return typeof cmd.panelId === "string";
  return true; // toggle_* / pan/zoom 没必填字段
}

// 暴露 ImageLayer 类型给消费者
export type { ImageLayer };
