import { nullLlmProvider } from "./null";
import { LLM_PROVIDER_IDS, type LlmProvider, type LlmProviderId } from "./types";

type EnvLike = Record<string, string | undefined>;

/**
 * LLM Provider 工厂（PR1 仅注册骨架，具体实现在后续 PR 注入）。
 * Why: 把 "选哪家 + 实例化" 的决策从 route.ts 抽出来，
 * 后续接 anthropic/google 时只需在 switch 中追加分支，不用改路由。
 */
export const getLlmProvider = (env: EnvLike = process.env): LlmProvider => {
  const id = env.LLM_PROVIDER;
  if (!id || !(LLM_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullLlmProvider;
  }
  switch (id as LlmProviderId) {
    case "openai-compatible":
    case "anthropic":
    case "google":
    case "mistral":
      // PR2 才注入真实实现；当前回落到 null，避免本 PR 引入 SDK 副作用。
      return nullLlmProvider;
    case "null":
    default:
      return nullLlmProvider;
  }
};
