import { LLM_PROVIDER_IDS, type LlmProviderId, type LlmToolRoute } from "./types";

type EnvLike = Record<string, string | undefined>;

export interface LlmRouteResolution {
  providerId: LlmProviderId;
  model: string;
}

const DEFAULT_FALLBACK_PROVIDER: LlmProviderId = "openai-compatible";
const DEFAULT_FALLBACK_MODEL = "gpt-4o-mini";

const isProviderId = (candidate: string | undefined): candidate is LlmProviderId =>
  candidate !== undefined && (LLM_PROVIDER_IDS as readonly string[]).includes(candidate);

const readPair = (
  env: EnvLike,
  providerKey: string,
  modelKey: string,
): Partial<LlmRouteResolution> => {
  const providerId = env[providerKey];
  const model = env[modelKey];
  return {
    providerId: isProviderId(providerId) ? providerId : undefined,
    model: model && model.trim() !== "" ? model : undefined,
  };
};

/**
 * 把 LLM 路由维度映射到 (provider, model) 二元组。
 * Why: atomic-shape / diffusion-melt / web-search 三类路由的算力诉求差异大,
 * 通过分维度配置实现"小快模型 vs 大慢模型"的成本与质量平衡。
 *
 * 解析顺序: 路由专属 env → LLM_DEFAULT_* → 内置兜底 (gpt-4o-mini)。
 * 任一层缺漏即继承下一层, 便于增量配置。
 */
export const resolveLlmRoute = (
  route: LlmToolRoute,
  env: EnvLike = process.env,
): LlmRouteResolution => {
  const def = readPair(env, "LLM_DEFAULT_PROVIDER", "LLM_DEFAULT_MODEL");
  const specificKeys: Record<LlmToolRoute, [string, string] | null> = {
    "atomic-shape": ["LLM_ATOMIC_SHAPE_PROVIDER", "LLM_ATOMIC_SHAPE_MODEL"],
    "diffusion-melt": ["LLM_DIFFUSION_MELT_PROVIDER", "LLM_DIFFUSION_MELT_MODEL"],
    "web-search": ["LLM_WEB_SEARCH_PROVIDER", "LLM_WEB_SEARCH_MODEL"],
    default: null,
  };

  const keys = specificKeys[route];
  const specific = keys ? readPair(env, keys[0], keys[1]) : {};

  return {
    providerId: specific.providerId ?? def.providerId ?? DEFAULT_FALLBACK_PROVIDER,
    model: specific.model ?? def.model ?? DEFAULT_FALLBACK_MODEL,
  };
};
