"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_LEAD_SECONDS = 60;
const TOKEN_FETCH_TIMEOUT_MS = 5_000;

interface AsrTokenInfo {
  token: string;
  expireAt: number;
  appkey: string;
  wsUrl: string;
}

interface RealtimeAsrEvents {
  /** 中间结果 — 边说边出字, 实时刷新 */
  onPartial?: (transcript: string) => void;
  /** 一句话最终结果 — 通常对应 RecognitionCompleted */
  onFinal?: (transcript: string) => void;
  /** ws / token / 协议异常 */
  onError?: (error: string) => void;
}

interface RealtimeAsrState {
  readonly connected: boolean;
  readonly recognizing: boolean;
  readonly error: string | null;
  readonly latestPartial: string;
}

interface RealtimeAsrAPI extends RealtimeAsrState {
  readonly start: () => Promise<void>;
  readonly sendAudio: (pcm: Uint8Array) => void;
  readonly stop: () => Promise<void>;
  readonly disconnect: () => void;
}

const uuidHex = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const fetchToken = async (): Promise<AsrTokenInfo> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/asr-token", {
      method: "POST",
      signal: controller.signal,
    });
    const json = (await res.json()) as
      | { success: true; data: AsrTokenInfo }
      | { success: false; code: string; message: string };
    if (!json.success) throw new Error(json.message);
    return json.data;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 浏览器直连阿里云 NLS 一句话识别 ws 客户端。
 * Why: 比 batch 上传 PCM 模式快 10 倍——边说边收 changed 事件, 200-500ms 出第一个字。
 * 服务端只签发短期 token, 不维护任何长连接。
 *
 * 协议时序:
 *   start():    fetch /api/asr-token → ws.connect → 发 StartRecognition
 *               收 RecognitionStarted 后 promise resolve, 此后可 sendAudio
 *   sendAudio:  Binary frame, 把 PCM 16k 单声道直接推
 *   stop():     发 StopRecognition, 等 RecognitionCompleted, 关 ws
 *
 * 边说边出字: onPartial 在每个 RecognitionResultChanged 事件触发。
 *
 * Token 缓存: 进程内复用 ws 内嵌 token, 过期前 60 秒主动 refetch。
 */
