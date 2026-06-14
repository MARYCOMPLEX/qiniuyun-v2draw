"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { DrawIoEmbedRef } from "react-drawio";

import { isRealDiagram } from "../utils/mxCellUtils";

/**
 * DiagramContext — drawio iframe 状态共享层。精简自 next-ai-draw-io/contexts/diagram-context.tsx (Apache-2.0)。
 *
 * 数据载体: chartXML 整张 mxfile XML, 替代旧 LayerMap。
 * 渲染层: react-drawio iframe (drawioRef.current.load / exportDiagram)。
 *
 * 核心契约:
 * - loadDiagram(xml): 灌 XML 进 iframe + 同步 chartXML state
 * - capturePng(): 异步导出 PNG dataURL (供 VLM 验证或截图反馈)
 * - exportSvg(): 异步导出 SVG (缩略图 / 历史快照)
 * - onDrawioLoad: iframe ready 信号 (page 用来加 loading 占位)
 *
 * 不抄: diagramHistory (用 conversation turn 替代), saveDialog (UX 暂不做), toast (用 platform error)。
 */

interface DiagramContextType {
  readonly chartXML: string;
  readonly latestSvg: string;
  readonly isDrawioReady: boolean;
  /** 灌 XML 进 iframe — 失败返回错误信息字符串, 成功返回 null */
  readonly loadDiagram: (xml: string) => string | null;
  /** 清空画布 */
  readonly clearDiagram: () => void;
  /** 导出 PNG dataURL (用于 VLM 视觉验证) */
  readonly capturePng: () => Promise<string | null>;
  /** 导出 SVG dataURL (用于历史快照) */
  readonly exportSvg: () => Promise<string | null>;
  /** drawio iframe 的 ref (传给 <DrawIoEmbed ref={drawioRef}>) */
  readonly drawioRef: MutableRefObject<DrawIoEmbedRef | null>;
  /** drawio iframe ready 回调 (传给 <DrawIoEmbed onLoad={onDrawioLoad}>) */
  readonly onDrawioLoad: () => void;
  /** drawio onAutoSave 回调 — 用户在 iframe 内手动改图时同步 chartXML */
  readonly handleDiagramAutoSave: (data: { xml?: string }) => void;
  /** drawio onExport 回调 — exportDiagram 触发时拿到 SVG/PNG dataURL */
  readonly handleDiagramExport: (data: { data?: string; format?: string }) => void;
}

const DiagramContext = createContext<DiagramContextType | undefined>(undefined);

const EXPORT_TIMEOUT_MS = 5_000;

export function DiagramProvider({ children }: { children: ReactNode }) {
  const [chartXML, setChartXML] = useState<string>("");
  const [latestSvg, setLatestSvg] = useState<string>("");
  const [isDrawioReady, setIsDrawioReady] = useState(false);

  const drawioRef = useRef<DrawIoEmbedRef | null>(null);
  const chartXMLRef = useRef<string>("");
  const hasCalledOnLoadRef = useRef(false);
  /** SVG 导出 promise resolver — react-drawio 的 export 是事件回调式, 这里包成 Promise */
  const svgResolverRef = useRef<((data: string) => void) | null>(null);
  const pngResolverRef = useRef<((data: string) => void) | null>(null);

  // 保持 ref 与 state 同步, 用于 iframe remount 时恢复
  useEffect(() => {
    chartXMLRef.current = chartXML;
  }, [chartXML]);

  const onDrawioLoad = useCallback((): void => {
    if (hasCalledOnLoadRef.current) return;
    hasCalledOnLoadRef.current = true;
    setIsDrawioReady(true);
    // iframe remount 后恢复
    if (drawioRef.current && isRealDiagram(chartXMLRef.current)) {
      drawioRef.current.load({ xml: chartXMLRef.current });
    }
  }, []);

  const loadDiagram = useCallback((xml: string): string | null => {
    if (!xml || !xml.trim()) return "XML 为空";
    setChartXML(xml);
    if (drawioRef.current) {
      try {
        drawioRef.current.load({ xml });
        return null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "drawio load 失败";
        console.warn("[DiagramContext] loadDiagram error:", msg);
        return msg;
      }
    }
    // iframe 未 ready, chartXMLRef 已经 set, ready 时会自动恢复
    return null;
  }, []);

  const clearDiagram = useCallback((): void => {
    setChartXML("");
    setLatestSvg("");
    if (drawioRef.current) {
      drawioRef.current.load({ xml: "" });
    }
  }, []);

  const capturePng = useCallback(async (): Promise<string | null> => {
    if (!drawioRef.current || !isRealDiagram(chartXMLRef.current)) return null;
    try {
      return await Promise.race<string>([
        new Promise<string>((resolve) => {
          pngResolverRef.current = resolve;
          drawioRef.current?.exportDiagram({ format: "png" });
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("PNG export timeout")), EXPORT_TIMEOUT_MS),
        ),
      ]);
    } catch {
      return null;
    }
  }, []);

  const exportSvg = useCallback(async (): Promise<string | null> => {
    if (!drawioRef.current || !isRealDiagram(chartXMLRef.current)) return null;
    try {
      const svg = await Promise.race<string>([
        new Promise<string>((resolve) => {
          svgResolverRef.current = resolve;
          drawioRef.current?.exportDiagram({ format: "xmlsvg" });
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("SVG export timeout")), EXPORT_TIMEOUT_MS),
        ),
      ]);
      if (svg?.includes("<svg")) {
        setLatestSvg(svg);
        return svg;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const handleDiagramAutoSave = useCallback((data: { xml?: string }): void => {
    if (data.xml && data.xml.trim()) {
      setChartXML(data.xml);
    }
  }, []);

  const handleDiagramExport = useCallback(
    (data: { data?: string; format?: string }): void => {
      if (!data.data) return;
      // PNG 走 pngResolverRef, SVG 走 svgResolverRef
      if (data.format === "png" && pngResolverRef.current) {
        pngResolverRef.current(data.data);
        pngResolverRef.current = null;
      } else if (svgResolverRef.current) {
        svgResolverRef.current(data.data);
        svgResolverRef.current = null;
      }
    },
    [],
  );

  const value: DiagramContextType = {
    chartXML,
    latestSvg,
    isDrawioReady,
    loadDiagram,
    clearDiagram,
    capturePng,
    exportSvg,
    drawioRef,
    onDrawioLoad,
    handleDiagramAutoSave,
    handleDiagramExport,
  };

  return <DiagramContext.Provider value={value}>{children}</DiagramContext.Provider>;
}

export function useDiagram(): DiagramContextType {
  const ctx = useContext(DiagramContext);
  if (!ctx) {
    throw new Error("useDiagram must be used inside <DiagramProvider>");
  }
  return ctx;
}
