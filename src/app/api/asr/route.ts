import { NextResponse } from "next/server";

import { getAsrProvider } from "@/shared/providers/asr/registry";

/**
 * ASR 转写路由 — 接收前端 PCM/WebM 录音 Blob, 返回识别文本。
 * Why: 阿里云 NLS SDK 依赖 ws / bufferutil 等 Node 原生模块,
 * 不能跑 edge runtime, 这里固定 nodejs。
 */
export const runtime = "nodejs";

const respondError = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, code, message, data: null }, { status });

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/")) {
    return respondError(
      "INVALID_CONTENT_TYPE",
      `期望 audio/* 内容类型, 实际为 "${contentType}"`,
      415,
    );
  }

  const audioBuffer = await request.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return respondError("EMPTY_AUDIO", "请求体音频数据为空", 400);
  }

  const provider = getAsrProvider();
  if (provider.id === "null") {
    return respondError(
      "ASR_NOT_CONFIGURED",
      "未配置 ASR Provider, 请在 .env.local 设置 ASR_PROVIDER",
      503,
    );
  }

  try {
    const audioBlob = new Blob([audioBuffer], { type: contentType });
    const result = await provider.transcribe({ audio: audioBlob });
    return NextResponse.json({
      success: true,
      data: { transcript: result.transcript, durationMs: result.durationMs },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "转写失败";
    return respondError("ASR_TRANSCRIBE_FAILED", message, 500);
  }
}
