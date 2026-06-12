# 0001 — HTTP 流式 + 物理缓动的伪实时降级架构

- Status: Accepted
- Date: 2026-06-12

## Context

硬件长连接限制：不能使用 WebRTC / WebSocket。需要在浏览器端实现"语音断句 → 大模型流式增量 JSON → Canvas 实时反馈"的体验。

## Decision

采用以下三层方案：

1. **前端 VAD 断句**：`useVoiceVAD` 用 `AudioContext.AnalyserNode` 计算 RMS 音量，静音持续 600ms 触发上行。
2. **HTTP POST + streamObject**：路由 `/api/generate-draw` 用 Vercel AI SDK 的 `streamObject` 挤牙膏式吐 partial JSON，前端按帧消费。
3. **物理缓动**：`VectorStage` 用 `requestAnimationFrame` + LERP（系数 0.12）把目标值平滑插值到当前值，从视觉层抹平网络与流式延迟的颗粒感。

## Consequences

- 优势：兼容受限硬件、降级路径清晰、与 Vercel AI SDK 原生契合。
- 代价：单向流，缺乏 RTC 的双向低延迟；通过模拟器 + LERP 在用户体验上掩盖。
- 风险：若大模型不严格遵守"裸 JSON"约束，前端解析将崩溃 — 故在 `ironWallPrompt.ts` 注入铁壁负向约束，并通过 `dispatchPartialTool` 在半成品上做防御性渲染。
