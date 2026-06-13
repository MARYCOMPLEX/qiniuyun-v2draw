import { describe, expect, it } from "vitest";

import { detectCapabilities } from "@/shared/providers";

describe("detectCapabilities", () => {
  it("空 env 时所有能力 ready=false", () => {
    const result = detectCapabilities({});
    expect(result.llm.ready).toBe(false);
    expect(result.asr.ready).toBe(false);
    expect(result.tts.ready).toBe(false);
    expect(result.image.ready).toBe(false);
    expect(result.search.ready).toBe(false);
  });

  it("LLM_DEFAULT_PROVIDER=openai-compatible 但缺 OPENAI_API_KEY 时 ready=false 并报缺失", () => {
    const result = detectCapabilities({ LLM_DEFAULT_PROVIDER: "openai-compatible" });
    expect(result.llm.ready).toBe(false);
    expect(result.llm.provider).toBe("openai-compatible");
    expect(result.llm.reason).toContain("OPENAI_API_KEY");
  });

  it("LLM_DEFAULT_PROVIDER + OPENAI_API_KEY 齐全时 ready=true", () => {
    const result = detectCapabilities({
      LLM_DEFAULT_PROVIDER: "openai-compatible",
      OPENAI_API_KEY: "sk-test",
    });
    expect(result.llm.ready).toBe(true);
    expect(result.llm.provider).toBe("openai-compatible");
  });

  it("兼容历史字段 LLM_PROVIDER (PR1 命名)", () => {
    const result = detectCapabilities({
      LLM_PROVIDER: "openai-compatible",
      OPENAI_API_KEY: "sk-test",
    });
    expect(result.llm.ready).toBe(true);
  });

  it("TTS browser-webspeech 不需要任何 key, 但 webspeech 不属于 TTS — TTS 必须显式设置 provider", () => {
    const result = detectCapabilities({ TTS_PROVIDER: "elevenlabs" });
    expect(result.tts.ready).toBe(false);
    expect(result.tts.reason).toContain("ELEVENLABS_API_KEY");
  });

  it("TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY 齐全时 ready=true", () => {
    const result = detectCapabilities({
      TTS_PROVIDER: "elevenlabs",
      ELEVENLABS_API_KEY: "el-test",
    });
    expect(result.tts.ready).toBe(true);
  });

  it("ASR browser-webspeech 无需任何 key", () => {
    const result = detectCapabilities({ ASR_PROVIDER: "browser-webspeech" });
    expect(result.asr.ready).toBe(true);
    expect(result.asr.provider).toBe("browser-webspeech");
  });

  it("阿里云 NLS 需要 AccessKey + AppKey 三件套同时齐全", () => {
    const partial = detectCapabilities({
      ASR_PROVIDER: "aliyun-nls",
      ALIYUN_NLS_APP_KEY: "k",
      ALIYUN_ACCESS_KEY_ID: "id",
    });
    expect(partial.asr.ready).toBe(false);
    expect(partial.asr.reason).toContain("ALIYUN_ACCESS_KEY_SECRET");

    const full = detectCapabilities({
      ASR_PROVIDER: "aliyun-nls",
      ALIYUN_NLS_APP_KEY: "k",
      ALIYUN_ACCESS_KEY_ID: "id",
      ALIYUN_ACCESS_KEY_SECRET: "secret",
    });
    expect(full.asr.ready).toBe(true);
  });

  it("Image / Search Provider 各支路独立判定", () => {
    const result = detectCapabilities({
      IMAGE_PROVIDER: "stability",
      STABILITY_API_KEY: "stb",
      SEARCH_PROVIDER: "tavily",
    });
    expect(result.image.ready).toBe(true);
    expect(result.search.ready).toBe(false);
    expect(result.search.reason).toContain("TAVILY_API_KEY");
  });

  it("空字符串 env 视为未配置（trim 后为空）", () => {
    const result = detectCapabilities({
      LLM_DEFAULT_PROVIDER: "openai-compatible",
      OPENAI_API_KEY: "   ",
    });
    expect(result.llm.ready).toBe(false);
  });
});
