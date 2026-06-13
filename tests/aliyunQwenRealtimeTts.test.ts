import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createAliyunQwenRealtimeTts } from "@/shared/providers/tts/aliyun-qwen-realtime";

/**
 * Mock WebSocket — 实现 ws 库 (服务端) 的最小子集:
 *   .on(event, handler)
 *   .send(payload)
 *   .close()
 * 通过 emitMessage / emitClose 等方法手工驱动事件触发。
 */
class MockWS extends EventEmitter {
  public readonly sent: string[] = [];
  public closed = false;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit("close");
  }

  emitMessage(obj: object): void {
    this.emit("message", Buffer.from(JSON.stringify(obj)));
  }
}

const makeImpl = () => {
  const instances: MockWS[] = [];
  const Impl = vi.fn(() => {
    const ws = new MockWS();
    instances.push(ws);
    queueMicrotask(() => ws.emit("open"));
    return ws;
  });
  return { Impl: Impl as unknown as typeof import("ws").WebSocket, instances };
};

describe("aliyun-qwen-realtime TTS provider", () => {
  it("openStream 在 session.updated 后 resolve, 并发送 session.update", async () => {
    const { Impl, instances } = makeImpl();
    const provider = createAliyunQwenRealtimeTts({
      apiKey: "sk-test",
      voice: "Cherry",
      webSocketImpl: Impl,
    });

    const handlePromise = provider.openStream({});
    // 等 ws.open 触发 → session.update 发出
    await new Promise((r) => setTimeout(r, 0));
    const ws = instances[0]!;
    expect(ws.sent).toHaveLength(1);
    const msg = JSON.parse(ws.sent[0]!);
    expect(msg.type).toBe("session.update");
    expect(msg.session.voice).toBe("Cherry");
    expect(msg.session.mode).toBe("server_commit");

    ws.emitMessage({ type: "session.created", session: { id: "s1" } });
    ws.emitMessage({ type: "session.updated" });
    const handle = await handlePromise;
    expect(typeof handle.appendText).toBe("function");
  });

  it("response.audio.delta 解码 base64 PCM 并通过 frames 流出", async () => {
    const { Impl, instances } = makeImpl();
    const provider = createAliyunQwenRealtimeTts({
      apiKey: "sk-test",
      webSocketImpl: Impl,
    });

    const handlePromise = provider.openStream({});
    await new Promise((r) => setTimeout(r, 0));
    const ws = instances[0]!;
    ws.emitMessage({ type: "session.updated" });
    const handle = await handlePromise;

    const pcmBytes = new Uint8Array([1, 2, 3, 4]);
    const b64 = Buffer.from(pcmBytes).toString("base64");
    ws.emitMessage({ type: "response.audio.delta", delta: b64 });

    const iter = handle.frames[Symbol.asyncIterator]();
    queueMicrotask(() => {
      ws.emitMessage({ type: "session.finished" });
    });
    const first = await iter.next();
    expect(first.done).toBe(false);
    expect(Array.from(first.value!.pcm)).toEqual([1, 2, 3, 4]);
    expect(first.value!.sampleRate).toBe(24000);

    const second = await iter.next();
    expect(second.done).toBe(true);
  });

  it("appendText 发送 input_text_buffer.append 事件", async () => {
    const { Impl, instances } = makeImpl();
    const provider = createAliyunQwenRealtimeTts({
      apiKey: "sk-test",
      webSocketImpl: Impl,
    });

    const handlePromise = provider.openStream({});
    await new Promise((r) => setTimeout(r, 0));
    const ws = instances[0]!;
    ws.emitMessage({ type: "session.updated" });
    const handle = await handlePromise;

    handle.appendText("画一个圆");
    const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]!);
    expect(lastSent.type).toBe("input_text_buffer.append");
    expect(lastSent.text).toBe("画一个圆");
  });

  it("error 事件在 session.updated 之前抛出, 让 openStream reject", async () => {
    const { Impl, instances } = makeImpl();
    const provider = createAliyunQwenRealtimeTts({
      apiKey: "sk-test",
      webSocketImpl: Impl,
    });

    const handlePromise = provider.openStream({});
    await new Promise((r) => setTimeout(r, 0));
    const ws = instances[0]!;
    ws.emitMessage({ type: "error", error: { message: "auth failed" } });

    await expect(handlePromise).rejects.toThrow(/auth failed/);
  });

  it("AbortSignal 触发会关闭 ws 并让 frames 抛 TTS_ABORTED", async () => {
    const { Impl, instances } = makeImpl();
    const provider = createAliyunQwenRealtimeTts({
      apiKey: "sk-test",
      webSocketImpl: Impl,
    });

    const controller = new AbortController();
    const handlePromise = provider.openStream({ signal: controller.signal });
    await new Promise((r) => setTimeout(r, 0));
    const ws = instances[0]!;
    ws.emitMessage({ type: "session.updated" });
    const handle = await handlePromise;

    controller.abort();
    expect(ws.closed).toBe(true);
    const iter = handle.frames[Symbol.asyncIterator]();
    await expect(iter.next()).rejects.toThrow(/TTS_ABORTED/);
  });
});
