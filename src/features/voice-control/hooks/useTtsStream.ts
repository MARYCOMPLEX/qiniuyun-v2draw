"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { decodePcm16leToFloat32 } from "@/shared/providers/tts/pcm";

const SAMPLE_RATE = 24000;
const SCHEDULE_LEAD_SECONDS = 0.05;

interface TtsStreamState {
  readonly playing: boolean;
  readonly error: string | null;
}

interface TtsStreamAPI extends TtsStreamState {
  readonly speak: (text: string, voiceId?: string) => Promise<void>;
  readonly stop: () => void;
}

const ensureAudioContext = (
  ref: { current: AudioContext | null },
): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (ref.current && ref.current.state !== "closed") return ref.current;
  // 24kHz 与服务端响应头声明一致, 不需要 resampling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) return null;
  ref.current = new Ctx({ sampleRate: SAMPLE_RATE });
  return ref.current;
};

/**
 * 浏览器侧 TTS 流式播放 hook。
 * Why: /api/tts 返回连续 PCM 二进制流, MediaSource 不支持原始 PCM,
 * 用 AudioContext + AudioBufferSourceNode 排队播放是延迟最低的方案 (~50ms 首声)。
 *
 * 排队策略: 收到一个 PCM chunk 就 decode → 创建 source → schedule 在 nextStartTime,
 * nextStartTime 维护"下一段应该在 AudioContext 时钟的哪个时刻起播", 让相邻片段无缝衔接。
 */
export function useTtsStream(): TtsStreamAPI {
  const [state, setState] = useState<TtsStreamState>({ playing: false, error: null });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextStartRef = useRef<number>(0);

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    nextStartRef.current = 0;
    setState((prev) => ({ ...prev, playing: false }));
  }, []);

  const scheduleChunk = useCallback((float32: Float32Array): void => {
    const ctx = audioCtxRef.current;
    if (!ctx || float32.length === 0) return;
    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(nextStartRef.current, now + SCHEDULE_LEAD_SECONDS);
    source.start(startAt);
    nextStartRef.current = startAt + buffer.duration;
  }, []);

  const speak = useCallback(
    async (text: string, voiceId?: string): Promise<void> => {
      stop();
      const ctx = ensureAudioContext(audioCtxRef);
      if (!ctx) {
        setState({ playing: false, error: "AudioContext 不可用" });
        return;
      }
      // Safari 需要在用户手势后 resume; 调用方已是事件回调, 这里再保险一次
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // 忽略 resume 失败, 后续 schedule 会再次尝试隐式启动
        }
      }
      nextStartRef.current = 0;

      const controller = new AbortController();
      abortRef.current = controller;
      setState({ playing: true, error: null });

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(`/api/tts ${res.status}: ${detail.slice(0, 160)}`);
        }
        const reader = res.body.getReader();
        // 累积裸字节: 服务端可能在 16-bit 边界中间断帧, 必须自己重组
        let leftover = new Uint8Array(0);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          const merged = new Uint8Array(leftover.length + value.length);
          merged.set(leftover, 0);
          merged.set(value, leftover.length);
          const evenLen = merged.length - (merged.length % 2);
          if (evenLen > 0) {
            const decoded = decodePcm16leToFloat32(merged.buffer.slice(0, evenLen));
            scheduleChunk(decoded);
          }
          leftover = merged.subarray(evenLen);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "tts 失败";
        setState({ playing: false, error: message });
        return;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }

      // 等最后一段排队播放结束再切 playing=false, 让 UI 上的"正在说话"指示更准
      const ctxNow = audioCtxRef.current;
      const tail = nextStartRef.current - (ctxNow?.currentTime ?? 0);
      const finishDelay = Math.max(0, tail) * 1000;
      window.setTimeout(() => {
        setState((prev) => (prev.error ? prev : { playing: false, error: null }));
      }, finishDelay);
    },
    [stop, scheduleChunk],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      audioCtxRef.current?.close().catch(() => {
        // 关闭异常忽略, 浏览器会回收
      });
    },
    [],
  );

  return { ...state, speak, stop };
}
