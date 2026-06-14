"use client";

import { useId } from "react";

import "./streaming-orb-fx.css";

interface StreamingOrbFxProps {
  /** 是否显示 (一般跟 canvas.streaming 联动) */
  readonly active: boolean;
  /** orb 视口尺寸, 默认 140 (跟画布场景匹配) */
  readonly orbSize?: number;
  /** core 与 plasma blob 直径, 默认 44 */
  readonly coreSize?: number;
  /** gooey filter blur 强度, 默认 12 */
  readonly gooeyBlur?: number;
  /** "生成中..." 提示语, null 关闭文字 */
  readonly hint?: string | null;
}

/**
 * 画布占位特效 — 移植自 qiniufront/voice-agent-widget 的 thinking 状态 fluid orb。
 *
 * 视觉: 3 个 plasma blob + SVG goo filter 融合, mix-blend-mode=screen 暗色叠加,
 * thinking keyframe 强搏动 1.0~1.4s 周期, 给"AI 正在思考"的强信号。
 *
 * 不抄 widget 外壳 (header/transcript/麦克风按钮), 这些已经由 AgentConversationPanel 承担。
 *
 * 默认参数比 widget 默认值更小 (180→140, 60→44), 适合叠在画布中央做半透明占位 而不抢内容。
 */
export function StreamingOrbFx({
  active,
  orbSize = 140,
  coreSize = 44,
  gooeyBlur = 12,
  hint = "AI 正在生成…",
}: StreamingOrbFxProps) {
  const uid = useId().replace(/:/g, "");
  const filterId = `streaming-orb-goo-${uid}`;

  if (!active) return null;

  return (
    <div
      className="streaming-orb-fx"
      style={
        {
          "--orb-size": `${orbSize}px`,
          "--core-size": `${coreSize}px`,
        } as React.CSSProperties
      }
      aria-hidden
    >
      <svg
        className="streaming-orb-fx__svg-defs"
        xmlns="http://www.w3.org/2000/svg"
        version="1.1"
      >
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation={gooeyBlur} result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -9"
              result="goo"
            />
          </filter>
        </defs>
      </svg>

      <div
        className="streaming-orb-fx__wrapper"
        style={{ filter: `url(#${filterId})` }}
      >
        <div className="streaming-orb-fx__core" />
        <div className="streaming-orb-fx__blob streaming-orb-fx__blob--1" />
        <div className="streaming-orb-fx__blob streaming-orb-fx__blob--2" />
        <div className="streaming-orb-fx__blob streaming-orb-fx__blob--3" />
      </div>

      {hint ? <div className="streaming-orb-fx__hint">{hint}</div> : null}
    </div>
  );
}
