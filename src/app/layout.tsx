import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOICE CANVAS — 风格市场 · 铁壁防御",
  description:
    "Canvas OS 语音绘图 Agent 系统原型：风格市场热插拔 + 铁壁提示词约束 + 流式物理缓动",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-black text-white antialiased">{children}</body>
    </html>
  );
}
