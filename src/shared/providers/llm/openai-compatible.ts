import { createOpenAI } from "@ai-sdk/openai";

import { buildNotReadyResponse } from "./_notReady";
import { streamDrawToolViaModel } from "./_streamDrawTool";
import type { LlmProvider, LlmStreamRequest, LlmStreamResponse } from "./types";

type EnvLike = Record<string, string | undefined>;

interface OpenAiCompatibleConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * OpenAI-compatible Provider — 同时承载 OpenAI / yunwu / 月之暗面 / 智谱 / 自建网关。
 * Why: 这些端点共享 OpenAI Chat Completions 协议, 仅 baseURL + key 不同,
 * Model 通过运行时参数注入, 实现 Provider 与 Model 完全解耦。
 */
export const createOpenAiCompatibleProvider = (config: OpenAiCompatibleConfig): LlmProvider => {
  const { apiKey, baseURL } = config;

  return {
    id: "openai-compatible",
    streamDrawTool(request: LlmStreamRequest): LlmStreamResponse {
      if (!apiKey) {
        return buildNotReadyResponse("OPENAI_API_KEY 未配置");
      }
      const openai = createOpenAI({ apiKey, baseURL });
      return streamDrawToolViaModel(openai(request.model), request);
    },
  };
};

export const buildOpenAiCompatibleFromEnv = (env: EnvLike): LlmProvider =>
  createOpenAiCompatibleProvider({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });
