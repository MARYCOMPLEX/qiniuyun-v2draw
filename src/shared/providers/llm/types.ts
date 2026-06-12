import type { drawToolSchema } from "@/shared/types/schema";
import type { z } from "zod";

export const LLM_PROVIDER_IDS = [
  "openai-compatible",
  "anthropic",
  "google",
  "mistral",
  "null",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/**
 * 工具路由维度 — 同 toolType, 同模型偏好。
 * Why: ATOMIC_SHAPE 用小快模型, DIFFUSION_MELT 提示词润色用大模型,
 * WEB_SEARCH 用带工具调用能力的模型。registry 据此做二级路由。
 */
export type LlmToolRoute = "atomic-shape" | "diffusion-melt" | "web-search" | "default";

export interface LlmStreamRequest {
  systemPrompt: string;
  userUtterance: string;
  schema: typeof drawToolSchema;
  /** 运行时模型 ID — Provider 与 Model 解耦, 同一 Provider 可调多种模型 */
  model: string;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface LlmStreamResponse {
  toTextStreamResponse: () => Response;
}

/**
 * LLM Provider 抽象 — 仅封装"端点 + key + SDK 协议 + 消息格式适配"。
 * Why: 与 Model 完全正交。同一 Provider (如 yunwu/openai-compatible)
 * 可承载 gpt-4o / gemini / claude 多种模型, 靠 baseURL + model 切换。
 */
export interface LlmProvider {
  readonly id: LlmProviderId;
  streamDrawTool(request: LlmStreamRequest): LlmStreamResponse;
}

export type DrawTool = z.infer<typeof drawToolSchema>;
