"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceVADOptions {
  readonly silenceMs?: number;
  readonly volumeThreshold?: number;
  readonly minUtteranceMs?: number;
  readonly onUtteranceEnd?: (audio: Blob) => void;
}

interface VoiceVADResult {
  readonly listening: boolean;
  readonly volume: number;
  readonly error: string | null;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
}

const DEFAULT_SILENCE_MS = 700;
const DEFAULT_VOLUME_THRESHOLD = 0.02;
const DEFAULT_MIN_UTTERANCE_MS = 400;
const TARGET_SAMPLE_RATE = 16_000;
const PRE_ROLL_FRAMES = 4;

/**
 * AudioWorklet 处理器源码 — 在 audio thread 里跑, 不会被主线程卡顿丢帧。
 * 每收到 128 帧 (Web Audio block) 就 postMessage 把 Float32 样本上抛, 加上 RMS。
 * 主线程合成 chunks, 不再做降采样 (AudioContext 已强制 16k)。
 */
const WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / channel.length);
    this.port.postMessage({ samples: channel.slice(0), rms }, [channel.slice(0).buffer]);
    return true;
  }
}
registerProcessor('pcm-capture', PcmCaptureProcessor);
`;

const float32ToPcm16 = (input: Float32Array): Uint8Array => {
  const out = new Uint8Array(input.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]!));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return out;
};

const concatPcmChunks = (chunks: readonly Uint8Array[]): Blob => {
  const total = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([merged], { type: "audio/pcm" });
};

/**
 * 浏览器麦克风 VAD + AudioWorklet PCM 录音钩子。
 * Why: ScriptProcessor 在 audio worklet 时代会被 throttle 导致丢帧, 录出来断续噪音。
 * 改用 AudioWorklet 跑 audio 专属线程, 强制 AudioContext 走 16k, 直接吐 16k 单声道 PCM,
 * 阿里云 NLS 直接吃, 不需要降采样。
 *
 * 状态机:
 * - 始终录: postMessage 累积到 ring buffer, 平时只保留 PRE_ROLL_FRAMES 帧
 * - RMS > threshold 第一次: 标记 speaking, 开始累积本句
 * - RMS < threshold 持续 silenceMs: 视为说完, flush PCM Blob, 清空 chunks 继续监听
 */
export function useVoiceVAD(options: VoiceVADOptions = {}): VoiceVADResult {
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const threshold = options.volumeThreshold ?? DEFAULT_VOLUME_THRESHOLD;
  const minUtteranceMs = options.minUtteranceMs ?? DEFAULT_MIN_UTTERANCE_MS;
  const onUtteranceEnd = options.onUtteranceEnd;

  const [listening, setListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const workletUrlRef = useRef<string | null>(null);

  const speakingRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number | null>(null);
  const utteranceStartRef = useRef<number | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const onUtteranceEndRef = useRef(onUtteranceEnd);

  useEffect(() => {
    onUtteranceEndRef.current = onUtteranceEnd;
  }, [onUtteranceEnd]);

  const flushUtterance = useCallback((): void => {
    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];
    const startedAt = utteranceStartRef.current;
    utteranceStartRef.current = null;

    if (chunks.length === 0 || startedAt === null) return;
    if (performance.now() - startedAt < minUtteranceMs) return;

    const blob = concatPcmChunks(chunks);
    onUtteranceEndRef.current?.(blob);
  }, [minUtteranceMs]);

  const stop = useCallback((): void => {
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => undefined);
    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }
    workletRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    speakingRef.current = false;
    silenceStartRef.current = null;
    utteranceStartRef.current = null;
    pcmChunksRef.current = [];
    setListening(false);
    setVolume(0);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      // 强制 16k 采样率, 现代浏览器都支持
      const ctx = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });

      const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      workletUrlRef.current = url;
      await ctx.audioWorklet.addModule(url);

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "pcm-capture");

      audioCtxRef.current = ctx;
      streamRef.current = stream;
      sourceRef.current = source;
      workletRef.current = worklet;
      setError(null);
      setListening(true);

      worklet.port.onmessage = (event: MessageEvent<{ samples: Float32Array; rms: number }>) => {
        const { samples, rms } = event.data;
        setVolume(rms);

        const now = performance.now();
        const wasSpeaking = speakingRef.current;

        if (rms > threshold) {
          if (!wasSpeaking) {
            speakingRef.current = true;
            utteranceStartRef.current = now;
            // 开口时只保留前置缓冲, 清掉静音
            if (pcmChunksRef.current.length > PRE_ROLL_FRAMES) {
              pcmChunksRef.current = pcmChunksRef.current.slice(-PRE_ROLL_FRAMES);
            }
          }
          silenceStartRef.current = null;
        } else if (wasSpeaking) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > silenceMs) {
            flushUtterance();
            speakingRef.current = false;
            silenceStartRef.current = null;
          }
        } else if (pcmChunksRef.current.length > PRE_ROLL_FRAMES) {
          // 静音期间限制 buffer 大小, 只保留最近 PRE_ROLL_FRAMES 帧
          pcmChunksRef.current = pcmChunksRef.current.slice(-PRE_ROLL_FRAMES);
        }

        pcmChunksRef.current.push(float32ToPcm16(samples));
      };

      source.connect(worklet);
      // 不连 destination, 避免回声 / 自激
    } catch (err) {
      setError(err instanceof Error ? err.message : "麦克风初始化失败");
      stop();
    }
  }, [silenceMs, threshold, flushUtterance, stop]);

  useEffect(() => () => stop(), [stop]);

  return { listening, volume, error, start, stop };
}
