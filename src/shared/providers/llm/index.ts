/**
 * LLM Provider 门面 — 只暴露 streamDrawTool 入口。
 * Why: 用 next-ai-drawio 风格的 getAIModel + streamText, 不再需要 PR1 的 Provider 抽象。
 * 老的 LlmProvider/LlmStreamRequest 接口废弃, 业务直接调 streamDrawTool。
 */
export { streamDrawTool } from "./_streamDrawTool";
export type { StreamDrawRequest } from "./_streamDrawTool";
export { getAIModel, supportsPromptCaching, isSingleSystemProvider } from "./ai-providers";
export type { ProviderName } from "./ai-providers";
