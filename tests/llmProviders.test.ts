import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { detectCapabilities } from "@/shared/providers";

describe("detectCapabilities (LLM)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("没有任何 LLM key 时返回 not ready", () => {
    const caps = detectCapabilities({});
    expect(caps.llm.ready).toBe(false);
    expect(caps.llm.provider).toBeNull();
  });

  it("只有 OPENAI_API_KEY 时 ready (provider=openai)", () => {
    const caps = detectCapabilities({ OPENAI_API_KEY: "sk-x" });
    expect(caps.llm.ready).toBe(true);
    expect(caps.llm.provider).toBe("openai");
  });

  it("有 DEEPSEEK_API_KEY 时优先识别 deepseek", () => {
    const caps = detectCapabilities({ DEEPSEEK_API_KEY: "sk-x" });
    expect(caps.llm.ready).toBe(true);
    expect(caps.llm.provider).toBe("deepseek");
  });

  it("LLM_DEFAULT_PROVIDER 显式覆盖自动检测", () => {
    const caps = detectCapabilities({
      OPENAI_API_KEY: "sk-x",
      LLM_DEFAULT_PROVIDER: "openai-compatible",
    });
    expect(caps.llm.ready).toBe(true);
    expect(caps.llm.provider).toBe("openai-compatible");
  });

  it("有 ANTHROPIC_API_KEY 也算 ready", () => {
    const caps = detectCapabilities({ ANTHROPIC_API_KEY: "x" });
    expect(caps.llm.ready).toBe(true);
  });

  it("有 GOOGLE_GENERATIVE_AI_API_KEY 也算 ready", () => {
    const caps = detectCapabilities({ GOOGLE_GENERATIVE_AI_API_KEY: "x" });
    expect(caps.llm.ready).toBe(true);
  });
});
