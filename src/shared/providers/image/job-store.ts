/**
 * 内存版异步生图任务存储 — 单实例 Next.js dev 够用, 生产可换 Redis。
 *
 * Why: GENERATE/EDIT/INPAINT 等异步工具调用阿里/openai 生图 API 会耗 5-30 秒,
 * 不能阻塞 LLM 决策响应。LLM 立即返回带 jobId 的 placeholder 命令,
 * 前端通过 SSE 订阅 job 状态, 任务真正完成时再渲染图像。
 *
 * 设计: 模块级 Map + 事件总线 (Node EventEmitter), 简单可靠。
 * 用 globalThis 防止 Next.js dev HMR 重建 module 时丢任务。
 */

import { EventEmitter } from "node:events";

export type JobStatus = "queued" | "generating" | "done" | "failed";

export interface ImageJob {
  id: string;
  /** 触发该 job 的工具名 (canvas.generate_image / edit / inpaint / ...) */
  tool: string;
  status: JobStatus;
  progress: number; // 0-1
  prompt: string;
  /** 关联的 placeholder layer id (前端创建占位时分配) */
  layerId: string;
  result?: {
    imageUrl: string;
    thumbnailUrl: string;
    seed?: number;
    modelId: string;
  };
  error?: string;
  startedAt: number;
  completedAt: number | null;
}

export interface JobEvent {
  type: "job-progress" | "job-done" | "job-failed";
  job: ImageJob;
}

interface JobStoreSingleton {
  jobs: Map<string, ImageJob>;
  emitter: EventEmitter;
}

const globalForJobStore = globalThis as unknown as {
  __imageJobStore?: JobStoreSingleton;
};

const getStore = (): JobStoreSingleton => {
  if (!globalForJobStore.__imageJobStore) {
    globalForJobStore.__imageJobStore = {
      jobs: new Map(),
      emitter: new EventEmitter(),
    };
    // 默认监听者很多, 提高上限避免 warning
    globalForJobStore.__imageJobStore.emitter.setMaxListeners(50);
  }
  return globalForJobStore.__imageJobStore;
};

let counter = 0;
const allocateJobId = (): string => {
  counter += 1;
  return `j-${Date.now().toString(36)}-${counter}`;
};

export const createJob = (params: {
  tool: string;
  prompt: string;
  layerId: string;
}): ImageJob => {
  const job: ImageJob = {
    id: allocateJobId(),
    tool: params.tool,
    status: "queued",
    progress: 0,
    prompt: params.prompt,
    layerId: params.layerId,
    startedAt: Date.now(),
    completedAt: null,
  };
  getStore().jobs.set(job.id, job);
  return job;
};

export const getJob = (id: string): ImageJob | undefined =>
  getStore().jobs.get(id);

export const updateJob = (
  id: string,
  patch: Partial<Omit<ImageJob, "id">>,
): ImageJob | undefined => {
  const store = getStore();
  const existing = store.jobs.get(id);
  if (!existing) return undefined;
  const next: ImageJob = { ...existing, ...patch };
  store.jobs.set(id, next);
  const eventType: JobEvent["type"] =
    next.status === "done"
      ? "job-done"
      : next.status === "failed"
        ? "job-failed"
        : "job-progress";
  store.emitter.emit("event", { type: eventType, job: next } satisfies JobEvent);
  return next;
};

export const subscribeJobEvents = (handler: (e: JobEvent) => void): (() => void) => {
  const store = getStore();
  store.emitter.on("event", handler);
  return () => {
    store.emitter.off("event", handler);
  };
};

export const listActiveJobs = (): ImageJob[] =>
  Array.from(getStore().jobs.values()).filter(
    (j) => j.status === "queued" || j.status === "generating",
  );

/**
 * 清理已完成 5 分钟以上的 job (避免内存泄漏)。
 * 由 SSE 路由在每次连接时调用一次, 不需要单独定时器。
 */
export const cleanupOldJobs = (olderThanMs: number = 5 * 60 * 1000): void => {
  const cutoff = Date.now() - olderThanMs;
  const store = getStore();
  for (const [id, job] of store.jobs) {
    if (job.completedAt !== null && job.completedAt < cutoff) {
      store.jobs.delete(id);
    }
  }
};
