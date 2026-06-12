import { TOOL_TYPE } from "@/shared/types/schema";

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
 * 把 toolType 映射到 (provider, model) 二元组。
 * Why: 几何路由 / 提示词润色 / 搜索 三类 toolType 的算力诉求差异极大,
 * 通过分维度配置实现"小快模型 vs 大慢模型"的成本与质量平衡。
 *
 * 解析顺序: toolType 专属 env → LLM_DEFAULT_* → 内置兜底 (gpt-4o-mini)。
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

/**
 * Discriminated Union 的 toolType 字符串映射到路由维度。
 * Why: 路由配置用 kebab-case 更清晰; schema 内 toolType 用 SCREAMING_CASE 做判别键。
 */
export const toolTypeToRoute = (toolType?: string): LlmToolRoute => {
  switch (toolType) {
    case TOOL_TYPE.ATOMIC_SHAPE:
      return "atomic-shape";
    case TOOL_TYPE.DIFFUSION_MELT:
      return "diffusion-melt";
    case TOOL_TYPE.WEB_SEARCH:
      return "web-search";
    default:
      return "default";
  }
};
