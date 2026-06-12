# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- 项目初始化脚手架（Next.js 15 + React 19 + Tailwind + Zod + Vercel AI SDK）。
- `shared/types/schema.ts`：Zod 多维 Discriminated Union 工具契约（ATOMIC_SHAPE / DIFFUSION_MELT / WEB_SEARCH）。
- `shared/constants/marketStyles.ts`：风格市场静态注册表（CYBER_PUNK / VAN_GOGH / OBSIDIAN）。
- `app/api/generate-draw/route.ts`：流式 streamObject 路由 + 铁壁防御提示词。
- `features/voice-control`：`useVoiceVAD` / `QuantumOrb` / `TelemetryHUD` / `StyleMarketPanel` / `useDrawSimulator`。
- `features/art-canvas`：`VectorStage` (LERP 物理缓动 + Retina 适配) + `toolDispatcher`。
- ADR 0001：HTTP 流式 + 物理缓动的伪实时降级架构。
- 单元测试 22 用例（schema / marketStyles / toolDispatcher / ironWallPrompt），vitest 覆盖率门槛 80% / 70%。

### Fixed
- 将 `zod` 锁定到 `3.25.76` —— Vercel AI SDK 4.3 嵌套的 `zod-to-json-schema` 需要 `zod/v3` 子路径导出，旧版 3.24.x 会导致 `next build` webpack 解析失败。
