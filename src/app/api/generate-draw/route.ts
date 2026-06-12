import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";
import { getLlmProviderForRoute } from "@/shared/providers";
import { drawToolSchema } from "@/shared/types/schema";

import { buildIronWallPrompt } from "./ironWallPrompt";

export const runtime = "edge";

const requestSchema = z.object({
  utterance: z.string().min(1).max(500),
  activeStyleId: z.string().min(1),
  /**
   * 当前画布已有的 shape 列表 — 让 LLM 知道哪些 id 可被 modify/delete。
   * Why: 多轮对话需要 LLM 看到历史画布状态, 不然"再大一点"无法定位 targetId。
   */
  existingShapes: z
    .array(
      z.object({
        id: z.string(),
        shape: z.string(),
        size: z.number(),
        position: z.object({ x: z.number(), y: z.number() }),
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

  const { provider, model } = getLlmProviderForRoute("default");
  const activeStyle = getStyleById(
    (parsed.data.activeStyleId as StyleId) ?? DEFAULT_STYLE_ID,
  );

  const existingSummary =
    parsed.data.existingShapes && parsed.data.existingShapes.length > 0
      ? `\n\n# CURRENT CANVAS STATE\n${JSON.stringify(parsed.data.existingShapes, null, 2)}`
      : "\n\n# CURRENT CANVAS STATE\n(empty)";

  return provider
    .streamDrawTool({
      systemPrompt: buildIronWallPrompt(activeStyle) + existingSummary,
      userUtterance: parsed.data.utterance,
      schema: drawToolSchema,
      model,
      temperature: 0,
    })
    .toTextStreamResponse();
}
