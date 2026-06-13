/**
 * Canvas 异步命令 dispatcher — 处理 generate/edit/inpaint 等。
 *
 * 流程:
 * 1. 立即创建 placeholder ImageLayer (status=pending)
 * 2. 调 POST /api/canvas/generate, 拿到 jobId
 * 3. 把 jobId 写回 layer (jobId 字段)
 * 4. 实际生图在后端异步执行, 进度通过 SSE 推送
 * 5. SSE 收到 job-done 时上层把 layer.imageUrl 替换为真实图
 *
 * 见 docs/protocols/multimodal-canvas.md §3.1, §5。
 */

import type { CanvasCommand } from "@/shared/types/canvas-tools";
import {
  allocateLayerId,
  DEFAULT_LAYER_SIZE,
  DEFAULT_STAGE_RECT,
  type ImageLayer,
  type LayerMap,
} from "@/shared/types/layer";
import { CANVAS_TOOL } from "@/shared/types/tools";

export interface AsyncDispatchResult {
  readonly nextLayers: LayerMap;
  /** 新创建的 placeholder layer (供 orchestrator 关联 jobId) */
  readonly placeholderLayer?: ImageLayer;
  /** 后端调用的 fetch payload */
  readonly fetchPayload?: {
    layerId: string;
    tool: string;
    prompt: string;
    width?: number;
    height?: number;
    modelId?: string;
  };
}

const stageCenter = {
  x: DEFAULT_STAGE_RECT.x + DEFAULT_STAGE_RECT.w / 2,
  y: DEFAULT_STAGE_RECT.y + DEFAULT_STAGE_RECT.h / 2,
};

const buildPlaceholder = (params: {
  prompt: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  parentLayerId?: string;
  zIndex?: number;
  modelId?: string;
}): ImageLayer => {
  const id = allocateLayerId();
  return {
    id,
    jobId: null,
    status: "pending",
    imageUrl: null,
    thumbnailUrl: null,
    prompt: params.prompt,
    modelId: params.modelId ?? "",
    parentLayerId: params.parentLayerId,
    generation: 0,
    position: params.position ?? stageCenter,
    size: params.size ?? DEFAULT_LAYER_SIZE,
    rotation: 0,
    opacity: 1,
    zIndex: params.zIndex ?? 1,
    mask: null,
    createdAt: Date.now(),
    completedAt: null,
  };
};

/**
 * 处理异步命令 — 创建 placeholder + 准备 fetch payload。
 * 上层 orchestrator 收到 result 后:
 *   1. setState(nextLayers)  // placeholder 已加入 LayerMap
 *   2. fetch(/api/canvas/generate, fetchPayload)
 *   3. 拿到 jobId 后再次 setState 把 jobId 写回 layer (orchestrator 内部完成)
 */
export function dispatchAsyncCommand(
  command: CanvasCommand,
  layers: LayerMap,
): AsyncDispatchResult {
  const next = new Map(layers);

  switch (command.tool) {
    case CANVAS_TOOL.GENERATE_IMAGE: {
      const placeholder = buildPlaceholder({
        prompt: command.prompt,
        position: command.position,
        size: command.size,
        modelId: command.modelId,
      });
      next.set(placeholder.id, placeholder);
      return {
        nextLayers: next,
        placeholderLayer: placeholder,
        fetchPayload: {
          layerId: placeholder.id,
          tool: command.tool,
          prompt: command.prompt,
          width: command.size?.width,
          height: command.size?.height,
          modelId: command.modelId,
        },
      };
    }

    case CANVAS_TOOL.GENERATE_BACKGROUND: {
      const placeholder = buildPlaceholder({
        prompt: command.prompt + (command.mood ? `, mood: ${command.mood}` : ""),
        position: stageCenter,
        size: { width: DEFAULT_STAGE_RECT.w, height: DEFAULT_STAGE_RECT.h },
        zIndex: 0, // 背景永远在最底层
      });
      next.set(placeholder.id, placeholder);
      return {
        nextLayers: next,
        placeholderLayer: placeholder,
        fetchPayload: {
          layerId: placeholder.id,
          tool: command.tool,
          prompt: placeholder.prompt,
          width: DEFAULT_STAGE_RECT.w,
          height: DEFAULT_STAGE_RECT.h,
        },
      };
    }

    case CANVAS_TOOL.GENERATE_CHARACTER: {
      const promptWithBg = command.transparentBg
        ? `${command.prompt}, transparent background, isolated subject`
        : command.prompt;
      const placeholder = buildPlaceholder({
        prompt: promptWithBg,
        position: command.position,
        zIndex: 5,
      });
      next.set(placeholder.id, placeholder);
      return {
        nextLayers: next,
        placeholderLayer: placeholder,
        fetchPayload: {
          layerId: placeholder.id,
          tool: command.tool,
          prompt: promptWithBg,
        },
      };
    }

    case CANVAS_TOOL.GENERATE_VARIATIONS: {
      // 多个 placeholder 平铺 — 取第一个返回, 上层应该多次调用
      const placeholder = buildPlaceholder({ prompt: command.prompt });
      next.set(placeholder.id, placeholder);
      return {
        nextLayers: next,
        placeholderLayer: placeholder,
        fetchPayload: {
          layerId: placeholder.id,
          tool: command.tool,
          prompt: command.prompt,
        },
      };
    }

    case CANVAS_TOOL.EDIT_IMAGE:
    case CANVAS_TOOL.INPAINT_LAYER:
    case CANVAS_TOOL.OUTPAINT_LAYER:
    case CANVAS_TOOL.STYLE_TRANSFER:
    case CANVAS_TOOL.REMOVE_BACKGROUND:
    case CANVAS_TOOL.UPSCALE_LAYER:
    case CANVAS_TOOL.REGENERATE_LAYER: {
      const target = layers.get(command.targetLayerId);
      if (!target) return { nextLayers: layers };
      const editPrompt: string =
        ("prompt" in command && typeof command.prompt === "string"
          ? command.prompt
          : "replacePrompt" in command && typeof command.replacePrompt === "string"
            ? command.replacePrompt
            : "stylePrompt" in command && typeof command.stylePrompt === "string"
              ? command.stylePrompt
              : null) ?? `${command.tool} on ${target.id}`;
      // 把目标 layer 标记为 generating (但保留旧 imageUrl 让用户看着旧图直到新图回来)
      const updated: ImageLayer = {
        ...target,
        status: "generating",
        prompt: editPrompt,
        generation: target.generation + 1,
        completedAt: null,
      };
      next.set(target.id, updated);
      return {
        nextLayers: next,
        placeholderLayer: updated,
        fetchPayload: {
          layerId: target.id,
          tool: command.tool,
          prompt: editPrompt,
        },
      };
    }

    case CANVAS_TOOL.GENERATE_REFERENCE_COMPOSE: {
      const placeholder = buildPlaceholder({ prompt: command.prompt });
      next.set(placeholder.id, placeholder);
      return {
        nextLayers: next,
        placeholderLayer: placeholder,
        fetchPayload: {
          layerId: placeholder.id,
          tool: command.tool,
          prompt: command.prompt,
        },
      };
    }

    default:
      return { nextLayers: layers };
  }
}
