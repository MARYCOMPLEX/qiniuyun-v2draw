import { buildNotReadyResponse } from "./_notReady";
import type { LlmProvider, LlmStreamRequest, LlmStreamResponse } from "./types";

/**
 * 占位 Provider — env 未配置任何 LLM 时回落到此。
 * Why: Null Object 模式让上层无需写 if/else, 始终能拿到可调用对象,
 * 错误响应统一从这里出。
 */
export const nullLlmProvider: LlmProvider = {
  id: "null",
  streamDrawTool(_request: LlmStreamRequest): LlmStreamResponse {
    void _request;
    return buildNotReadyResponse(
      "未配置任何 LLM Provider, 请使用前端内置数据流模拟器或在 .env 中启用一个 LLM_PROVIDER",
    );
  },
};
