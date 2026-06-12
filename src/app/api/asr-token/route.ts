import { NextResponse } from "next/server";

import { issueAliyunNlsToken } from "@/shared/providers/asr/aliyun-token";

/**
 * 阿里云 NLS 临时 Token 签发端点。
 * Why: 浏览器直连阿里云 ws 网关需要 token, 但 AccessKey 不能漏给前端。
 * 服务端用 RPC API 现签现发, 浏览器拿到 token 直接连 ws, 整个流式
 * 录制 + 识别在浏览器侧完成, 服务端零长连接负载。
 *
 * 安全策略:
 * - 默认有效期 6 小时 (阿里云上限 24 小时), 客户端在过期前 5 分钟自动 refresh
 * - 仅返回 token 和过期时间, 不返回 AccessKey 任何信息
 * - 生产环境应叠加用户登录态 + 配额检查防止盗刷
 */
export const runtime = "nodejs";

const respondError = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, code, message, data: null }, { status });

export async function POST() {
  try {
    const result = await issueAliyunNlsToken();
    return NextResponse.json({
      success: true,
      data: {
        token: result.token,
        expireAt: result.expireAt,
        appkey: result.appkey,
        wsUrl: result.wsUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "签发失败";
    return respondError("ALIYUN_TOKEN_ISSUE_FAILED", message, 500);
  }
}
