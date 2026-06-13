import OpenAI from "openai";

import type {
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageProvider,
  ImageProviderId,
} from "./types";

/**
 * OpenAI 兼容生图 Provider。
 * Why: 大多数生图服务 (yunwu / siliconflow / openai 官方) 都提供 OpenAI 兼容
 * /v1/images/generations 端点, 一份代码可以接所有。
 *
 * 配置 (.env.local):
 *   IMAGE2_API_KEY  — API Key
 *   IMAGE2_URL      — baseURL, 自动追加 /v1
 *   IMAGE2_MODEL    — 默认模型 (可被 recipe.modelId 覆盖)
 */
export interface OpenAICompatibleImageConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

const PROVIDER_ID: ImageProviderId = "openai-dalle";

const DEFAULT_SIZE = "1024x1024";

const ensureV1 = (baseURL: string): string =>
  baseURL.endsWith("/v1") ? baseURL : `${baseURL.replace(/\/$/, "")}/v1`;

const sizeToString = (width?: number, height?: number): string =>
  width && height ? `${width}x${height}` : DEFAULT_SIZE;

export const createOpenAICompatibleImageProvider = (
  config: OpenAICompatibleImageConfig,
): ImageProvider => {
  const { apiKey, baseURL, defaultModel = "gpt-image-1" } = config;

  return {
    id: PROVIDER_ID,
    async generate(request: ImageGenerateRequest): Promise<ImageGenerateResult> {
      if (!apiKey) {
        throw new Error("IMAGE2_API_KEY 未配置");
      }
      if (!baseURL) {
        throw new Error("IMAGE2_URL 未配置");
      }
      const client = new OpenAI({ apiKey, baseURL: ensureV1(baseURL) });
      const model = request.recipe?.modelId ?? defaultModel;
      const size = sizeToString(request.width, request.height);

      // OpenAI SDK 类型对 size 字段较严格, 用 as never 绕过 (yunwu/siliconflow 接受任意尺寸字符串)
      const response = await client.images.generate({
        model,
        prompt: request.prompt,
        size: size as never,
        n: 1,
      });

      const item = response.data?.[0];
      if (!item) {
        throw new Error("生图 API 返回空 data 数组");
      }
      const url = item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!url) {
        throw new Error("生图 API 未返回 url 或 b64_json");
      }

      return {
        url,
        width: request.width ?? 1024,
        height: request.height ?? 1024,
        providerId: PROVIDER_ID,
      };
    },
  };
};

export const buildOpenAICompatibleImageFromEnv = (
  env: Record<string, string | undefined> = process.env,
): ImageProvider =>
  createOpenAICompatibleImageProvider({
    apiKey: env.IMAGE2_API_KEY,
    baseURL: env.IMAGE2_URL,
    defaultModel: env.IMAGE2_MODEL,
  });
