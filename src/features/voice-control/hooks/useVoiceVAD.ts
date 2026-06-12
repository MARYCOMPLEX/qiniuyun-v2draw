"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceVADOptions {
  readonly silenceMs?: number;
  readonly volumeThreshold?: number;
  readonly onUtteranceEnd?: () => void;
}

interface VoiceVADResult {
  readonly listening: boolean;
  readonly volume: number;
  readonly error: string | null;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
}

const DEFAULT_SILENCE_MS = 600;
const DEFAULT_VOLUME_THRESHOLD = 0.04;
const FFT_SIZE = 512;

const computeRms = (buffer: Uint8Array): number => {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = (buffer[i]! - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / buffer.length);
};

/**
 * 浏览器麦克风 VAD 钩子。
 * Why: HTTP 流式架构需要前端自己做断句——AudioContext 计算 RMS 音量，
 * 一旦低于阈值并持续 silenceMs 即视为说完，触发 onUtteranceEnd 上行。
 */
export function useVoiceVAD(options: VoiceVADOptions = {}): VoiceVADResult {
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const threshold = options.volumeThreshold ?? DEFAULT_VOLUME_THRESHOLD;
  const onUtteranceEnd = options.onUtteranceEnd;

  const [listening, setListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const speakingRef = useRef<boolean>(false);

  const stop = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
    speakingRef.current = false;
    silenceStartRef.current = null;
    setListening(false);
    setVolume(0);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      streamRef.current = stream;
      analyserRef.current = analyser;
      setError(null);
      setListening(true);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = (): void => {
        analyser.getByteTimeDomainData(buffer);
        const rms = computeRms(buffer);
        setVolume(rms);

        if (rms > threshold) {
          speakingRef.current = true;
          silenceStartRef.current = null;
        } else if (speakingRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = performance.now();
          } else if (performance.now() - silenceStartRef.current > silenceMs) {
            speakingRef.current = false;
            silenceStartRef.current = null;
            onUtteranceEnd?.();
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(err instanceof Error ? err.message : "麦克风初始化失败");
      stop();
    }
  }, [silenceMs, threshold, onUtteranceEnd, stop]);

  useEffect(() => () => stop(), [stop]);

  return { listening, volume, error, start, stop };
}
