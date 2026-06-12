/**
 * Provider Registry 门面 — 对外唯一入口。
 * Why: 业务代码只 import 这一个文件，
 * 内部 llm/asr/tts/image/search 子模块的目录结构演进对外不可见。
 */

export { detectCapabilities } from "./capabilities";
export type { CapabilityKind, CapabilitySnapshot, CapabilitiesMatrix } from "./capabilities";

export { getLlmProvider } from "./llm/registry";
export { LLM_PROVIDER_IDS } from "./llm/types";
export type { LlmProvider, LlmProviderId, LlmStreamRequest, LlmStreamResponse } from "./llm/types";

export { getAsrProvider } from "./asr/registry";
export { ASR_PROVIDER_IDS } from "./asr/types";
export type {
  AsrProvider,
  AsrProviderId,
  AsrTranscribeRequest,
  AsrTranscribeResult,
} from "./asr/types";

export { getTtsProvider } from "./tts/registry";
export { TTS_PROVIDER_IDS } from "./tts/types";
export type {
  TtsProvider,
  TtsProviderId,
  TtsSynthesizeRequest,
  TtsSynthesizeResult,
} from "./tts/types";

export { getImageProvider } from "./image/registry";
export { IMAGE_PROVIDER_IDS } from "./image/types";
export type {
  ImageProvider,
  ImageProviderId,
  ImageGenerateRequest,
  ImageGenerateResult,
} from "./image/types";

export { getSearchProvider } from "./search/registry";
export { SEARCH_PROVIDER_IDS } from "./search/types";
export type {
  SearchProvider,
  SearchProviderId,
  SearchQueryRequest,
  SearchResultItem,
  SearchQueryResult,
} from "./search/types";
