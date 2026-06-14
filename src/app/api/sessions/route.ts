import { NextResponse } from "next/server";
import { z } from "zod";

import { allocateSessionId } from "@/shared/db/idAllocator";
import {
  createSession,
  ensureDefaultSession,
  listSessions,
} from "@/shared/db/sessionRepo";

export const runtime = "nodejs";

const createBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

const respondError = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, code, message, data: null }, { status });

const respondOk = <T>(data: T) =>
  NextResponse.json({ success: true, data });

/**
 * GET /api/sessions — 列表 (DESC by updated_at)
 *
 * 空库时调 ensureDefaultSession 自动创建首会话, 保证前端永远不显示空状态。
 */
export async function GET(): Promise<Response> {
  try {
    ensureDefaultSession(allocateSessionId);
    const sessions = listSessions();
    return respondOk(sessions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "list failed";
    return respondError("DB_ERROR", msg, 500);
  }
}

/**
 * POST /api/sessions — 新建会话
 *
 * body: { title?: string }
 * 默认 title: "Untitled · YYYY-MM-DD"
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    return respondError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }

  const parsed = createBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return respondError("INVALID_PAYLOAD", parsed.error.message, 422);
  }

  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const title = parsed.data.title?.trim() || `Untitled · ${dateStr}`;
    const session = createSession({ id: allocateSessionId(), title });
    return respondOk(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "create failed";
    return respondError("DB_ERROR", msg, 500);
  }
}
