/**
 * 统一工具 schema — canvas.* + platform.* + drawio.* 全部命令的 union。
 *
 * Why: LLM 一次响应可能同时调多类工具 (例如:
 *   drawio.display_diagram (画矢量框) + canvas.generate_image (生图标) + platform.set_theme),
 * 所以 LLM 看到的 schema 应该是统一的, 不分 namespace。
 *
 * 这层只做 schema 拼接, 实际 dispatch 看 tool 命名空间走对应 dispatcher。
 */

import { z } from "zod";

import { canvasCommandSchema } from "./canvas-tools";
import { diagramCommandSchema } from "./diagram-tools";
import { drawioCommandSchema } from "./drawio-tools";

/**
 * 统一命令 union — 注意:
 * z.discriminatedUnion 不能直接合并两个已 build 的 union, 用 z.union 合并 (会损失自动判别优化, 但功能一致)。
 */
export const unifiedCommandSchema = z.union([
  canvasCommandSchema,
  drawioCommandSchema,
  diagramCommandSchema,
]);

export const unifiedEnvelopeSchema = z.object({
  commands: z.array(unifiedCommandSchema).min(1).max(8),
  narration: z.string().max(200).optional(),
});

export type UnifiedCommand = z.infer<typeof unifiedCommandSchema>;
export type UnifiedEnvelope = z.infer<typeof unifiedEnvelopeSchema>;

/** 流式中间态 — partial JSON 在每一帧都不完整 */
export type PartialUnifiedEnvelope = {
  commands?: Array<Partial<UnifiedCommand> & { tool?: string }>;
  narration?: string;
};
