export const ASR_PROVIDER_IDS = [
  "browser-webspeech",
  "whisper-openai",
  "deepgram",
  "aliyun-nls",
  "null",
] as const;

export type AsrProviderId = (typeof ASR_PROVIDER_IDS)[number];

export interface AsrTranscribeRequest {
  audio: Blob;
  languageHint?: string;
}

export interface AsrTranscribeResult {
  transcript: string;
  confidence?: number;
  durationMs: number;
}

/**
 * ASR Provider 抽象。
 * Why: 当前 useVoiceVAD 只输出 "已断句" 信号，utterance 由模拟器伪造。
 * 真实链路必须把音频转文字这一步显式建模并可替换。
 */
export interface AsrProvider {
  readonly id: AsrProviderId;
  /** 一次性转写已停止的录音 Blob */
  transcribe(request: AsrTranscribeRequest): Promise<AsrTranscribeResult>;
  /**
   * 浏览器原生 Web Speech 这类流式 ASR 不需要 Blob，由 hook 直接消费事件。
   * 实现该字段意味着 Provider 支持流式，前端可走 streaming 路径。
   */
  streamingSupport: boolean;
}
