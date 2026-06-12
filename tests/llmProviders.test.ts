import { describe, expect, it } from "vitest";

import {
  getLlmProviderById,
  getLlmProviderForRoute,
  resolveLlmRoute,
} from "@/shared/providers";

describe("resolveLlmRoute", () => {
  it("无任何 env 时回落到内置兜底 (openai-compatible / gpt-4o-mini)", () => {
    const result = resolveLlmRoute("default", {});
    expect(result.providerId).toBe("openai-compatible");
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("LLM_DEFAULT_* 对所有路由生效", () => {
    const env = { LLM_DEFAULT_PROVIDER: "anthropic", LLM_DEFAULT_MODEL: "claude-haiku-4-5" };
    expect(resolveLlmRoute("default", env)).toEqual({
      providerId: "anthropic",
      model: "claude-haiku-4-5",
    });
    expect(resolveLlmRoute("atomic-shape", env)).toEqual({
      providerId: "anthropic",
      model: "claude-haiku-4-5",
    });
  });

  it("路由专属配置覆盖 default", () => {
    const env = {
      LLM_DEFAULT_PROVIDER: "anthropic",
      LLM_DEFAULT_MODEL: "claude-haiku-4-5",
      LLM_ATOMIC_SHAPE_PROVIDER: "google",
      LLM_ATOMIC_SHAPE_MODEL: "gemini-2.0-flash",
    };
    expect(resolveLlmRoute("atomic-shape", env)).toEqual({
      providerId: "google",
      model: "gemini-2.0-flash",
    });
    expect(resolveLlmRoute("diffusion-melt", env)).toEqual({
      providerId: "anthropic",
      model: "claude-haiku-4-5",
    });
  });

  it("无效 provider 字符串视为缺失, 继承下一层", () => {
    const env = {
      LLM_ATOMIC_SHAPE_PROVIDER: "non-existent",
      LLM_DEFAULT_PROVIDER: "google",
      LLM_DEFAULT_MODEL: "gemini-2.0-flash",
    };
    const result = resolveLlmRoute("atomic-shape", env);
    expect(result.providerId).toBe("google");
  });

  it("空白 model 视为缺失继承下一层", () => {
    const env = {
      LLM_DEFAULT_PROVIDER: "anthropic",
      LLM_DEFAULT_MODEL: "   ",
    };
    expect(resolveLlmRoute("default", env).model).toBe("gpt-4o-mini");
  });
});

describe("getLlmProviderById", () => {
  it("无 ID 或无效 ID 返回 nullLlmProvider", () => {
    expect(getLlmProviderById(undefined, {}).id).toBe("null");
    expect(getLlmProviderById("non-existent", {}).id).toBe("null");
  });

  it("按 ID 返回对应实例 (ID 字段透传)", () => {
    expect(getLlmProviderById("openai-compatible", {}).id).toBe("openai-compatible");
    expect(getLlmProviderById("anthropic", {}).id).toBe("anthropic");
    expect(getLlmProviderById("google", {}).id).toBe("google");
    expect(getLlmProviderById("mistral", {}).id).toBe("mistral");
  });
});

describe("getLlmProviderForRoute", () => {
  it("默认路由解析出兜底 (openai-compatible / gpt-4o-mini)", () => {
    const r = getLlmProviderForRoute("default", {});
    expect(r.providerId).toBe("openai-compatible");
    expect(r.model).toBe("gpt-4o-mini");
    expect(r.provider.id).toBe("openai-compatible");
  });

  it("Provider 未配置 key 时 streamDrawTool 返回 503 envelope", async () => {
    const r = getLlmProviderForRoute("default", { LLM_DEFAULT_PROVIDER: "anthropic" });
    expect(r.providerId).toBe("anthropic");
    const response = r.provider
      .streamDrawTool({
        systemPrompt: "test",
        userUtterance: "test",
        schema: undefined as never,
        model: r.model,
      })
      .toTextStreamResponse();
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe("LLM_NOT_CONFIGURED");
    expect(body.message).toContain("ANTHROPIC_API_KEY");
  });
});
