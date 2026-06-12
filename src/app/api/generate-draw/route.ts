import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";

import { drawToolSchema } from "@/shared/types/schema";
import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";
import { buildIronWallPrompt } from "./ironWallPrompt";

export const runtime = "edge";

const requestSchema = z.object({
  utterance: z.string().min(1).max(500),
  activeStyleId: z.string().min(1),
});

const respondError = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, code, message, data: null }, { status });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respondError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return respondError("INVALID_PAYLOAD", parsed.error.message, 422);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return respondError(
      "MISSING_API_KEY",
      "服务端未配置 OPENAI_API_KEY，请使用前端内置模拟器",
      503,
    );
  }

  const activeStyle = getStyleById(
    (parsed.data.activeStyleId as StyleId) ?? DEFAULT_STYLE_ID,
  );

  const openai = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  });

  const result = streamObject({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    schema: drawToolSchema,
    system: buildIronWallPrompt(activeStyle),
    prompt: parsed.data.utterance,
    temperature: 0,
  });

  return result.toTextStreamResponse();
}
