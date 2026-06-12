"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceVADOptions {
  readonly silenceMs?: number;
  readonly volumeThreshold?: number;
  readonly minUtteranceMs?: number;
  /** 每帧 16k 单声道 PCM (Int16 LE), 持续推送给消费者 */
  readonly onAudioFrame?: (pcm: Uint8Array) => void;
  /** 检测到开口 — 调用方此时打开 ws 会话 */
  readonly onUtteranceStart?: () => void;
  /** 检测到结束 — 调用方此时关闭 ws 会话拿最终结果 */
  readonly onUtteranceEnd?: () => void;
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

const WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / channel.length);
    const copy = channel.slice(0);
    this.port.postMessage({ samples: copy, rms }, [copy.buffer]);
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

/**
 * 浏览器麦克风 VAD + 流式 PCM 推送钩子。
 * Why: 实时识别架构下不再 batch 整段 Blob 上传, 而是每帧 PCM 直接推给 ws。
 * VAD 只负责"开口/结束"两个边界信号, 调用方据此 start/stop ws 会话,
 * 中间所有帧通过 onAudioFrame 串流, 实现"边说边出字"。
 *
 * 状态机:
 * - 持续录音 + 前置缓冲 PRE_ROLL_FRAMES 帧 (防止开口头部丢字)
 * - RMS > threshold 第一次: onUtteranceStart 触发, 把前置缓冲帧 + 当前帧推流
 * - speaking 期间每帧推 onAudioFrame
 * - RMS < threshold 持续 silenceMs: onUtteranceEnd, 不再推
 * - 短句过滤: 长度 < minUtteranceMs 视为噪声 (不触发 end)
 */
export function useVoiceVAD(options: VoiceVADOptions = {}): VoiceVADResult {
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const threshold = options.volumeThreshold ?? DEFAULT_VOLUME_THRESHOLD;
  const minUtteranceMs = options.minUtteranceMs ?? DEFAULT_MIN_UTTERANCE_MS;

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
  const preRollRef = useRef<Uint8Array[]>([]);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

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
    preRollRef.current = [];
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
        const pcm = float32ToPcm16(samples);

        if (rms > threshold) {
          if (!wasSpeaking) {
            speakingRef.current = true;
            utteranceStartRef.current = now;
            optionsRef.current.onUtteranceStart?.();
            // 把前置缓冲帧补送 (防止头部丢字)
            for (const frame of preRollRef.current) {
              optionsRef.current.onAudioFrame?.(frame);
            }
            preRollRef.current = [];
          }
          silenceStartRef.current = null;
          optionsRef.current.onAudioFrame?.(pcm);
        } else if (wasSpeaking) {
          // 静音中, 但还在说话状态: 继续推 (尾部静音让阿里云判断断句)
          optionsRef.current.onAudioFrame?.(pcm);
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > silenceMs) {
            const duration = utteranceStartRef.current
              ? now - utteranceStartRef.current
              : 0;
            speakingRef.current = false;
            silenceStartRef.current = null;
            utteranceStartRef.current = null;
            if (duration >= minUtteranceMs) {
              optionsRef.current.onUtteranceEnd?.();
            }
          }
        } else {
          // 没说话, 滚动维护 PRE_ROLL_FRAMES 个最近帧
          preRollRef.current.push(pcm);
          if (preRollRef.current.length > PRE_ROLL_FRAMES) {
            preRollRef.current.shift();
          }
        }
      };

      source.connect(worklet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "麦克风初始化失败");
      stop();
    }
  }, [silenceMs, threshold, minUtteranceMs, stop]);

  useEffect(() => () => stop(), [stop]);

  return { listening, volume, error, start, stop };
}
