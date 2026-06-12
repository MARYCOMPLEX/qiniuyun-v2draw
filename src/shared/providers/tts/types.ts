export const TTS_PROVIDER_IDS = [
  "openai",
  "elevenlabs",
  "aliyun-cosyvoice",
  "azure",
  "null",
] as const;

export type TtsProviderId = (typeof TTS_PROVIDER_IDS)[number];

export interface TtsSynthesizeRequest {
  text: string;
  voiceId?: string;
  /** 用户在面板上调过的语速 / 音量，由前端透传 */
  rate?: number;
  volume?: number;
}

export interface TtsSynthesizeResult {
  /** 二进制音频；前端用 URL.createObjectURL 包成 audio src */
  audio: Blob;
  mimeType: string;
}

/**
 * TTS Provider 抽象。
 * Why: TTS 是可选增强能力（capabilities.tts.ready=false 时整链路绕过），
 * 接口需要与 LLM/ASR 一样的 ready 探测语义，详见 capabilities.ts
 */
export interface TtsProvider {
  readonly id: TtsProviderId;
  synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
}
