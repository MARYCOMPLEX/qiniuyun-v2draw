import type { LlmProvider, LlmStreamRequest, LlmStreamResponse } from "./types";

const NOT_READY_BODY = {
  success: false,
  code: "LLM_NOT_CONFIGURED",
  message: "未配置任何 LLM Provider，请使用前端内置数据流模拟器或在 .env 中启用一个 LLM_PROVIDER",
  data: null,
};

const buildNotReadyResponse = (): LlmStreamResponse => ({
  toTextStreamResponse: () =>
    new Response(JSON.stringify(NOT_READY_BODY), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
});

/**
 * 占位 Provider — env 未配置任何 LLM 时回落到此。
 * Why: 用 Null Object 模式让上层无需写 if/else,
 * 始终能拿到一个可调用对象，错误响应统一从这里出。
 */
export const nullLlmProvider: LlmProvider = {
  id: "null",
  streamDrawTool(_request: LlmStreamRequest): LlmStreamResponse {
    void _request;
    return buildNotReadyResponse();
  },
};
