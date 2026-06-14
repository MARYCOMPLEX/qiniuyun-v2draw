import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteSession,
  getSessionWithTurns,
  renameSession,
  updateChartXML,
} from "@/shared/db/sessionRepo";

export const runtime = "nodejs";

const CHART_XML_MAX_BYTES = 80_000;

const patchBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  chartXML: z.string().max(CHART_XML_MAX_BYTES).optional(),
});

const respondError = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, code, message, data: null }, { status });

const respondOk = <T>(data: T) =>
  NextResponse.json({ success: true, data });

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sessions/[id] — 单个会话 + turns
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const session = getSessionWithTurns(id);
    if (!session) return respondError("NOT_FOUND", "会话不存在", 404);
    return respondOk(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return respondError("DB_ERROR", msg, 500);
  }
}

/**
 * PATCH /api/sessions/[id] — 改 title 或 chartXML
 *
 * body: { title?, chartXML? } — 字段都可选, 至少给一个
 */
export async function PATCH(req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respondError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return respondError("INVALID_PAYLOAD", parsed.error.message, 422);
  }
  if (parsed.data.title === undefined && parsed.data.chartXML === undefined) {
    return respondError("INVALID_PAYLOAD", "至少提供 title 或 chartXML", 422);
  }

  try {
    if (parsed.data.title !== undefined) renameSession(id, parsed.data.title);
    if (parsed.data.chartXML !== undefined) updateChartXML(id, parsed.data.chartXML);
    return respondOk({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "update failed";
    return respondError("DB_ERROR", msg, 500);
  }
}

/**
 * DELETE /api/sessions/[id] — 删除会话 (FK CASCADE 自动删 turns)
 */
export async function DELETE(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  try {
    deleteSession(id);
    return respondOk({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "delete failed";
    return respondError("DB_ERROR", msg, 500);
  }
}
