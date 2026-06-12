import {
  isAtomicShape,
  isDiffusionMelt,
  isWebSearch,
  type DrawTool,
  type PartialDrawTool,
} from "@/shared/types/schema";
import {
  getStyleById,
  resolveStrokeColor,
  type StyleId,
} from "@/shared/constants/marketStyles";

/**
 * 画布层最终消费的统一形状描述。
 * Why: 把"工具语义 + 风格色彩"拍平成画布只需要消费的渲染指令，
 * 让 VectorStage 不必再 import schema 与 marketStyles 两个上游模块。
 */
export interface CanvasInstruction {
  readonly id: string;
  readonly action: "create" | "modify" | "delete";
  readonly shape: "circle" | "rectangle" | "line";
  readonly position: { readonly x: number; readonly y: number };
  readonly size: number;
  readonly stroke: string;
}

const DEFAULT_INSTRUCTION_ID = "default-fallback";

const isCompleteAtomic = (
  tool: PartialDrawTool,
): tool is DrawTool & { toolType: "ATOMIC_SHAPE" } => {
  if (tool.toolType !== "ATOMIC_SHAPE") return false;
  if (!tool.action || !tool.shape || !tool.activeStyleId) return false;
  if (typeof tool.useAccentColor !== "boolean") return false;
  if (typeof tool.size !== "number" || Number.isNaN(tool.size)) return false;
  if (!tool.position) return false;
  if (typeof tool.position.x !== "number" || typeof tool.position.y !== "number") return false;
  return true;
};

/**
 * 流式增量调度器。
 * Why: streamObject 每一帧都是 partial，调度器必须能在"半成品"上做出
 * 安全决策——不渲染未到齐的字段，但保留 ID 让前端 LERP 平滑收敛。
 */
export const dispatchPartialTool = (
  partial: PartialDrawTool | undefined,
  instructionId: string,
): CanvasInstruction | null => {
  if (!partial) return null;
  if (!isCompleteAtomic(partial)) return null;

  const style = getStyleById(partial.activeStyleId as StyleId);
  return {
    id: instructionId,
    action: partial.action,
    shape: partial.shape,
    position: partial.position,
    size: Math.max(0, partial.size),
    stroke: resolveStrokeColor(style, partial.useAccentColor),
  };
};

/**
 * 终态分发器（用于 onFinish 等已完整校验的对象）。
 * Why: 强类型分支处理 ATOMIC_SHAPE / DIFFUSION_MELT / WEB_SEARCH 三种
 * 工具，画布层只关心 ATOMIC_SHAPE，其他两个走副作用通道。
 */
export const dispatchCompletedTool = (
  tool: DrawTool,
  instructionId: string,
): CanvasInstruction | null => {
  if (isAtomicShape(tool)) {
    const style = getStyleById(tool.activeStyleId as StyleId);
    return {
      id: instructionId,
      action: tool.action,
      shape: tool.shape,
      position: tool.position,
      size: Math.max(0, tool.size),
      stroke: resolveStrokeColor(style, tool.useAccentColor),
    };
  }
  if (isDiffusionMelt(tool)) return null;
  if (isWebSearch(tool)) return null;
  return null;
};

/**
 * 兜底工具：当流式中断或解析失败时，强制下发 schema §四 中描述的
 * "create / circle / size=10" 默认对象，保证 UI 永远不卡死。
 */
export const buildFallbackInstruction = (activeStyleId: StyleId): CanvasInstruction => {
  const style = getStyleById(activeStyleId);
  return {
    id: DEFAULT_INSTRUCTION_ID,
    action: "create",
    shape: "circle",
    position: { x: 480, y: 320 },
    size: 10,
    stroke: resolveStrokeColor(style, false),
  };
};
