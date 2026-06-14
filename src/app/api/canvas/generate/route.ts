import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createJob,
  updateJob,
  type ImageJob,
} from "@/shared/providers/image/job-store";
import { buildOpenAICompatibleImageFromEnv } from "@/shared/providers/image/openai-compatible";

/**
 * 异步生图入口 — POST /api/canvas/generate
 *
 * 设计: LLM 决策阶段已经返回 placeholder + jobId, 此路由仅启动异步任务,
 * 立即返回 jobId, 真正的进度通过 SSE (/api/canvas/jobs/stream) 推送。
 *
 * Why nodejs runtime: openai SDK 用 node:http
 */
export const runtime = "nodejs";

const requestSchema = z.object({
  /** 关联的前端 placeholder layer id */
  layerId: z.string().min(1),
  /** 工具名 (canvas.generate_image / canvas.edit_image / ...) — 用于 job.tool 字段 */
  tool: z.string().min(1),
  /** 文生图 prompt */
  prompt: z.string().min(1).max(2000),
  negativePrompt: z.string().max(1000).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  /** 模型覆盖 (默认用 IMAGE2_MODEL env) */
  modelId: z.string().optional(),
});

const respondError = (code: string, message: string, status: number): NextResponse =>
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

  const job = createJob({
    tool: parsed.data.tool,
    prompt: parsed.data.prompt,
    layerId: parsed.data.layerId,
  });

  // 异步执行 (不 await), 立即返回 jobId
  void runGenerationAsync(job, parsed.data);

  return NextResponse.json({
    success: true,
    data: { jobId: job.id, status: job.status },
  });
}

async function runGenerationAsync(
  job: ImageJob,
  params: z.infer<typeof requestSchema>,
): Promise<void> {
  updateJob(job.id, { status: "generating", progress: 0.1 });

  const provider = buildOpenAICompatibleImageFromEnv();
  try {
    const result = await provider.generate({
      prompt: params.prompt,
      width: params.width,
      height: params.height,
      recipe: params.modelId ? { modelId: params.modelId } : undefined,
    });

    updateJob(job.id, {
      status: "done",
      progress: 1,
      result: {
        imageUrl: result.url,
        thumbnailUrl: result.url,
        modelId: params.modelId ?? process.env.IMAGE2_MODEL ?? "unknown",
      },
      completedAt: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生图失败";
    console.warn(`[canvas/generate] job=${job.id} failed:`, message);
    updateJob(job.id, {
      status: "failed",
      error: message,
      completedAt: Date.now(),
    });
  }
}
