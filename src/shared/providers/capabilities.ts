import { ASR_PROVIDER_IDS, type AsrProviderId } from "./asr/types";
import { IMAGE_PROVIDER_IDS, type ImageProviderId } from "./image/types";
import { LLM_PROVIDER_IDS, type LlmProviderId } from "./llm/types";
import { SEARCH_PROVIDER_IDS, type SearchProviderId } from "./search/types";
import { TTS_PROVIDER_IDS, type TtsProviderId } from "./tts/types";

export type CapabilityKind = "llm" | "asr" | "tts" | "image" | "search";

export interface CapabilitySnapshot {
  ready: boolean;
  provider: string | null;
  /** 未就绪原因，用于前端 tooltip */
  reason?: string;
}

export interface CapabilitiesMatrix {
  llm: CapabilitySnapshot;
  asr: CapabilitySnapshot;
  tts: CapabilitySnapshot;
  image: CapabilitySnapshot;
  search: CapabilitySnapshot;
}

type EnvLike = Record<string, string | undefined>;

const isProviderId = <T extends readonly string[]>(
  list: T,
  candidate: string | undefined,
): candidate is T[number] =>
  candidate !== undefined && (list as readonly string[]).includes(candidate);

const requireEnv = (env: EnvLike, keys: string[]): { ok: boolean; missing: string[] } => {
  const missing = keys.filter((k) => !env[k] || env[k]?.trim() === "");
  return { ok: missing.length === 0, missing };
};

const buildSnapshot = (
  providerId: string | undefined,
  required: { ok: boolean; missing: string[] },
): CapabilitySnapshot => {
  if (!providerId) {
    return { ready: false, provider: null, reason: "未配置 Provider" };
  }
  if (!required.ok) {
    return {
      ready: false,
      provider: providerId,
      reason: `缺少环境变量: ${required.missing.join(", ")}`,
    };
  }
  return { ready: true, provider: providerId };
};

const detectLlm = (env: EnvLike): CapabilitySnapshot => {
  // PR2: env 改为 LLM_DEFAULT_PROVIDER, 兼容历史 LLM_PROVIDER 字段
  const id = env.LLM_DEFAULT_PROVIDER ?? env.LLM_PROVIDER;
  if (!isProviderId(LLM_PROVIDER_IDS, id) || id === "null") {
    return { ready: false, provider: null, reason: "未配置 LLM_DEFAULT_PROVIDER" };
  }
  const requirements: Record<Exclude<LlmProviderId, "null">, string[]> = {
    "openai-compatible": ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    mistral: ["MISTRAL_API_KEY"],
  };
  return buildSnapshot(id, requireEnv(env, requirements[id]));
};

const detectAsr = (env: EnvLike): CapabilitySnapshot => {
  const id = env.ASR_PROVIDER;
  if (!isProviderId(ASR_PROVIDER_IDS, id) || id === "null") {
    return { ready: false, provider: null, reason: "未配置 ASR_PROVIDER" };
  }
  const requirements: Record<Exclude<AsrProviderId, "null">, string[]> = {
    "browser-webspeech": [],
    "whisper-openai": ["OPENAI_API_KEY"],
    deepgram: ["DEEPGRAM_API_KEY"],
    "aliyun-nls": ["ALIYUN_NLS_APP_KEY", "ALIYUN_NLS_TOKEN"],
  };
  return buildSnapshot(id, requireEnv(env, requirements[id]));
};

const detectTts = (env: EnvLike): CapabilitySnapshot => {
  const id = env.TTS_PROVIDER;
  if (!isProviderId(TTS_PROVIDER_IDS, id) || id === "null") {
    return { ready: false, provider: null, reason: "未配置 TTS_PROVIDER" };
  }
  const requirements: Record<Exclude<TtsProviderId, "null">, string[]> = {
    openai: ["OPENAI_API_KEY"],
    elevenlabs: ["ELEVENLABS_API_KEY"],
    "aliyun-cosyvoice": ["ALIYUN_TTS_APP_KEY", "ALIYUN_TTS_TOKEN"],
    azure: ["AZURE_TTS_KEY", "AZURE_TTS_REGION"],
  };
  return buildSnapshot(id, requireEnv(env, requirements[id]));
};

const detectImage = (env: EnvLike): CapabilitySnapshot => {
  const id = env.IMAGE_PROVIDER;
  if (!isProviderId(IMAGE_PROVIDER_IDS, id) || id === "null") {
    return { ready: false, provider: null, reason: "未配置 IMAGE_PROVIDER" };
  }
  const requirements: Record<Exclude<ImageProviderId, "null">, string[]> = {
    "openai-dalle": ["OPENAI_API_KEY"],
    stability: ["STABILITY_API_KEY"],
    replicate: ["REPLICATE_API_TOKEN"],
    "aliyun-wanxiang": ["ALIYUN_WANXIANG_API_KEY"],
  };
  return buildSnapshot(id, requireEnv(env, requirements[id]));
};

const detectSearch = (env: EnvLike): CapabilitySnapshot => {
  const id = env.SEARCH_PROVIDER;
  if (!isProviderId(SEARCH_PROVIDER_IDS, id) || id === "null") {
    return { ready: false, provider: null, reason: "未配置 SEARCH_PROVIDER" };
  }
  const requirements: Record<Exclude<SearchProviderId, "null">, string[]> = {
    tavily: ["TAVILY_API_KEY"],
    serper: ["SERPER_API_KEY"],
    brave: ["BRAVE_SEARCH_API_KEY"],
    exa: ["EXA_API_KEY"],
  };
  return buildSnapshot(id, requireEnv(env, requirements[id]));
};

/**
 * 能力探测纯函数 — 唯一可信来源。
 * Why: 集中扫 env 让前后端共用同一套规则，避免 UI 与 API 对 ready 判断不一致。
 * 通过参数注入 env，方便单测覆盖各种缺漏组合。
 */
export const detectCapabilities = (env: EnvLike = process.env): CapabilitiesMatrix => ({
  llm: detectLlm(env),
  asr: detectAsr(env),
  tts: detectTts(env),
  image: detectImage(env),
  search: detectSearch(env),
});
