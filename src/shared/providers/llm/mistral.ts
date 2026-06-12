import { createMistral } from "@ai-sdk/mistral";

import { buildNotReadyResponse } from "./_notReady";
import { streamDrawToolViaModel } from "./_streamDrawTool";
import type { LlmProvider, LlmStreamRequest, LlmStreamResponse } from "./types";

type EnvLike = Record<string, string | undefined>;

interface MistralConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Mistral AI Provider。
 * Why: 欧洲合规友好的备用源, mistral-small/large 在 JSON Mode 下稳定,
 * 作为 fallback chain 候选 (PR6) 与多元化部署的对冲选项。
 */
export const createMistralProvider = (config: MistralConfig): LlmProvider => {
  const { apiKey, baseURL } = config;
  return {
    id: "mistral",
    streamDrawTool(request: LlmStreamRequest): LlmStreamResponse {
      if (!apiKey) {
        return buildNotReadyResponse("MISTRAL_API_KEY 未配置");
      }
      const mistral = createMistral({ apiKey, baseURL });
      return streamDrawToolViaModel(mistral(request.model), request);
    },
  };
};

export const buildMistralFromEnv = (env: EnvLike): LlmProvider =>
  createMistralProvider({
    apiKey: env.MISTRAL_API_KEY,
    baseURL: env.MISTRAL_BASE_URL,
  });
