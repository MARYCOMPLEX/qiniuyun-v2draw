import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";
import { getLlmProviderForRoute, type LlmToolRoute } from "@/shared/providers";
import { drawToolSchema } from "@/shared/types/schema";

import { buildIronWallPrompt } from "./ironWallPrompt";

export const runtime = "edge";

/**
 * toolHint — 客户端可显式声明本次请求倾向触发的 toolType,
 * 路由层据此走不同 (provider, model) 二元组。
 * Why: 模型还没吐出 toolType, 但客户端往往知道意图 (画几何 vs 生图 vs 搜索),
 * 用 hint 即可在请求阶段做工具维度路由, 无需等流式开始再切模型。
 */
const requestSchema = z.object({
  utterance: z.string().min(1).max(500),
  activeStyleId: z.string().min(1),
  toolHint: z
    .enum(["atomic-shape", "diffusion-melt", "web-search", "default"])
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

  const route: LlmToolRoute = parsed.data.toolHint ?? "default";
  const { provider, model } = getLlmProviderForRoute(route);
  const activeStyle = getStyleById(
    (parsed.data.activeStyleId as StyleId) ?? DEFAULT_STYLE_ID,
  );

  return provider
    .streamDrawTool({
      systemPrompt: buildIronWallPrompt(activeStyle),
      userUtterance: parsed.data.utterance,
      schema: drawToolSchema,
      model,
      temperature: 0,
    })
    .toTextStreamResponse();
}
