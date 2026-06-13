import { NextResponse } from "next/server";

import { getJob } from "@/shared/providers/image/job-store";

/**
 * 单 job 状态查询 — GET /api/canvas/jobs/[id]
 *
 * 用途:
 * - SSE 断线后前端用这个 fallback 一次性查询
 * - 调试 / 错误诊断
 */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json(
      { success: false, code: "JOB_NOT_FOUND", message: "Job 不存在或已清理" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: job });
}
