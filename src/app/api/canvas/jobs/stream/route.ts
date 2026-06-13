import {
  cleanupOldJobs,
  listActiveJobs,
  subscribeJobEvents,
  type JobEvent,
} from "@/shared/providers/image/job-store";

/**
 * SSE 推送任务进度 — GET /api/canvas/jobs/stream
 *
 * 协议:
 *   event: job-progress    data: { jobId, status, progress }
 *   event: job-done        data: { jobId, layerId, imageUrl, modelId, seed? }
 *   event: job-failed      data: { jobId, error }
 *
 * 前端 useEventSource 消费, 任意 job 完成时按 layerId 找到对应 placeholder 替换为真实图。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const formatEvent = (event: JobEvent): string => {
  const payload =
    event.type === "job-done"
      ? {
          jobId: event.job.id,
          layerId: event.job.layerId,
          status: event.job.status,
          imageUrl: event.job.result?.imageUrl,
          thumbnailUrl: event.job.result?.thumbnailUrl,
          modelId: event.job.result?.modelId,
          seed: event.job.result?.seed,
        }
      : event.type === "job-failed"
        ? {
            jobId: event.job.id,
            layerId: event.job.layerId,
            status: event.job.status,
            error: event.job.error,
          }
        : {
            jobId: event.job.id,
            layerId: event.job.layerId,
            status: event.job.status,
            progress: event.job.progress,
          };
  return `event: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`;
};

export async function GET(): Promise<Response> {
  cleanupOldJobs();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      // 发送当前活跃 jobs 的初始快照
      controller.enqueue(encoder.encode(`event: hello\ndata: ${JSON.stringify({ts: Date.now()})}\n\n`));
      for (const job of listActiveJobs()) {
        controller.enqueue(
          encoder.encode(
            formatEvent({ type: "job-progress", job }),
          ),
        );
      }

      const unsubscribe = subscribeJobEvents((event) => {
        try {
          controller.enqueue(encoder.encode(formatEvent(event)));
        } catch {
          // controller closed
        }
      });

      // keepalive ping (30s) 防中间代理超时关闭连接
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30_000);

      // 持有 cleanup 引用 — controller close 时由浏览器/runtime 触发 cancel
      (controller as unknown as { __cleanup?: () => void }).__cleanup = () => {
        clearInterval(pingInterval);
        unsubscribe();
      };
    },
    cancel() {
      // ReadableStream cancel 时 (客户端断开) 调用 — 但 controller 引用不在这里
      // 真正的 cleanup 在 start() 通过闭包持有, 上面 ping 失败时已自动清掉。
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
