"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ImageLayer, MaskPolygon } from "@/shared/types/layer";

/**
 * Mask 套索工具 hook — 在选中 layer 上画自由多边形选区。
 *
 * 状态:
 * - idle: 未激活
 * - drawing: 鼠标按下开始画, 移动累积点, 抬起完成
 * - ready: polygon 完成, 等用户输入 inpaint prompt
 *
 * 坐标系: polygon 点是 layer 内部坐标 (左上 0,0), 不是世界坐标。
 * 这样 layer 移动后 mask 仍然贴合图像。
 */

export type MaskToolMode = "idle" | "drawing" | "ready";

interface MaskToolState {
  readonly mode: MaskToolMode;
  readonly currentPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly targetLayerId: string | null;
}

interface UseMaskToolResult {
  readonly state: MaskToolState;
  /** 进入选区模式 — 双击 layer 时调 */
  readonly activate: (targetLayerId: string) => void;
  /** 取消并清空 */
  readonly cancel: () => void;
  /** 提交 polygon — 上层调 inpaint */
  readonly commit: () => MaskPolygon | null;
  /** ref callback 给 layer 容器, 接管鼠标事件 */
  readonly attach: (el: HTMLElement | null, layer: ImageLayer | null) => void;
}

const MIN_POINTS = 3;
const MIN_MOVE_DIST = 4; // 鼠标至少移动 4px 才记新点 (减少冗余)

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function useMaskTool(): UseMaskToolResult {
  const [state, setState] = useState<MaskToolState>({
    mode: "idle",
    currentPoints: [],
    targetLayerId: null,
  });

  const elRef = useRef<HTMLElement | null>(null);
  const layerRef = useRef<ImageLayer | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);

  const activate = useCallback((targetLayerId: string): void => {
    setState({ mode: "drawing", currentPoints: [], targetLayerId });
    pointsRef.current = [];
  }, []);

  const cancel = useCallback((): void => {
    drawingRef.current = false;
    pointsRef.current = [];
    setState({ mode: "idle", currentPoints: [], targetLayerId: null });
  }, []);

  const commit = useCallback((): MaskPolygon | null => {
    const pts = pointsRef.current;
    if (pts.length < MIN_POINTS) return null;
    const polygon = pts.slice();
    pointsRef.current = [];
    setState({ mode: "idle", currentPoints: [], targetLayerId: null });
    return { polygon };
  }, []);

  const attach = useCallback((el: HTMLElement | null, layer: ImageLayer | null): void => {
    elRef.current = el;
    layerRef.current = layer;
  }, []);

  useEffect(() => {
    const el = elRef.current;
    const layer = layerRef.current;
    if (!el || !layer) return;
    if (state.mode !== "drawing" && state.mode !== "ready") return;

    const onMouseDown = (e: MouseEvent): void => {
      if (state.mode !== "drawing") return;
      e.preventDefault();
      e.stopPropagation();
      drawingRef.current = true;
      const rect = el.getBoundingClientRect();
      const local = {
        x: ((e.clientX - rect.left) / rect.width) * layer.size.width,
        y: ((e.clientY - rect.top) / rect.height) * layer.size.height,
      };
      pointsRef.current = [local];
      setState((prev) => ({ ...prev, currentPoints: [local] }));
    };

    const onMouseMove = (e: MouseEvent): void => {
      if (!drawingRef.current) return;
      const rect = el.getBoundingClientRect();
      const local = {
        x: ((e.clientX - rect.left) / rect.width) * layer.size.width,
        y: ((e.clientY - rect.top) / rect.height) * layer.size.height,
      };
      const last = pointsRef.current[pointsRef.current.length - 1];
      if (!last || distance(local, last) > MIN_MOVE_DIST) {
        pointsRef.current = [...pointsRef.current, local];
        setState((prev) => ({ ...prev, currentPoints: pointsRef.current.slice() }));
      }
    };

    const onMouseUp = (): void => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (pointsRef.current.length >= MIN_POINTS) {
        setState((prev) => ({ ...prev, mode: "ready" }));
      }
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [state.mode]);

  return { state, activate, cancel, commit, attach };
}
