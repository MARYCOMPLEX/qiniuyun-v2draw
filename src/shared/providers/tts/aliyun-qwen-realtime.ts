/**
 * 阿里云 Qwen3-TTS Realtime Provider
 *
 * Why: 给智能体的 narration 配实时声音, 必须毫秒级首包,
 * 整句合成会破坏"先说话再画图"的体感。
 *
 * 协议: WebSocket 双向流
 *   wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=<model>
 *   Authorization: bearer <DASHSCOPE_API_KEY>
 *
 * 时序 (server_commit 模式):
 *   1. open ws → 服务端推 session.created
 *   2. 客户端发 session.update 设置 voice / format / mode
 *   3. 客户端持续 append_text(chunk) → 服务端自动断句合成
 *   4. 服务端流回 response.audio.delta (base64 PCM 24kHz mono 16-bit)
 *   5. 客户端发 session.finish → 服务端清空缓冲并返回 session.finished
 */

import type {
  TtsAudioFrame,
  TtsProvider,
  TtsStreamHandle,
  TtsStreamRequest,
} from "./types";

const DEFAULT_MODEL = "qwen3-tts-flash-realtime";
const DEFAULT_VOICE = "Cherry";
const SAMPLE_RATE = 24000;
const WS_ENDPOINT = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";

interface ProviderOptions {
  apiKey: string;
  model?: string;
  voice?: string;
  /** 注入 ws 构造函数 (单测用 mock) */
  webSocketImpl?: typeof import("ws").WebSocket;
}

interface QwenTtsEvent {
  type: string;
  delta?: string;
  session?: { id?: string };
  error?: { message?: string; code?: string };
}

const decodeBase64 = (b64: string): Uint8Array => {
  // Node 18+ 与浏览器 Buffer 不一致, 这里用 atob + Uint8Array 通用路径
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * 异步队列 — frames 迭代器底层实现。
 * push: 服务端事件触发 → 进队列 + 唤醒 pending pull
 * close: ws 正常关闭 → 队列耗尽后 done
 * fail:  协议异常 → 下一次 pull 抛错
 */
class FrameQueue {
  private buffer: TtsAudioFrame[] = [];
  private pending: Array<{
    resolve: (r: IteratorResult<TtsAudioFrame>) => void;
    reject: (e: Error) => void;
  }> = [];
  private closed = false;
  private error: Error | null = null;

  push(frame: TtsAudioFrame): void {
    if (this.closed) return;
    const waiter = this.pending.shift();
    if (waiter) waiter.resolve({ value: frame, done: false });
    else this.buffer.push(frame);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.pending) waiter.resolve({ value: undefined, done: true });
    this.pending = [];
  }

  fail(err: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.error = err;
    for (const waiter of this.pending) waiter.reject(err);
    this.pending = [];
  }

  pull(): Promise<IteratorResult<TtsAudioFrame>> {
    const next = this.buffer.shift();
    if (next) return Promise.resolve({ value: next, done: false });
    if (this.error) return Promise.reject(this.error);
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }
}

/**
 * 实时合成会话状态机。逐事件推进:
 *   create → session.created → session.update → ready
 *   append_text(...) → response.audio.delta → frame
 *   finish → session.finish → session.finished → close
 */
const openQwenTtsStream = async (
  opts: ProviderOptions,
  request: TtsStreamRequest,
): Promise<TtsStreamHandle> => {
  const url = `${WS_ENDPOINT}?model=${encodeURIComponent(opts.model ?? DEFAULT_MODEL)}`;
  const headers = { Authorization: `bearer ${opts.apiKey}` };

  // ws 库 (服务端) vs 浏览器 WebSocket: 服务端走 ws.WebSocket 才能传 headers
  // 浏览器场景这条路径用不到 (前端走反代 /api/tts), 但保留 fallback
  const WSImpl = opts.webSocketImpl ?? (await loadServerWebSocket());
  const ws = new WSImpl(url, { headers });

  const queue = new FrameQueue();
  let sessionReady = false;
  let finishResolve: (() => void) | null = null;
  const handlers: {
    resolveReady?: () => void;
    rejectReady?: (e: Error) => void;
  } = {};
  const sessionReadyPromise = new Promise<void>((resolve, reject) => {
    handlers.resolveReady = resolve;
    handlers.rejectReady = reject;
  });

  ws.on("open", () => {
    // session.update 设置音色 / 输出格式 / server_commit 模式
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          voice: opts.voice ?? DEFAULT_VOICE,
          response_format: "pcm_24000hz_mono_16bit",
          mode: "server_commit",
        },
      }),
    );
  });

  ws.on("message", (raw: Buffer | string) => {
    let event: QwenTtsEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (event.type) {
      case "session.created":
        // 不主动 resolve, 等 session.updated 才认为可发文本
        break;
      case "session.updated":
        sessionReady = true;
        handlers.resolveReady?.();
        break;
      case "response.audio.delta":
        if (event.delta) {
          queue.push({ pcm: decodeBase64(event.delta), sampleRate: SAMPLE_RATE });
        }
        break;
      case "session.finished":
        queue.close();
        finishResolve?.();
        try {
          ws.close();
        } catch {
          // 忽略 close 异常
        }
        break;
      case "error": {
        const msg = event.error?.message ?? "qwen-tts error";
        const err = new Error(`QWEN_TTS_ERROR: ${msg}`);
        if (!sessionReady) handlers.rejectReady?.(err);
        queue.fail(err);
        break;
      }
    }
  });

  ws.on("error", (err: Error) => {
    if (!sessionReady) handlers.rejectReady?.(err);
    queue.fail(err);
  });

  ws.on("close", () => {
    queue.close();
    finishResolve?.();
  });

  if (request.signal) {
    const onAbort = () => {
      queue.fail(new Error("TTS_ABORTED"));
      try {
        ws.close();
      } catch {
        // 忽略
      }
    };
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener("abort", onAbort, { once: true });
  }

  await sessionReadyPromise;

  return {
    appendText: (chunk: string): void => {
      if (!chunk) return;
      ws.send(JSON.stringify({ type: "input_text_buffer.append", text: chunk }));
    },
    finish: async (): Promise<void> => {
      ws.send(JSON.stringify({ type: "session.finish" }));
      await new Promise<void>((resolve) => {
        finishResolve = resolve;
      });
    },
    abort: (): void => {
      queue.fail(new Error("TTS_ABORTED"));
      try {
        ws.close();
      } catch {
        // 忽略
      }
    },
    frames: {
      [Symbol.asyncIterator](): AsyncIterator<TtsAudioFrame> {
        return { next: () => queue.pull() };
      },
    },
  };
};

const loadServerWebSocket = async (): Promise<typeof import("ws").WebSocket> => {
  const mod = await import("ws");
  return mod.WebSocket;
};

export const createAliyunQwenRealtimeTts = (opts: ProviderOptions): TtsProvider => ({
  id: "aliyun-qwen-realtime",
  openStream: (request: TtsStreamRequest) => openQwenTtsStream(opts, request),
});
