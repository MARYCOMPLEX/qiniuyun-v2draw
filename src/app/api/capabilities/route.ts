import { NextResponse } from "next/server";

import { detectCapabilities } from "@/shared/providers";

export const runtime = "nodejs";

/**
 * GET /api/capabilities — 暴露当前真实就绪的能力矩阵。
 * Why: 前端启动时拉一次，UI 据此决定每个开关的可见/可点状态，
 * 不可在客户端直接读 process.env（Next 仅 NEXT_PUBLIC_ 前缀对客户端可见）。
 */
export async function GET() {
  const capabilities = detectCapabilities();
  return NextResponse.json({ success: true, data: capabilities });
}
