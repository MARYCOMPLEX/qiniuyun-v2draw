import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession, listTurns, upsertTurn } from "@/shared/db/sessionRepo";

export const runtime = "nodejs";

const actionSchema = z.object({
  tool: z.string().min(1).max(80),
  summary: z.string().min(1).max(200),
  status: z.enum(["pending", "running", "done", "failed"]),
  error: z.string().max(500).optional(),
  layerId: z.string().max(120).optional(),
});

const turnBodySchema = z.object({
  id: z.string().min(1).max(120),
  turnIndex: z.number().int().min(1).max(10_000),
  userUtterance: z.string().min(1).max(2_000),
  narration: z.string().max(2_000).nullable(),
  actions: z.array(actionSchema).max(50),
  status: z.enum(["streaming", "executing", "done", "failed"]),
});

const respondError = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, code, message, data: null }, { status });

const respondOk = <T>(data: T) =>
  NextResponse.json({ success: true, data });

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sessions/[id]/turns — 列表 (ASC by created_at)
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  try {
    if (!getSession(id)) return respondError("NOT_FOUND", "会话不存在", 404);
    return respondOk(listTurns(id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "list failed";
    return respondError("DB_ERROR", msg, 500);
  }
}

/**
 * POST /api/sessions/[id]/turns — upsert turn
 *
 * 同 turn id 多次 POST 会覆盖前次 (前端 streaming → executing → done 状态变迁)。
 * 父会话不存在 → 404。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const { id: sessionId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respondError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }

  const parsed = turnBodySchema.safeParse(body);
  if (!parsed.success) {
    return respondError("INVALID_PAYLOAD", parsed.error.message, 422);
  }

  try {
    if (!getSession(sessionId)) return respondError("NOT_FOUND", "会话不存在", 404);
    const turn = upsertTurn({
      ...parsed.data,
      sessionId,
    });
    return respondOk(turn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "upsert failed";
    return respondError("DB_ERROR", msg, 500);
  }
}
