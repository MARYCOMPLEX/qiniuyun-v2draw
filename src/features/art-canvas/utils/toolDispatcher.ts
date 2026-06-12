import {
  COMMAND_TYPE,
  isClearCanvas,
  isCreateShapes,
  isDeleteShape,
  isModifyShape,
  isStyleTransform,
  type DrawCommand,
  type PartialDrawTool,
  type ShapeBlueprint,
} from "@/shared/types/schema";
import {
  getStyleById,
  resolveStrokeColor,
  type StyleId,
} from "@/shared/constants/marketStyles";

/**
 * 画布上的单个图元 — 调度器把"工具语义 + 风格色彩"拍平成画布指令。
 * Why: 让 VectorStage 不必再 import schema 与 marketStyles 两个上游模块,
 * 同时可被 LERP 渲染层独立缓动。
 */
export interface CanvasShape {
  readonly id: string;
  readonly shape: "circle" | "rectangle" | "line";
  readonly position: { readonly x: number; readonly y: number };
  readonly size: number;
  readonly stroke: string;
}

export type ShapeMap = ReadonlyMap<string, CanvasShape>;

export interface DispatchSideEffect {
  readonly nextActiveStyleId?: StyleId;
}

export interface DispatchOutcome {
  readonly nextMap: ShapeMap;
  readonly sideEffect: DispatchSideEffect;
}

const blueprintToShape = (
  blueprint: ShapeBlueprint,
  activeStyleId: StyleId,
): CanvasShape => {
  const style = getStyleById(activeStyleId);
  return {
    id: blueprint.id,
    shape: blueprint.shape,
    position: blueprint.position,
    size: Math.max(0, blueprint.size),
    stroke: resolveStrokeColor(style, blueprint.useAccentColor),
  };
};

/**
 * 命令完整性检查 — 流式中间态可能字段缺失, 半成品 command 直接丢弃。
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
          typeof s.id === "string" &&
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
    case COMMAND_TYPE.DELETE_SHAPE: {
      const c = cmd as Partial<{ targetId: string }>;
      return typeof c.targetId === "string";
    }
    case COMMAND_TYPE.CLEAR_CANVAS:
      return true;
    case COMMAND_TYPE.STYLE_TRANSFORM: {
      const c = cmd as Partial<{ activeStyleId: string }>;
      return typeof c.activeStyleId === "string";
    }
  }
};

/**
 * 应用单条命令到 shapeMap, 返回新 map (immutable)。
 */
const applyCommand = (
  map: ShapeMap,
  command: DrawCommand,
  activeStyleId: StyleId,
): { nextMap: ShapeMap; styleSwitch?: StyleId } => {
  const next = new Map(map);

  if (isCreateShapes(command)) {
    for (const blueprint of command.shapes) {
      next.set(blueprint.id, blueprintToShape(blueprint, command.activeStyleId as StyleId));
    }
    return { nextMap: next };
  }

  if (isModifyShape(command)) {
    const existing = next.get(command.targetId);
    if (!existing) return { nextMap: map };
    const style = getStyleById(activeStyleId);
    const merged: CanvasShape = {
      id: existing.id,
      shape: command.patch.shape ?? existing.shape,
      position: command.patch.position ?? existing.position,
      size:
        command.patch.size !== undefined ? Math.max(0, command.patch.size) : existing.size,
      stroke:
        command.patch.useAccentColor !== undefined
          ? resolveStrokeColor(style, command.patch.useAccentColor)
          : existing.stroke,
    };
    next.set(existing.id, merged);
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

  if (isStyleTransform(command)) {
    return { nextMap: map, styleSwitch: command.activeStyleId as StyleId };
  }

  return { nextMap: map };
};

/**
 * 流式调度器 — 把 partial commands[] 应用到当前 shapeMap。
 * Why: streamObject 每帧都是 partial, 调度器必须能在"半成品"上做出
 * 安全决策——只应用已完整的命令, 等下一帧补全再试。指纹由前端做去重。
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
    const result = applyCommand(currentMap, partialCmd, nextActiveStyleId ?? activeStyleId);
    currentMap = result.nextMap;
    if (result.styleSwitch) nextActiveStyleId = result.styleSwitch;
  }

  return {
    nextMap: currentMap,
    sideEffect: nextActiveStyleId ? { nextActiveStyleId } : {},
  };
};

/**
 * 兜底 — 当流式中断或解析失败时, 强制下发一个默认圆, 保证 UI 永远不卡死。
 */
export const buildFallbackMap = (activeStyleId: StyleId): ShapeMap => {
  const style = getStyleById(activeStyleId);
  const fallback: CanvasShape = {
    id: "fallback-circle",
    shape: "circle",
    position: { x: 480, y: 320 },
    size: 60,
    stroke: resolveStrokeColor(style, false),
  };
  return new Map([[fallback.id, fallback]]);
};
