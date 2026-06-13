import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";
import { streamDrawTool } from "@/shared/providers/llm";

import { buildIronWallPrompt } from "./ironWallPrompt";

export const runtime = "nodejs";

const requestSchema = z.object({
  utterance: z.string().min(1).max(500),
  activeStyleId: z.string().min(1),
  /**
   * 当前画布已有的 shape 列表 — 让 LLM 知道哪些 id 可被 modify/delete。
   * 完整坐标 + 属性 = LLM 的"位置感知"。
   */
  existingShapes: z
    .array(
      z.object({
        id: z.string(),
        shape: z.string(),
        size: z.number(),
        position: z.object({ x: z.number(), y: z.number() }),
        useAccentColor: z.boolean().optional(),
      }),
    )
    .optional(),
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

  const activeStyle = getStyleById(
    (parsed.data.activeStyleId as StyleId) ?? DEFAULT_STYLE_ID,
  );

  const canvasState =
    parsed.data.existingShapes && parsed.data.existingShapes.length > 0
      ? JSON.stringify(parsed.data.existingShapes, null, 2)
      : undefined;

  return streamDrawTool({
    systemPrompt: buildIronWallPrompt(activeStyle),
    userUtterance: parsed.data.utterance,
    canvasState,
    temperature: 0,
  });
}
