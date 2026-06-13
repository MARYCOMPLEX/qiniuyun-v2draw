/**
 * Canvas dispatcher — 同步业务工具应用到 LayerMap。
 *
 * 处理:
 * - move/resize/rotate/set_layer_props/arrange/delete/clear (同步, 立即应用)
 * - undo (从 history 恢复)
 *
 * 不处理 (走 PR-D 的 async path):
 * - generate_*  (异步生图, 创建 placeholder + jobId)
 * - edit/inpaint/outpaint/style_transfer/remove_bg/upscale/regenerate (异步图编辑)
 *
 * 见 docs/protocols/multimodal-canvas.md §3。
 */

import type { CanvasCommand } from "@/shared/types/canvas-tools";
import type {
  HistoryEntry,
  ImageLayer,
  LayerMap,
} from "@/shared/types/layer";
import { CANVAS_TOOL } from "@/shared/types/tools";

export interface CanvasDispatchResult {
  readonly nextLayers: LayerMap;
  /** 该命令是否要入历史栈 (canvas 同步工具一律入) */
  readonly historyEntry?: HistoryEntry;
  /** undo 命令时返回的快照层数 */
  readonly undoApplied?: number;
}

const cloneLayers = (map: LayerMap): Map<string, ImageLayer> => new Map(map);

const updateLayerInPlace = (
  map: Map<string, ImageLayer>,
  id: string,
  patch: Partial<ImageLayer>,
): boolean => {
  const existing = map.get(id);
  if (!existing) return false;
  map.set(id, { ...existing, ...patch });
  return true;
};

const buildHistoryEntry = (
  command: CanvasCommand,
  beforeLayers: LayerMap,
  beforeStyleId?: string,
): HistoryEntry => ({
  id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  timestamp: Date.now(),
  tool: command.tool,
  args: command as unknown as Record<string, unknown>,
  beforeSnapshot: {
    layers: beforeLayers,
    activeStyleId: beforeStyleId,
  },
});

/**
 * 应用单条同步命令到 LayerMap。
 * 返回 { nextLayers, historyEntry } — 上层把 historyEntry 推到栈里。
 *
 * 异步命令 (generate/edit/inpaint 等) 不应该到达这里, 上层 orchestrator 会先分流。
 */
