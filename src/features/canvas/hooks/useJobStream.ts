"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SSE 客户端 hook — 订阅 /api/canvas/jobs/stream。
 *
 * 协议:
 *   event: hello              data: { ts }
 *   event: job-progress       data: { jobId, layerId, status, progress }
 *   event: job-done           data: { jobId, layerId, imageUrl, modelId, seed? }
 *   event: job-failed         data: { jobId, layerId, error }
 *
 * 见 docs/protocols/multimodal-canvas.md §5.2。
 */

export interface JobProgressEvent {
  jobId: string;
  layerId: string;
  status: "queued" | "generating";
  progress: number;
}

export interface JobDoneEvent {
  jobId: string;
  layerId: string;
  status: "done";
  imageUrl: string;
  thumbnailUrl?: string;
  modelId: string;
  seed?: number;
}

export interface JobFailedEvent {
  jobId: string;
  layerId: string;
  status: "failed";
  error: string;
}

export interface UseJobStreamHandlers {
  readonly onProgress?: (event: JobProgressEvent) => void;
  readonly onDone?: (event: JobDoneEvent) => void;
  readonly onFailed?: (event: JobFailedEvent) => void;
}

export interface UseJobStreamResult {
  readonly connected: boolean;
  readonly error: string | null;
}

/**
 * 用 EventSource 订阅 SSE, 自动重连 (浏览器内置)。
 * handlers 通过 ref 解耦, 不会因 handler 引用变化导致 SSE 断连。
 */
export function useJobStream(handlers: UseJobStreamHandlers): UseJobStreamResult {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const es = new EventSource("/api/canvas/jobs/stream");

    es.addEventListener("hello", () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener("job-progress", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as JobProgressEvent;
        handlersRef.current.onProgress?.(data);
      } catch (err) {
        console.warn("[useJobStream] progress parse error:", err);
      }
    });

    es.addEventListener("job-done", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as JobDoneEvent;
        handlersRef.current.onDone?.(data);
      } catch (err) {
        console.warn("[useJobStream] done parse error:", err);
      }
    });

    es.addEventListener("job-failed", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as JobFailedEvent;
        handlersRef.current.onFailed?.(data);
      } catch (err) {
        console.warn("[useJobStream] failed parse error:", err);
      }
    });

    es.onerror = () => {
      setConnected(false);
      setError("SSE 连接断开, 浏览器会自动重连");
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return { connected, error };
}
