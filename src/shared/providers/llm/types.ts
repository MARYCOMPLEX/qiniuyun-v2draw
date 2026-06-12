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

export interface LlmStreamRequest {
  systemPrompt: string;
  userUtterance: string;
  schema: typeof drawToolSchema;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface LlmStreamResponse {
  toTextStreamResponse: () => Response;
}

/**
 * LLM Provider 抽象。
 * Why: 隔离 Vercel AI SDK 的 streamObject 直接调用，
 * 让 generate-draw 路由不再耦合具体 SDK，便于切 Anthropic/Google/自建网关。
 */
export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly modelId: string;
  streamDrawTool(request: LlmStreamRequest): LlmStreamResponse;
}

export type DrawTool = z.infer<typeof drawToolSchema>;
