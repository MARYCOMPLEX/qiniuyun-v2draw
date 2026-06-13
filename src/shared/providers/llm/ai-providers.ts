/**
 * ai-providers.ts — 精简自 next-ai-drawio/lib/ai-providers.ts
 * 保留 4 个 provider: openai / anthropic / google / deepseek
 * 用 Vercel AI SDK 的 streamText + tools 模式,兼容所有 thinking mode 模型。
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";

export type ProviderName = "openai" | "anthropic" | "google" | "deepseek";

interface ModelConfig {
  model: ReturnType<typeof openai>;
  modelId: string;
  provider: ProviderName;
}

function detectProvider(): ProviderName | null {
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  return null;
}

/**
 * 核心入口 — 按环境变量 / 显式 override 实例化 AI model。
 *
 * 设计照搬 next-ai-drawio:
 * - 先看 LLM_DEFAULT_PROVIDER 显式指定
 * - 再看环境变量自动检测 (detectProvider)
 * - baseURL 优先级: overrides > process.env.*_BASE_URL > 默认
 * - 如果 provider=openai 且有 baseURL → 走 .chat() 而非 () (第三方代理兼容)
 */
export function getAIModel(overrides?: {
  provider?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
}): ModelConfig {
  const modelId =
    overrides?.modelId ||
    process.env.LLM_DEFAULT_MODEL ||
    "deepseek-chat";

  let provider: ProviderName;
  if (overrides?.provider) {
    provider = overrides.provider as ProviderName;
  } else if (process.env.LLM_DEFAULT_PROVIDER) {
    // voice-canvas 用 LLM_DEFAULT_PROVIDER 映射到实际 provider
    const p = process.env.LLM_DEFAULT_PROVIDER;
    if (p === "openai-compatible") {
      // 有 baseURL 的 openai-compatible 仍然映射到 openai provider
      provider = "openai";
    } else {
      provider = p as ProviderName;
    }
  } else {
    const detected = detectProvider();
    if (!detected) {
      throw new Error(
        "No AI provider configured. Set OPENAI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.",
      );
    }
    provider = detected;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let model: any;

  switch (provider) {
    case "openai": {
      const apiKey = overrides?.apiKey || process.env.OPENAI_API_KEY;
      const baseURL = overrides?.baseUrl || process.env.OPENAI_BASE_URL;
      if (baseURL) {
        // 第三方代理 (DashScope / yunwu / etc) — 用 .chat() 走 Chat Completions
        const customOpenAI = createOpenAI({ apiKey, baseURL });
        model = customOpenAI.chat(modelId);
      } else if (apiKey) {
        const customOpenAI = createOpenAI({ apiKey });
        model = customOpenAI(modelId);
      } else {
        model = openai(modelId);
      }
      break;
    }

    case "anthropic": {
      const apiKey = overrides?.apiKey || process.env.ANTHROPIC_API_KEY;
      const baseURL = overrides?.baseUrl || process.env.ANTHROPIC_BASE_URL;
      const anthropicProvider = createAnthropic({ apiKey, baseURL });
      model = anthropicProvider(modelId);
      break;
    }

    case "google": {
      const apiKey =
        overrides?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const baseURL = overrides?.baseUrl || process.env.GOOGLE_BASE_URL;
      if (apiKey) {
        const googleProvider = createGoogleGenerativeAI({ apiKey, baseURL });
        model = googleProvider(modelId);
      } else {
        model = google(modelId);
      }
      break;
    }

    case "deepseek": {
      const apiKey = overrides?.apiKey || process.env.DEEPSEEK_API_KEY;
      const baseURL = overrides?.baseUrl || process.env.DEEPSEEK_BASE_URL;
      if (apiKey) {
        const ds = createDeepSeek({ apiKey, baseURL });
        model = ds(modelId);
      } else {
        model = deepseek(modelId);
      }
      break;
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  console.warn(`[AI Provider] ${provider} / ${modelId}`);
  return { model, modelId, provider };
}

/**
 * 是否支持 prompt caching (Anthropic / Bedrock Claude)
 */
export function supportsPromptCaching(modelId: string): boolean {
  return modelId.includes("claude");
}

/**
 * 需要单 system message 的 provider (DashScope qwen / 智谱 glm)
 * 这里如果用了 OpenAI 兼容 + DashScope baseURL,就返回 true
 */
export function isSingleSystemProvider(): boolean {
  const baseURL = process.env.OPENAI_BASE_URL ?? "";
  return (
    baseURL.includes("dashscope") ||
    baseURL.includes("bigmodel.cn") ||
    baseURL.includes("moonshot")
  );
}
