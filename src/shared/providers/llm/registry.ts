import { buildAnthropicFromEnv } from "./anthropic";
import { buildGoogleFromEnv } from "./google";
import { buildMistralFromEnv } from "./mistral";
import { nullLlmProvider } from "./null";
import { buildOpenAiCompatibleFromEnv } from "./openai-compatible";
import { resolveLlmRoute, toolTypeToRoute } from "./route";
import { LLM_PROVIDER_IDS, type LlmProvider, type LlmProviderId, type LlmToolRoute } from "./types";

type EnvLike = Record<string, string | undefined>;

const providerBuilders: Record<Exclude<LlmProviderId, "null">, (env: EnvLike) => LlmProvider> = {
  "openai-compatible": buildOpenAiCompatibleFromEnv,
  anthropic: buildAnthropicFromEnv,
  google: buildGoogleFromEnv,
  mistral: buildMistralFromEnv,
};

/**
 * 按 ID 取 Provider 实例 (低阶 API)。
 * Why: 测试与高阶路由都需要"传入 ID 拿 Provider"的能力, 单独抽出。
 */
export const getLlmProviderById = (
  id: string | undefined,
  env: EnvLike = process.env,
): LlmProvider => {
  if (!id || !(LLM_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullLlmProvider;
  }
  if (id === "null") {
    return nullLlmProvider;
  }
  const builder = providerBuilders[id as Exclude<LlmProviderId, "null">];
  return builder(env);
};

/**
 * 按 toolType 路由解析 Provider + Model (高阶 API)。
 * Why: route.ts 只关心"给我对应这个工具的 Provider 与 model 名",
 * 内部隐藏 toolType → 路由维度 → env 解析的多步逻辑。
 */
export interface ResolvedLlmCall {
  provider: LlmProvider;
  model: string;
  providerId: LlmProviderId;
}

export const getLlmProviderForRoute = (
  route: LlmToolRoute,
  env: EnvLike = process.env,
): ResolvedLlmCall => {
  const resolution = resolveLlmRoute(route, env);
  const provider = getLlmProviderById(resolution.providerId, env);
  return {
    provider,
    model: resolution.model,
    providerId: resolution.providerId,
  };
};

export const getLlmProviderForToolType = (
  toolType: string | undefined,
  env: EnvLike = process.env,
): ResolvedLlmCall => getLlmProviderForRoute(toolTypeToRoute(toolType), env);

/**
 * 默认入口 — 不指定 toolType 时使用 LLM_DEFAULT_*。
 * Why: 保留与 PR1 同名 API, 让现有调用点零改动迁移到 PR2。
 */
export const getLlmProvider = (env: EnvLike = process.env): LlmProvider =>
  getLlmProviderForRoute("default", env).provider;
