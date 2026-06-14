import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";
import { streamDrawTool } from "@/shared/providers/llm";

import { buildCanvasState } from "./canvasState";
import { buildDirectorPrompt } from "./directorPrompt";

export const runtime = "nodejs";

const HISTORY_MAX_TURNS = 5;
const CHART_XML_MAX_BYTES = 80_000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2_000),
});

const requestSchema = z.object({
  utterance: z.string().min(1).max(500),
  activeStyleId: z.string().min(1),
  /**
   * 最近 N 轮历史 (user + assistant narration), 不含本轮 utterance。
   * 客户端 orchestrator 从 turns 里拼; 服务端只做长度截断。
   */
  history: z.array(messageSchema).max(HISTORY_MAX_TURNS * 2).optional(),
  /**
   * 当前 mxfile XML — LLM 调 drawio.edit_diagram 时用来引用真实 cell_id。
   * 没有它 LLM 只能整张重画 (display_diagram), 局部编辑无从谈起。
   */
  chartXML: z.string().max(CHART_XML_MAX_BYTES).optional(),
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

  const canvasState = buildCanvasState(parsed.data);

  return streamDrawTool({
    systemPrompt: buildDirectorPrompt(activeStyle),
    userUtterance: parsed.data.utterance,
    canvasState,
    history: parsed.data.history,
    temperature: 0,
  });
}
