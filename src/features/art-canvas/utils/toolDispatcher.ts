import {
  COMMAND_TYPE,
  isBatchTransform,
  isClearCanvas,
  isCreateShapes,
  isDeleteShape,
  isModifyShape,
  isMoveShape,
  isResizeShape,
  isStyleTransform,
  type DrawCommand,
  type PartialDrawTool,
  type ShapeBlueprint,
  type ShapePatch,
} from "@/shared/types/schema";
import {
  getStyleById,
  resolveStrokeColor,
  type StyleId,
} from "@/shared/constants/marketStyles";

/**
 * 画布上的单个图元 — 调度器把"工具语义 + 风格色彩"拍平成画布指令。
 */
export interface CanvasShape {
  readonly id: string;
  readonly shape: "circle" | "rectangle" | "line";
  readonly position: { readonly x: number; readonly y: number };
  readonly size: number;
  readonly stroke: string;
  /** 保留 useAccentColor 让风格切换时能重新解析 stroke */
  readonly useAccentColor: boolean;
}

export type ShapeMap = ReadonlyMap<string, CanvasShape>;

export interface DispatchSideEffect {
  readonly nextActiveStyleId?: StyleId;
}

export interface DispatchOutcome {
  readonly nextMap: ShapeMap;
  readonly sideEffect: DispatchSideEffect;
}

let idCounter = 0;
/**
 * 前端分配 id — LLM 给的 id 如果是 'new-*' 或为空就重新分配。
 * 这样保证 id 全局唯一, 不会因 LLM 重用 'c-1' 等重复 id 导致旧图元覆盖。
 */
const allocateId = (hint?: string): string => {
  if (hint && !hint.startsWith("new-") && hint.trim() !== "") return hint;
  idCounter += 1;
  return `s-${Date.now().toString(36)}-${idCounter}`;
};

const blueprintToShape = (
  blueprint: ShapeBlueprint,
  activeStyleId: StyleId,
  existingMap: ShapeMap,
): CanvasShape => {
  const style = getStyleById(activeStyleId);
  // 如果 blueprint.id 已经存在 → 直接复用 (LLM 想 update 而不是 create)
  // 如果是新 id 但用户给的 hint 像 'new-*' → 重新分配
  const id = existingMap.has(blueprint.id) ? blueprint.id : allocateId(blueprint.id);
  return {
    id,
    shape: blueprint.shape,
    position: blueprint.position,
    size: Math.max(0, blueprint.size),
    stroke: resolveStrokeColor(style, blueprint.useAccentColor),
    useAccentColor: blueprint.useAccentColor,
  };
};

const applyPatch = (
  existing: CanvasShape,
  patch: ShapePatch,
  activeStyleId: StyleId,
): CanvasShape => {
  const style = getStyleById(activeStyleId);
  const nextUseAccent =
    patch.useAccentColor !== undefined ? patch.useAccentColor : existing.useAccentColor;
  return {
    id: existing.id,
    shape: patch.shape ?? existing.shape,
    position: patch.position ?? existing.position,
    size: patch.size !== undefined ? Math.max(0, patch.size) : existing.size,
    stroke:
      patch.useAccentColor !== undefined
        ? resolveStrokeColor(style, patch.useAccentColor)
        : existing.stroke,
    useAccentColor: nextUseAccent,
  };
};

/**
 * 完整性校验 — 流式中间态可能字段缺失, 半成品命令丢弃。
 */
const isCompleteCommand = (
  cmd: Partial<DrawCommand> & { commandType?: DrawCommand["commandType"] },
): cmd is DrawCommand => {
  if (!cmd.commandType) return false;
  switch (cmd.commandType) {
    case COMMAND_TYPE.CREATE_SHAPES: {
      const c = cmd as Partial<{
        activeStyleId: string;
        shapes: Array<Partial<ShapeBlueprint>>;
      }>;
      if (!c.activeStyleId || !Array.isArray(c.shapes) || c.shapes.length === 0) return false;
      return c.shapes.every(
        (s) =>
          (typeof s.id === "string" || s.id === undefined) &&
          (s.shape === "circle" || s.shape === "rectangle" || s.shape === "line") &&
          typeof s.size === "number" &&
          typeof s.useAccentColor === "boolean" &&
          s.position !== undefined &&
          typeof s.position.x === "number" &&
          typeof s.position.y === "number",
      );
    }
    case COMMAND_TYPE.MODIFY_SHAPE: {
      const c = cmd as Partial<{ targetId: string; patch: object }>;
      return typeof c.targetId === "string" && c.patch !== undefined;
    }
    case COMMAND_TYPE.MOVE_SHAPE: {
      const c = cmd as Partial<{
        targetId: string;
        to: { x: number; y: number };
        delta: { dx: number; dy: number };
      }>;
      if (typeof c.targetId !== "string") return false;
      const hasTo =
        c.to !== undefined && typeof c.to.x === "number" && typeof c.to.y === "number";
      const hasDelta =
        c.delta !== undefined &&
        typeof c.delta.dx === "number" &&
        typeof c.delta.dy === "number";
      return hasTo || hasDelta;
    }
    case COMMAND_TYPE.RESIZE_SHAPE: {
      const c = cmd as Partial<{ targetId: string; size: number; scale: number }>;
      if (typeof c.targetId !== "string") return false;
      return typeof c.size === "number" || typeof c.scale === "number";
    }
    case COMMAND_TYPE.DELETE_SHAPE:
      return typeof (cmd as Partial<{ targetId: string }>).targetId === "string";
    case COMMAND_TYPE.CLEAR_CANVAS:
      return true;
    case COMMAND_TYPE.STYLE_TRANSFORM:
      return typeof (cmd as Partial<{ activeStyleId: string }>).activeStyleId === "string";
    case COMMAND_TYPE.BATCH_TRANSFORM: {
      const c = cmd as Partial<{
        targetIds: string[];
        filterShape: string;
        patch: object;
      }>;
      if (c.patch === undefined) return false;
      return Array.isArray(c.targetIds) || typeof c.filterShape === "string";
    }
  }
};

