import { NextResponse } from "next/server";
import { z } from "zod";

import { getTtsProvider } from "@/shared/providers";

/**
 * POST /api/tts — narration 文本流式合成反向代理
 *
 * Why: 浏览器端原生 WebSocket 不支持自定义 Authorization header,
 * 直连 DashScope wss 端点会鉴权失败; 同时 OPENAI_API_KEY 也不能漏给前端。
 * 服务端持 key 接 ws, 前端拿 PCM 帧二进制流即可。
 *
 * 请求: { text: string, voiceId?: string }
 *   - text 一般是 LLM narration (≤30 字), 一次性传; 不做前端→后端的流式 append。
 *
 * 响应:
 *   - Content-Type: application/octet-stream
 *   - Body: 连续的 PCM 24kHz mono 16-bit little-endian 二进制流, 边收边播。
 *   - 异常: 400 (zod 校验) / 503 (provider 未就绪) / 500 (上游异常), 信封同其他路由。
 */
export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string().min(1).max(500),
  voiceId: z.string().optional(),
});

const respondError = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, code, message, data: null }, { status });

export async function POST(req: Request) {
  let payload: z.infer<typeof requestSchema>;
  try {
    const json = await req.json();
    payload = requestSchema.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid body";
    return respondError("BAD_REQUEST", message, 400);
  }

  const provider = getTtsProvider();
  if (provider.id === "null") {
    return respondError(
      "TTS_NOT_CONFIGURED",
      "TTS Provider 未配置，前端开关应已置灰",
      503,
    );
  }

  // 把 abort 信号串到 provider, 让客户端断开能立即收回 ws
  const upstreamAbort = new AbortController();
  req.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });

  let handle: Awaited<ReturnType<typeof provider.openStream>>;
  try {
    handle = await provider.openStream({
      voiceId: payload.voiceId,
      signal: upstreamAbort.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "open stream failed";
    return respondError("TTS_OPEN_FAILED", message, 500);
  }

  // 拿到 handle 后立即推文本 + 触发 finish, 让服务端开始合成
  handle.appendText(payload.text);
  // finish 是 fire-and-forget — 阿里云会在 finish 后流回剩余音频, 我们用 frames 迭代消费
  handle.finish().catch(() => {
    // finish 异常不阻塞响应, frames 会单独抛错
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const frame of handle.frames) {
          controller.enqueue(frame.pcm);
        }
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "tts stream failed";
        // PCM 流中途无法插结构化错误, 只能 controller.error 让前端 reader.read() 抛
        controller.error(new Error(message));
      } finally {
        handle.abort();
      }
    },
    cancel() {
      handle.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Tts-Sample-Rate": "24000",
      "X-Tts-Format": "pcm-s16le-mono",
      "Cache-Control": "no-store",
    },
  });
}
