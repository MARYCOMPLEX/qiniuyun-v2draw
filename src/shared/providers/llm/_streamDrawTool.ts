import { streamText } from "ai";

import { getAIModel } from "./ai-providers";
import { drawToolSchema } from "@/shared/types/schema";

export interface StreamDrawRequest {
  systemPrompt: string;
  userUtterance: string;
  canvasState?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 调用 LLM 生成画图指令, 返回纯文本 stream (tool 调用的 partial JSON args 逐字 delta)。
 *
 * 设计: 用 streamText + tools (tool_choice='auto', 兼容 thinking 模型),
 * 然后从 fullStream 里手工提取 tool-input-delta 事件, 把 args 增量当文本流出去。
 * 前端用 partial-json 解析这个流, 跟之前 streamObject 的输出格式等价, 零改动。
 */
export function streamDrawToolAsTextStream(request: StreamDrawRequest): Response {
  const { model } = getAIModel();

  let systemContent = request.systemPrompt;
  if (request.canvasState) {
    systemContent += `\n\n---\n## Current Canvas State (AUTHORITATIVE)\n\`\`\`json\n${request.canvasState}\n\`\`\`\n`;
  }

  const result = streamText({
    model,
    messages: [
      { role: "system" as const, content: systemContent },
      { role: "user" as const, content: request.userUtterance },
    ],
    temperature: request.temperature ?? 0,
    ...(request.maxTokens && { maxOutputTokens: request.maxTokens }),
    tools: {
      emit_draw_commands: {
        description:
          "Emit a structured draw envelope with commands array (CREATE_SHAPES / MODIFY_SHAPE / DELETE_SHAPE / CLEAR_CANVAS / STYLE_TRANSFORM) plus a brief narration.",
        inputSchema: drawToolSchema,
      },
    },
    onError({ error }) {
      console.warn("[streamDrawTool] error:", error);
    },
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const part of result.fullStream) {
          if (part.type === "tool-input-delta") {
            controller.enqueue(encoder.encode(part.delta));
          }
        }
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[streamDrawTool] stream error:", message);
        controller.enqueue(encoder.encode(`{"error":${JSON.stringify(message)}}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** 兼容旧调用名 — 同 streamDrawToolAsTextStream */
export const streamDrawTool = streamDrawToolAsTextStream;
