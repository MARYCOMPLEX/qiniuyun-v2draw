"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

/**
 * DiagramContext — chartXML 状态共享层。
 *
 * 自研 SVG 引擎下大幅简化:
 * - 数据载体: chartXML (整张 mxfile XML), 由 LLM 流式更新
 * - 渲染层: <MxCellSvgRenderer xml={chartXML}> 直接消费, 无 iframe
 * - 没有 ref / capture / export — 自研只读引擎暂时不需要 PNG 导出能力,
 *   chartXML 就是 SVG 渲染的输入, 序列化无成本 (后续要 PNG 再加 html2canvas)
 *
 * 接口契约:
 * - chartXML: 当前画布 XML 状态
 * - loadDiagram(xml): 灌新 XML; 失败返回错误信息字符串, 成功返回 null
 * - clearDiagram(): 清空画布
 */

interface DiagramContextType {
  readonly chartXML: string;
  readonly loadDiagram: (xml: string) => string | null;
  readonly clearDiagram: () => void;
}

const DiagramContext = createContext<DiagramContextType | undefined>(undefined);

export function DiagramProvider({ children }: { children: ReactNode }) {
  const [chartXML, setChartXML] = useState<string>("");

  const loadDiagram = useCallback((xml: string): string | null => {
    if (!xml || !xml.trim()) return "XML 为空";
    setChartXML(xml);
    return null;
  }, []);

  const clearDiagram = useCallback((): void => {
    setChartXML("");
  }, []);

  const value: DiagramContextType = {
    chartXML,
    loadDiagram,
    clearDiagram,
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
