import { NextResponse } from "next/server";

/**
 * 健康检查端点 — Docker / k8s liveness probe 与 CI 部署后回归检测都用这个。
 * 必须保持极简: 只要进程能响应 HTTP 就算活, 不依赖任何外部服务。
 */
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
