import type { LlmStreamResponse } from "./types";

/**
 * Provider 未就绪时的统一错误响应工厂。
 * Why: 路由层零 try/catch (PR2 决策 Q3=ii), 错误格式由 Provider 自管,
 * 各 Provider 共用此工厂保证 envelope 一致 (与 null.ts 同源)。
 */
export const buildNotReadyResponse = (reason: string): LlmStreamResponse => ({
  toTextStreamResponse: () =>
    new Response(
      JSON.stringify({
        success: false,
        code: "LLM_NOT_CONFIGURED",
        message: reason,
        data: null,
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    ),
});
