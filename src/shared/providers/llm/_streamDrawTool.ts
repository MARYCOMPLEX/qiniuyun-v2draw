import { streamObject } from "ai";
import type { LanguageModel } from "ai";

import type { LlmStreamRequest, LlmStreamResponse } from "./types";

/**
 * 共用流式调用样板。
 * Why: 4 个 Provider 仅在 model 实例化方式上不同, streamObject 调用与
 * iron-wall system prompt 注入完全一致。集中在此避免重复, 单点演进。
 */
export const streamDrawToolViaModel = (
  model: LanguageModel,
  request: LlmStreamRequest,
): LlmStreamResponse => {
  const result = streamObject({
    model,
    schema: request.schema,
    system: request.systemPrompt,
    prompt: request.userUtterance,
    temperature: request.temperature ?? 0,
    maxTokens: request.maxTokens,
  });

  return {
    toTextStreamResponse: () => result.toTextStreamResponse(),
  };
};
