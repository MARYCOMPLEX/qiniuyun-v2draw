import { createGoogleGenerativeAI } from "@ai-sdk/google";

import { buildNotReadyResponse } from "./_notReady";
import { streamDrawToolViaModel } from "./_streamDrawTool";
import type { LlmProvider, LlmStreamRequest, LlmStreamResponse } from "./types";

type EnvLike = Record<string, string | undefined>;

interface GoogleConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Google Generative AI Provider (Gemini)。
 * Why: Gemini 2.x 在结构化输出与多模态上有突出表现,
 * 适合 ATOMIC_SHAPE 高频路由的小快模型场景 (gemini-2.0-flash)。
 */
export const createGoogleProvider = (config: GoogleConfig): LlmProvider => {
  const { apiKey, baseURL } = config;
  return {
    id: "google",
    streamDrawTool(request: LlmStreamRequest): LlmStreamResponse {
      if (!apiKey) {
        return buildNotReadyResponse("GOOGLE_GENERATIVE_AI_API_KEY 未配置");
      }
      const google = createGoogleGenerativeAI({ apiKey, baseURL });
      return streamDrawToolViaModel(google(request.model), request);
    },
  };
};

export const buildGoogleFromEnv = (env: EnvLike): LlmProvider =>
  createGoogleProvider({
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseURL: env.GOOGLE_BASE_URL,
  });
