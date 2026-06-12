import { createAnthropic } from "@ai-sdk/anthropic";

import { buildNotReadyResponse } from "./_notReady";
import { streamDrawToolViaModel } from "./_streamDrawTool";
import type { LlmProvider, LlmStreamRequest, LlmStreamResponse } from "./types";

type EnvLike = Record<string, string | undefined>;

interface AnthropicConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Anthropic Provider — 直连官方端点或第三方代理。
 * Why: Claude 系模型对长上下文与工具调用支持优秀,
 * 适合 DIFFUSION_MELT 提示词润色与 WEB_SEARCH 路由场景。
 */
export const createAnthropicProvider = (config: AnthropicConfig): LlmProvider => {
  const { apiKey, baseURL } = config;
  return {
    id: "anthropic",
    streamDrawTool(request: LlmStreamRequest): LlmStreamResponse {
      if (!apiKey) {
        return buildNotReadyResponse("ANTHROPIC_API_KEY 未配置");
      }
      const anthropic = createAnthropic({ apiKey, baseURL });
      return streamDrawToolViaModel(anthropic(request.model), request);
    },
  };
};

export const buildAnthropicFromEnv = (env: EnvLike): LlmProvider =>
  createAnthropicProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL,
  });
