import { describe, expect, it, vi } from "vitest";

import type {
  TtsAudioFrame,
  TtsProvider,
  TtsStreamHandle,
  TtsStreamRequest,
} from "@/shared/providers";

const makeMockHandle = (): TtsStreamHandle & {
  appended: string[];
  finished: boolean;
  aborted: boolean;
  pushFrame: (bytes: number[]) => void;
  endFrames: () => void;
} => {
  const appended: string[] = [];
  let finished = false;
  let aborted = false;
  const buffer: TtsAudioFrame[] = [];
  const pending: Array<{
    resolve: (r: IteratorResult<TtsAudioFrame>) => void;
    reject: (e: Error) => void;
  }> = [];
  let closed = false;
  let error: Error | null = null;

  const pushFrame = (bytes: number[]): void => {
    const frame = { pcm: new Uint8Array(bytes), sampleRate: 24000 };
    const w = pending.shift();
    if (w) w.resolve({ value: frame, done: false });
    else buffer.push(frame);
  };
  const endFrames = (): void => {
    closed = true;
    for (const w of pending) w.resolve({ value: undefined, done: true });
    pending.length = 0;
  };

  return {
    appended,
    get finished() {
      return finished;
    },
    get aborted() {
      return aborted;
    },
    pushFrame,
    endFrames,
    appendText: (chunk: string) => {
      appended.push(chunk);
    },
    finish: async () => {
      finished = true;
    },
    abort: () => {
      aborted = true;
      if (!error) error = new Error("ABORTED");
      for (const w of pending) w.reject(error);
      pending.length = 0;
    },
    frames: {
      [Symbol.asyncIterator](): AsyncIterator<TtsAudioFrame> {
        return {
          next: () => {
            const next = buffer.shift();
            if (next) return Promise.resolve({ value: next, done: false });
            if (error) return Promise.reject(error);
            if (closed) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve, reject) => {
              pending.push({ resolve, reject });
            });
          },
        };
      },
    },
  };
};

const sharedHandle = makeMockHandle();
let providerOverride: TtsProvider | null = null;

vi.mock("@/shared/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/providers")>();
  return {
    ...actual,
    getTtsProvider: () =>
      providerOverride ?? {
        id: "aliyun-qwen-realtime" as const,
        openStream: async (_req: TtsStreamRequest) => {
          void _req;
          return sharedHandle;
        },
      },
  };
});

const { POST } = await import("@/app/api/tts/route");

describe("/api/tts route", () => {
  it("400 当 body 校验失败", async () => {
    providerOverride = null;
    const res = await POST(
      new Request("http://x/api/tts", {
        method: "POST",
        body: JSON.stringify({ text: "" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("BAD_REQUEST");
  });

  it("503 当 provider 未配置", async () => {
    providerOverride = {
      id: "null",
      openStream: async () => {
        throw new Error("nope");
      },
    };
    const res = await POST(
      new Request("http://x/api/tts", {
        method: "POST",
        body: JSON.stringify({ text: "画一个圆" }),
      }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("TTS_NOT_CONFIGURED");
  });

  it("成功路径: 流回 PCM 二进制 + 合并所有帧", async () => {
    providerOverride = null;
    const handle = sharedHandle;
    handle.appended.length = 0;

    const resPromise = POST(
      new Request("http://x/api/tts", {
        method: "POST",
        body: JSON.stringify({ text: "画一个圆", voiceId: "Cherry" }),
      }),
    );

    // 等路由进到 ReadableStream.start, 推几帧再关
    queueMicrotask(() => {
      handle.pushFrame([0x10, 0x20, 0x30]);
      handle.pushFrame([0x40, 0x50]);
      handle.endFrames();
    });

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("X-Tts-Sample-Rate")).toBe("24000");

    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual([0x10, 0x20, 0x30, 0x40, 0x50]);
    expect(handle.appended).toEqual(["画一个圆"]);
    expect(handle.finished).toBe(true);
  });
});
