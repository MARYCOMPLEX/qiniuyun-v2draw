/**
 * Shape library 文档读取 — 服务端工具, 用于 LLM tool execute 返回。
 *
 * 当 LLM 调 drawio.get_shape_library({library: "aws4"}) 时,
 * 后端从 docs/shape-libraries/{library}.md 读取内容直接返回 LLM,
 * 让模型学会该 library 的形状写法 + 用例。
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { SHAPE_LIBRARIES } from "@/shared/types/drawio-tools";

/** 库文件最大尺寸 (防止读取过大) */
const MAX_LIB_SIZE = 200_000;

/**
 * 读取 shape library markdown, 返回内容字符串。
 * 失败时返回错误信息 (不抛异常, 让 LLM 看到错误自决策)。
 */
export async function readShapeLibrary(library: string): Promise<string> {
  if (!(SHAPE_LIBRARIES as readonly string[]).includes(library)) {
    return `[Error] Unknown library "${library}". Available: ${SHAPE_LIBRARIES.join(", ")}`;
  }

  const filePath = path.join(
    process.cwd(),
    "docs",
    "shape-libraries",
    `${library}.md`,
  );

  try {
    const content = await fs.readFile(filePath, "utf-8");
    if (content.length > MAX_LIB_SIZE) {
      return `[Error] Library "${library}" too large (${content.length} bytes), exceeds ${MAX_LIB_SIZE} limit.`;
    }
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn(`[shape-library] read ${library} failed:`, msg);
    return `[Error] Failed to read library "${library}": ${msg}`;
  }
}