export function dispatchSyncCommand(
  command: CanvasCommand,
  layers: LayerMap,
  activeStyleId: string,
): CanvasDispatchResult {
  const next = cloneLayers(layers);

  switch (command.tool) {
    case CANVAS_TOOL.MOVE_LAYER: {
      const target = next.get(command.targetLayerId);
      if (!target) return { nextLayers: layers };
      const newPos = command.to
        ? command.to
        : command.delta
          ? {
              x: target.position.x + command.delta.dx,
              y: target.position.y + command.delta.dy,
            }
          : target.position;
      updateLayerInPlace(next, target.id, { position: newPos });
      return {
        nextLayers: next,
        historyEntry: buildHistoryEntry(command, layers, activeStyleId),
      };
    }

    case CANVAS_TOOL.RESIZE_LAYER: {
      const target = next.get(command.targetLayerId);
      if (!target) return { nextLayers: layers };
      const newSize =
        command.size !== undefined
          ? command.size
          : command.scale !== undefined
            ? {
                width: Math.max(1, target.size.width * command.scale),
                height: Math.max(1, target.size.height * command.scale),
              }
            : target.size;
      updateLayerInPlace(next, target.id, { size: newSize });
      return {
        nextLayers: next,
        historyEntry: buildHistoryEntry(command, layers, activeStyleId),
      };
    }

    case CANVAS_TOOL.ROTATE_LAYER: {
      const target = next.get(command.targetLayerId);
      if (!target) return { nextLayers: layers };
      updateLayerInPlace(next, target.id, { rotation: command.degrees });
      return {
        nextLayers: next,
        historyEntry: buildHistoryEntry(command, layers, activeStyleId),
      };
    }

    case CANVAS_TOOL.SET_LAYER_PROPS: {
      const target = next.get(command.targetLayerId);
      if (!target) return { nextLayers: layers };
      const patch: Partial<ImageLayer> = {
        ...(command.opacity !== undefined ? { opacity: command.opacity } : {}),
        ...(command.zIndex !== undefined ? { zIndex: command.zIndex } : {}),
      };
      updateLayerInPlace(next, target.id, patch);
      return {
        nextLayers: next,
        historyEntry: buildHistoryEntry(command, layers, activeStyleId),
      };
    }

    case CANVAS_TOOL.ARRANGE_LAYERS: {
      const targets = command.layerIds
        .map((id) => next.get(id))
        .filter((l): l is ImageLayer => l !== undefined);
      if (targets.length < 2) return { nextLayers: layers };
      const positions = arrangePositions(command.pattern, targets.length);
      targets.forEach((layer, i) => {
        const pos = positions[i]!;
        updateLayerInPlace(next, layer.id, { position: pos });
      });
      return {
        nextLayers: next,
        historyEntry: buildHistoryEntry(command, layers, activeStyleId),
      };
    }

    case CANVAS_TOOL.DELETE_LAYER: {
      if (!next.has(command.targetLayerId)) return { nextLayers: layers };
      next.delete(command.targetLayerId);
      return {
        nextLayers: next,
        historyEntry: buildHistoryEntry(command, layers, activeStyleId),
      };
    }

    case CANVAS_TOOL.CLEAR_CANVAS: {
      if (next.size === 0) return { nextLayers: layers };
      next.clear();
      return {
        nextLayers: next,
        historyEntry: buildHistoryEntry(command, layers, activeStyleId),
      };
    }

    default:
      return { nextLayers: layers };
  }
}

/**
 * 计算 arrange_layers 的目标位置。
 * Why: 让 LLM 不需要算坐标, 只需要选 pattern, 前端按布局算法摆。
 */
function arrangePositions(
  pattern: "grid" | "row" | "column" | "radial",
  count: number,
): Array<{ x: number; y: number }> {
  const stageCenter = { x: 512, y: 384 };
  const SPACING = 280;

  if (pattern === "row") {
    return Array.from({ length: count }, (_, i) => ({
      x: stageCenter.x + (i - (count - 1) / 2) * SPACING,
      y: stageCenter.y,
    }));
  }

  if (pattern === "column") {
    return Array.from({ length: count }, (_, i) => ({
      x: stageCenter.x,
      y: stageCenter.y + (i - (count - 1) / 2) * SPACING,
    }));
  }

  if (pattern === "radial") {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      return {
        x: stageCenter.x + Math.cos(angle) * SPACING,
        y: stageCenter.y + Math.sin(angle) * SPACING,
      };
    });
  }

  // grid (默认)
  const cols = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: stageCenter.x + (col - (cols - 1) / 2) * SPACING,
      y: stageCenter.y + (row - (cols - 1) / 2) * SPACING,
    };
  });
}

/**
 * 应用 undo 命令 — 从历史栈弹出 N 条, 恢复到最早的快照。
 * Why: 撤销是命令应用前的快照, 弹 1 条 = 回到该命令之前的状态。
 */
export function applyUndo(
  steps: number,
  history: ReadonlyArray<HistoryEntry>,
): {
  nextLayers: LayerMap;
  nextStyleId?: string;
  poppedCount: number;
  remainingHistory: HistoryEntry[];
} {
  if (history.length === 0) {
    return {
      nextLayers: new Map(),
      poppedCount: 0,
      remainingHistory: [],
    };
  }
  const popN = Math.min(steps, history.length);
  const targetIndex = history.length - popN; // 弹出 popN 条后剩下的最后一条
  const restore = history[targetIndex]!;
  return {
    nextLayers: restore.beforeSnapshot.layers,
    nextStyleId: restore.beforeSnapshot.activeStyleId,
    poppedCount: popN,
    remainingHistory: history.slice(0, targetIndex),
  };
}