export function useRealtimeAsr(events: RealtimeAsrEvents = {}): RealtimeAsrAPI {
  const [state, setState] = useState<RealtimeAsrState>({
    connected: false,
    recognizing: false,
    error: null,
    latestPartial: "",
  });

  const wsRef = useRef<WebSocket | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const tokenRef = useRef<AsrTokenInfo | null>(null);
  const tokenFetchInflightRef = useRef<Promise<AsrTokenInfo> | null>(null);
  const startInflightRef = useRef<Promise<void> | null>(null);
  const eventsRef = useRef(events);
  const recognizingRef = useRef<boolean>(false);
  const pendingAudioRef = useRef<Uint8Array[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedResolverRef = useRef<{
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);
  const completedResolverRef = useRef<{
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);

  const clearIdleTimer = useCallback((): void => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const ensureToken = useCallback(async (): Promise<AsrTokenInfo> => {
    const now = Math.floor(Date.now() / 1000);
    const cached = tokenRef.current;
    if (cached && cached.expireAt - now > REFRESH_LEAD_SECONDS) return cached;
    // 合并并发请求 — VAD 短时间内多次断句不会触发多次 fetch
    if (tokenFetchInflightRef.current) return tokenFetchInflightRef.current;
    const inflight = fetchToken().finally(() => {
      tokenFetchInflightRef.current = null;
    });
    tokenFetchInflightRef.current = inflight;
    const fresh = await inflight;
    tokenRef.current = fresh;
    return fresh;
  }, []);

  const teardown = useCallback((): void => {
    clearIdleTimer();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        // 忽略关闭异常
      }
    }
    wsRef.current = null;
    taskIdRef.current = null;
    recognizingRef.current = false;
    pendingAudioRef.current = [];
    if (startedResolverRef.current) {
      startedResolverRef.current.reject(new Error("ws 已关闭"));
      startedResolverRef.current = null;
    }
    if (completedResolverRef.current) {
      completedResolverRef.current.reject(new Error("ws 已关闭"));
      completedResolverRef.current = null;
    }
    setState((prev) => ({ ...prev, connected: false, recognizing: false }));
  }, [clearIdleTimer]);

  const handleMessage = useCallback((data: string): void => {
    let msg: {
      header?: { name?: string; status?: number; status_text?: string };
      payload?: { result?: string };
    };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const name = msg.header?.name;
    if (name === "RecognitionStarted") {
      recognizingRef.current = true;
      // flush 早期入队的 PCM 帧 (开口瞬间到 ws 真正 ready 之间累积的)
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        for (const chunk of pendingAudioRef.current) ws.send(chunk);
      }
      pendingAudioRef.current = [];
      startedResolverRef.current?.resolve();
      startedResolverRef.current = null;
      setState((prev) => ({ ...prev, recognizing: true }));
    } else if (name === "RecognitionResultChanged") {
      const result = msg.payload?.result ?? "";
      setState((prev) => ({ ...prev, latestPartial: result }));
      eventsRef.current.onPartial?.(result);
    } else if (name === "RecognitionCompleted") {
      const result = msg.payload?.result ?? "";
      eventsRef.current.onFinal?.(result);
      recognizingRef.current = false;
      pendingAudioRef.current = [];
      completedResolverRef.current?.resolve();
      completedResolverRef.current = null;
      setState((prev) => ({ ...prev, recognizing: false, latestPartial: "" }));
      // 主动关闭 ws — 阿里云会话语义"一连接一句话", 闲置触发 IDLE_TIMEOUT。
      // 下次 start() 按需重连, token 缓存命中, 重连成本仅 ws 握手 ~150ms。
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.close(1000, "completed");
        } catch {
          // 忽略
        }
      }
      wsRef.current = null;
    } else if (name === "TaskFailed") {
      const reason = msg.header?.status_text ?? "TaskFailed";
      recognizingRef.current = false;
      pendingAudioRef.current = [];
      // IDLE_TIMEOUT 不算用户可见错误, 静默处理 (ws 会随后自动 close, 下次重连)
      const isIdleTimeout = /IDLE_TIMEOUT/i.test(reason);
      if (!isIdleTimeout) {
        setState((prev) => ({ ...prev, error: reason, recognizing: false }));
        eventsRef.current.onError?.(reason);
      } else {
        setState((prev) => ({ ...prev, recognizing: false }));
      }
      startedResolverRef.current?.reject(new Error(reason));
      completedResolverRef.current?.reject(new Error(reason));
      startedResolverRef.current = null;
      completedResolverRef.current = null;
    }
  }, []);

  const connect = useCallback(
    async (info: AsrTokenInfo): Promise<WebSocket> => {
      // 阿里云 ws 网关支持 query 参数传 token, 浏览器无法设自定义 header
      const url = `${info.wsUrl}?token=${encodeURIComponent(info.token)}`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      return new Promise<WebSocket>((resolve, reject) => {
        const onOpen = () => {
          ws.removeEventListener("error", onError);
          setState((prev) => ({ ...prev, connected: true, error: null }));
          resolve(ws);
        };
        const onError = () => {
          ws.removeEventListener("open", onOpen);
          reject(new Error("ws connect failed"));
        };
        ws.addEventListener("open", onOpen, { once: true });
        ws.addEventListener("error", onError, { once: true });
        ws.addEventListener("message", (e) => {
          if (typeof e.data === "string") handleMessage(e.data);
        });
        ws.addEventListener("close", () => {
          setState((prev) => ({ ...prev, connected: false, recognizing: false }));
        });
      });
    },
    [handleMessage],
  );

  const start = useCallback(async (): Promise<void> => {
    if (state.recognizing) return;
    // 合并并发 start — VAD 短时间多次触发只跑一次
    if (startInflightRef.current) return startInflightRef.current;

    const promise = (async (): Promise<void> => {
      clearIdleTimer();
      setState((prev) => ({ ...prev, error: null, latestPartial: "" }));

      const info = await ensureToken();
      let ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        ws = await connect(info);
        wsRef.current = ws;
      }

      const taskId = uuidHex();
      taskIdRef.current = taskId;

      const startReq = {
        header: {
          message_id: uuidHex(),
          task_id: taskId,
          namespace: "SpeechRecognizer",
          name: "StartRecognition",
          appkey: info.appkey,
        },
        payload: {
          format: "pcm",
          sample_rate: 16000,
          enable_intermediate_result: true,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true,
        },
        context: {
          sdk: { name: "voice-canvas-web", version: "1.0", language: "javascript" },
        },
      };

      await new Promise<void>((resolve, reject) => {
        startedResolverRef.current = { resolve, reject };
        ws!.send(JSON.stringify(startReq));
      });
    })().finally(() => {
      startInflightRef.current = null;
    });

    startInflightRef.current = promise;
    return promise;
  }, [state.recognizing, ensureToken, connect, clearIdleTimer]);

  const sendAudio = useCallback((pcm: Uint8Array): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (recognizingRef.current) {
      ws.send(pcm);
    } else {
      // ws 已开但还没收到 RecognitionStarted, 入队等 flush
      pendingAudioRef.current.push(pcm);
      // 防止失控积累 (~10 秒上限, 16k * 10 / 128 ≈ 1250 帧)
      if (pendingAudioRef.current.length > 1500) {
        pendingAudioRef.current.shift();
      }
    }
  }, []);

  const stop = useCallback(async (): Promise<void> => {
    const ws = wsRef.current;
    const taskId = taskIdRef.current;
    const info = tokenRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !taskId || !info) return;

    const stopReq = {
      header: {
        message_id: uuidHex(),
        task_id: taskId,
        namespace: "SpeechRecognizer",
        name: "StopRecognition",
        appkey: info.appkey,
      },
    };

    await new Promise<void>((resolve, reject) => {
      completedResolverRef.current = { resolve, reject };
      ws.send(JSON.stringify(stopReq));
    });
  }, []);

  const disconnect = useCallback(teardown, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return { ...state, start, sendAudio, stop, disconnect };
}
