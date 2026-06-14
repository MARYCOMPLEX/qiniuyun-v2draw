import { streamText } from "ai";

import { getAIModel } from "./ai-providers";
import { unifiedEnvelopeSchema } from "@/shared/types/unified-tools";

export interface ConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface StreamDrawRequest {
  systemPrompt: string;
  userUtterance: string;
  canvasState?: string;
  /**
   * 最近 N 轮历史 (user + assistant narration), 不含本轮 utterance。
   * 用于 LLM 理解 "切到那个风格""把刚才那个删了" 等指代。
   * 留空则退化为单轮调用。
   */
  history?: ReadonlyArray<ConversationMessage>;
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

  const hasHistory = request.history && request.history.length > 0;
  const messages = hasHistory
    ? [
        ...request.history!.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: request.userUtterance },
      ]
    : undefined;

  const result = streamText({
    model,
    system: systemContent,
    ...(messages ? { messages } : { prompt: request.userUtterance }),
    temperature: request.temperature ?? 0,
    ...(request.maxTokens && { maxOutputTokens: request.maxTokens }),
    tools: {
      emit_canvas_commands: {
        description:
          "Emit a structured envelope with one or more commands (drawio.* vector tools, canvas.* image tools, platform.* UI tools) plus a brief narration.",
        inputSchema: unifiedEnvelopeSchema,
      },
    },
    onError({ error }) {
      console.warn("[streamDrawTool] error:", error);
    },
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const safeClose = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // 已经被外部 cancel 关掉, 忽略
        }
      };
      const safeEnqueue = (chunk: Uint8Array): void => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true; // controller 已不可写
        }
      };
      try {
        for await (const part of result.fullStream) {
          if (closed) break;
          if (part.type === "tool-input-delta") {
            safeEnqueue(encoder.encode(part.delta));
          }
        }
        safeClose();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[streamDrawTool] stream error:", message);
        safeEnqueue(encoder.encode(`{"error":${JSON.stringify(message)}}`));
        safeClose();
      }
    },
    cancel() {
      // 客户端主动断开, 标记 closed 防止 start() 内继续 enqueue
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** 兼容旧调用名 — 同 streamDrawToolAsTextStream */
export const streamDrawTool = streamDrawToolAsTextStream;
