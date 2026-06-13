export const TTS_PROVIDER_IDS = [
  "aliyun-qwen-realtime",
  "null",
] as const;

export type TtsProviderId = (typeof TTS_PROVIDER_IDS)[number];

/** PCM 16-bit 单声道，采样率由 provider 声明 */
export interface TtsAudioFrame {
  pcm: Uint8Array;
  sampleRate: number;
}

export interface TtsStreamHandle {
  /** 追加文本片段（server_commit 模式下服务端自动断句合成） */
  appendText: (chunk: string) => void;
  /** 通知服务端"用户输入结束"，等待最后一段音频回吐后流自然关闭 */
  finish: () => Promise<void>;
  /** 主动中止：取消任务并关闭 ws */
  abort: () => void;
  /** PCM 帧异步可迭代器 — 调用方用 for-await 消费 */
  frames: AsyncIterable<TtsAudioFrame>;
}

export interface TtsStreamRequest {
  voiceId?: string;
  /** 当前会话的 abort 信号，关闭页面或切换会话时传入 */
  signal?: AbortSignal;
}

/**
 * TTS Provider 抽象 — 实时流式合成。
 * Why: TTS 给智能体的 narration 配音, 必须毫秒级首包,
 * 整句合成会让"先说话再画图"的体感破功。
 * openStream 返回的 handle 让调用方边吐文本边收音频, 双向流。
 */
export interface TtsProvider {
  readonly id: TtsProviderId;
  openStream(request: TtsStreamRequest): Promise<TtsStreamHandle>;
}

