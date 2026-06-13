import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  createJob,
  getJob,
  updateJob,
  subscribeJobEvents,
  listActiveJobs,
  cleanupOldJobs,
  type JobEvent,
} from "@/shared/providers/image/job-store";

describe("image job-store", () => {
  // 每个测试前清理 globalThis 状态
  beforeEach(() => {
    const g = globalThis as unknown as { __imageJobStore?: unknown };
    g.__imageJobStore = undefined;
  });

  afterEach(() => {
    const g = globalThis as unknown as { __imageJobStore?: unknown };
    g.__imageJobStore = undefined;
  });

  it("createJob 生成唯一 id 且初始状态 queued", () => {
    const job1 = createJob({ tool: "canvas.generate_image", prompt: "a fox", layerId: "l-1" });
    const job2 = createJob({ tool: "canvas.generate_image", prompt: "a cat", layerId: "l-2" });

    expect(job1.id).not.toBe(job2.id);
    expect(job1.status).toBe("queued");
    expect(job1.progress).toBe(0);
    expect(job1.layerId).toBe("l-1");
    expect(job1.completedAt).toBeNull();
  });

  it("getJob 能取到刚创建的 job", () => {
    const job = createJob({ tool: "canvas.generate_image", prompt: "x", layerId: "l-1" });
    const fetched = getJob(job.id);
    expect(fetched?.id).toBe(job.id);
  });

  it("getJob 不存在返回 undefined", () => {
    expect(getJob("non-existent")).toBeUndefined();
  });

  it("updateJob 状态流转 queued → generating → done", () => {
    const job = createJob({ tool: "canvas.generate_image", prompt: "x", layerId: "l-1" });

    const generating = updateJob(job.id, { status: "generating", progress: 0.5 });
    expect(generating?.status).toBe("generating");
    expect(generating?.progress).toBe(0.5);

    const done = updateJob(job.id, {
      status: "done",
      progress: 1,
      result: { imageUrl: "https://x.png", thumbnailUrl: "https://x.png", modelId: "gpt-image-1" },
      completedAt: Date.now(),
    });
    expect(done?.status).toBe("done");
    expect(done?.result?.imageUrl).toBe("https://x.png");
  });

  it("subscribeJobEvents 收到 progress 事件", () => {
    const events: JobEvent[] = [];
    const unsub = subscribeJobEvents((e) => events.push(e));

    const job = createJob({ tool: "canvas.generate_image", prompt: "x", layerId: "l-1" });
    updateJob(job.id, { status: "generating", progress: 0.3 });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("job-progress");

    unsub();
  });

  it("subscribeJobEvents 收到 done 事件", () => {
    const events: JobEvent[] = [];
    const unsub = subscribeJobEvents((e) => events.push(e));

    const job = createJob({ tool: "canvas.generate_image", prompt: "x", layerId: "l-1" });
    updateJob(job.id, {
      status: "done",
      progress: 1,
      result: { imageUrl: "https://x", thumbnailUrl: "https://x", modelId: "m" },
      completedAt: Date.now(),
    });

    expect(events.some((e) => e.type === "job-done")).toBe(true);
    unsub();
  });

  it("subscribeJobEvents 收到 failed 事件", () => {
    const events: JobEvent[] = [];
    const unsub = subscribeJobEvents((e) => events.push(e));

    const job = createJob({ tool: "canvas.generate_image", prompt: "x", layerId: "l-1" });
    updateJob(job.id, { status: "failed", error: "NSFW", completedAt: Date.now() });

    expect(events.some((e) => e.type === "job-failed")).toBe(true);
    unsub();
  });

  it("listActiveJobs 只返回 queued/generating", () => {
    const j1 = createJob({ tool: "x", prompt: "p1", layerId: "l-1" });
    const j2 = createJob({ tool: "x", prompt: "p2", layerId: "l-2" });
    const j3 = createJob({ tool: "x", prompt: "p3", layerId: "l-3" });
    updateJob(j1.id, { status: "generating", progress: 0.5 });
    updateJob(j2.id, { status: "done", completedAt: Date.now() });
    // j3 仍是 queued

    const active = listActiveJobs();
    expect(active.map((j) => j.id).sort()).toEqual([j1.id, j3.id].sort());
  });

  it("cleanupOldJobs 删除完成超过阈值的 job", () => {
    const j = createJob({ tool: "x", prompt: "p", layerId: "l-1" });
    // 标记为 6 分钟前完成
    updateJob(j.id, { status: "done", completedAt: Date.now() - 6 * 60 * 1000 });

    expect(getJob(j.id)).toBeDefined();
    cleanupOldJobs(5 * 60 * 1000);
    expect(getJob(j.id)).toBeUndefined();
  });

  it("cleanupOldJobs 不删未完成的 job", () => {
    const j = createJob({ tool: "x", prompt: "p", layerId: "l-1" });
    cleanupOldJobs(0);
    expect(getJob(j.id)).toBeDefined();
  });
});
