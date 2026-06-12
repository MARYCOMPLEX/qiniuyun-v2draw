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

### Changed (PR1 · 2026-06-12)
- `shared/providers/`：新增 5 大能力域 Provider Registry 骨架（`llm/asr/tts/image/search`）。
  · 每域 `types.ts` + `null.ts`（Null Object）+ `registry.ts`（env 工厂）。
  · `capabilities.ts`：`detectCapabilities(env)` 纯函数，前后端共用同一套 ready 判定。
- `app/api/capabilities/route.ts`：GET 路由暴露能力矩阵给客户端。
- `features/voice-control`：`useCapabilities` / `useCapabilityToggles`（localStorage 持久化）/ `CapabilitiesPanel` UI 面板。

### Changed (PR2 · 2026-06-12)
- `LlmProvider` 接口与 Model 解耦：移除 `modelId`，改为 `LlmStreamRequest.model` 运行时参数。同一 Provider（如 yunwu/openai-compatible）可承载 gpt-4o / gemini / claude 等多种模型。
- 新增 `resolveLlmRoute(toolType, env)` 与 `getLlmProviderForRoute / ForToolType`：按 toolType 路由二级解析（`atomic-shape` / `diffusion-melt` / `web-search` / `default`）。
- 新增 4 个真实 LLM Provider 实现：`openai-compatible` / `anthropic` / `google` / `mistral`。共享 `_streamDrawTool` 与 `_notReady` 辅助避免样板重复。
- `app/api/generate-draw/route.ts` 改为通过 `getLlmProviderForRoute(toolHint)` 取 Provider，移除 `createOpenAI` 直调；请求 schema 新增 `toolHint` 字段。
- env 字段重命名：`LLM_PROVIDER` → `LLM_DEFAULT_PROVIDER`（兼容历史名），新增 `LLM_DEFAULT_MODEL` 与按 toolType 维度的覆盖项。

### Added (PR2)
- 依赖：`@ai-sdk/anthropic@1.2.12` / `@ai-sdk/google@1.2.22` / `@ai-sdk/mistral@1.2.8`（精确版本）。
- `tests/llmProviders.test.ts`：12 用例覆盖路由解析、registry、Provider 自管错误响应。

### Docs
- 新增 `docs/decisions.md`：累积式决策日志，回填 8 条历史决策。
