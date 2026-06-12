import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";

/**
 * 得意黑 (Smiley Sans) — 唯一字重 Oblique。
 * Why: 全 UI 替换为得意黑斜体, 含 sans 与 mono, 强化赛博朋克 vibe。
 * 自托管避免 CDN 抖动, woff2 ~1.1MB, Next 字体优化自动注入 preload。
 */
const smileySans = localFont({
  src: "../../public/fonts/SmileySans-Oblique.woff2",
  variable: "--font-smiley",
  display: "swap",
  weight: "400",
  style: "oblique",
});

export const metadata: Metadata = {
  title: "VOICE CANVAS — 风格市场 · 铁壁防御",
  description:
    "Canvas OS 语音绘图 Agent 系统原型：风格市场热插拔 + 铁壁提示词约束 + 流式物理缓动",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={smileySans.variable}>
      <body className="min-h-screen bg-black font-sans text-white antialiased">
        {children}
      </body>
    </html>
  );
}