const applyCommand = (
  map: ShapeMap,
  command: DrawCommand,
  activeStyleId: StyleId,
): { nextMap: ShapeMap; styleSwitch?: StyleId } => {
  const next = new Map(map);

  if (isCreateShapes(command)) {
    for (const blueprint of command.shapes) {
      const shape = blueprintToShape(blueprint, command.activeStyleId as StyleId, map);
      next.set(shape.id, shape);
    }
    return { nextMap: next };
  }

  if (isModifyShape(command)) {
    const existing = next.get(command.targetId);
    if (!existing) return { nextMap: map };
    next.set(existing.id, applyPatch(existing, command.patch, activeStyleId));
    return { nextMap: next };
  }

  if (isMoveShape(command)) {
    const existing = next.get(command.targetId);
    if (!existing) return { nextMap: map };
    const newPos = command.to
      ? command.to
      : command.delta
        ? {
            x: existing.position.x + command.delta.dx,
            y: existing.position.y + command.delta.dy,
          }
        : existing.position;
    next.set(existing.id, { ...existing, position: newPos });
    return { nextMap: next };
  }

  if (isResizeShape(command)) {
    const existing = next.get(command.targetId);
    if (!existing) return { nextMap: map };
    const newSize =
      command.size !== undefined
        ? Math.max(0, command.size)
        : command.scale !== undefined
          ? Math.max(0, existing.size * command.scale)
          : existing.size;
    next.set(existing.id, { ...existing, size: newSize });
    return { nextMap: next };
  }

  if (isDeleteShape(command)) {
    next.delete(command.targetId);
    return { nextMap: next };
  }

  if (isClearCanvas(command)) {
    next.clear();
    return { nextMap: next };
  }

  if (isBatchTransform(command)) {
    const ids = command.targetIds
      ? command.targetIds
      : command.filterShape
        ? Array.from(map.keys()).filter((id) => map.get(id)?.shape === command.filterShape)
        : [];
    for (const id of ids) {
      const existing = next.get(id);
      if (existing) next.set(id, applyPatch(existing, command.patch, activeStyleId));
    }
    return { nextMap: next };
  }

  if (isStyleTransform(command)) {
    return { nextMap: map, styleSwitch: command.activeStyleId as StyleId };
  }

  return { nextMap: map };
};

/**
 * 流式调度器 — 把 partial commands[] 应用到当前 shapeMap。
 *
 * 风格切换时会重新解析所有 shape 的 stroke 色 (按新风格的 palette + 各 shape 的 useAccentColor)。
 */
export const dispatchPartialEnvelope = (
  partial: PartialDrawTool | undefined,
  baseMap: ShapeMap,
  activeStyleId: StyleId,
): DispatchOutcome => {
  if (!partial?.commands) return { nextMap: baseMap, sideEffect: {} };

  let currentMap = baseMap;
  let nextActiveStyleId: StyleId | undefined;

  for (const partialCmd of partial.commands) {
    if (!isCompleteCommand(partialCmd)) continue;
    const styleForApply = nextActiveStyleId ?? activeStyleId;
    const result = applyCommand(currentMap, partialCmd, styleForApply);
    currentMap = result.nextMap;
    if (result.styleSwitch) {
      nextActiveStyleId = result.styleSwitch;
      // 风格切换 — 重新解析所有 shape 的 stroke
      currentMap = restyleAll(currentMap, nextActiveStyleId);
    }
  }

  return {
    nextMap: currentMap,
    sideEffect: nextActiveStyleId ? { nextActiveStyleId } : {},
  };
};

/**
 * 风格切换时重算所有 shape 的 stroke 色。
 * Why: 风格的 accent / stroke 调色板变了, 但 shape 的 useAccentColor 标志不变,
 * 所以重新走 resolveStrokeColor 即可。
 */
export const restyleAll = (map: ShapeMap, newStyleId: StyleId): ShapeMap => {
  const style = getStyleById(newStyleId);
  const next = new Map<string, CanvasShape>();
  for (const [id, shape] of map) {
    next.set(id, {
      ...shape,
      stroke: resolveStrokeColor(style, shape.useAccentColor),
    });
  }
  return next;
};

/**
 * 兜底 — 当流式中断或解析失败时, 强制下发一个默认圆。
 */
export const buildFallbackMap = (activeStyleId: StyleId): ShapeMap => {
  const style = getStyleById(activeStyleId);
  const fallback: CanvasShape = {
    id: "fallback-circle",
    shape: "circle",
    position: { x: 480, y: 320 },
    size: 60,
    stroke: resolveStrokeColor(style, false),
    useAccentColor: false,
  };
  return new Map([[fallback.id, fallback]]);
};
