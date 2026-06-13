"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Viewport } from "@/shared/types/layer";
import { DEFAULT_VIEWPORT } from "@/shared/types/layer";

/**
 * 无限画布视口控制 hook。
 *
 * 提供:
 * - 滚轮缩放 (鼠标位置为锚点, 0.1 - 4.0 范围)
 * - 空格 + 拖拽 / 中键拖拽 平移
 * - 双击空白 fit (zoom 1, pan 居中)
 * - actual (zoom 1, pan 0)
 *
 * 见 docs/protocols/multimodal-canvas.md §7.1。
 */

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.1;

interface UseViewportOptions {
  readonly initialViewport?: Viewport;
}

interface UseViewportResult {
  readonly viewport: Viewport;
  readonly isPanning: boolean;
  readonly attach: (el: HTMLElement | null) => void;
  readonly setViewport: (v: Viewport) => void;
  readonly zoomBy: (delta: number, anchor?: { x: number; y: number }) => void;
  readonly fit: () => void;
  readonly actual: () => void;
  readonly panBy: (dx: number, dy: number) => void;
}

export function useViewport(options: UseViewportOptions = {}): UseViewportResult {
  const [viewport, setViewportState] = useState<Viewport>(
    options.initialViewport ?? DEFAULT_VIEWPORT,
  );
  const [isPanning, setIsPanning] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const setViewport = useCallback((v: Viewport): void => {
    setViewportState(v);
  }, []);

  const zoomBy = useCallback(
    (delta: number, anchor?: { x: number; y: number }): void => {
      setViewportState((prev) => {
        const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom + delta));
        if (newZoom === prev.zoom) return prev;
        // 围绕 anchor 缩放: 保持 anchor 在屏幕上的位置不变
        if (!anchor) return { ...prev, zoom: newZoom };
        const ratio = newZoom / prev.zoom;
        return {
          zoom: newZoom,
          pan: {
            x: anchor.x - (anchor.x - prev.pan.x) * ratio,
            y: anchor.y - (anchor.y - prev.pan.y) * ratio,
          },
        };
      });
    },
    [],
  );

  const fit = useCallback((): void => {
    setViewportState({ pan: { x: 0, y: 0 }, zoom: 1 });
  }, []);

  const actual = useCallback((): void => {
    setViewportState({ pan: { x: 0, y: 0 }, zoom: 1 });
  }, []);

  const panBy = useCallback((dx: number, dy: number): void => {
    setViewportState((prev) => ({
      ...prev,
      pan: { x: prev.pan.x + dx, y: prev.pan.y + dy },
    }));
  }, []);

  /**
   * attach 函数 — 用 ref callback 形式给 InfiniteStage 容器绑定事件。
   * 自动清理旧 listeners 当容器换了。
   */
  const attach = useCallback((el: HTMLElement | null): void => {
    if (elRef.current === el) return;
    elRef.current = el;
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let spaceDown = false;
    let dragStart: { x: number; y: number } | null = null;
    let dragStartPan: { x: number; y: number } | null = null;

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const delta = -e.deltaY * 0.001 * ZOOM_STEP * 5;
      zoomBy(delta, anchor);
    };

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 1 && !(e.button === 0 && spaceDown)) return;
      e.preventDefault();
      dragStart = { x: e.clientX, y: e.clientY };
      dragStartPan = { ...viewportRef.current.pan };
      setIsPanning(true);
    };

    const onMouseMove = (e: MouseEvent): void => {
      if (!dragStart || !dragStartPan) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setViewportState({
        ...viewportRef.current,
        pan: { x: dragStartPan.x + dx, y: dragStartPan.y + dy },
      });
    };

    const onMouseUp = (): void => {
      dragStart = null;
      dragStartPan = null;
      setIsPanning(false);
    };

    const onDblClick = (e: MouseEvent): void => {
      if (e.target !== el) return; // 双击空白才 fit, 双击 layer 不触发
      fit();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === "Space") spaceDown = true;
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === "Space") spaceDown = false;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("dblclick", onDblClick);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [zoomBy, fit]);

  return { viewport, isPanning, attach, setViewport, zoomBy, fit, actual, panBy };
}
