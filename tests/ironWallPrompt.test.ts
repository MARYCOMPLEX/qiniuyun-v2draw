import { describe, expect, it } from "vitest";

import { buildIronWallPrompt } from "@/app/api/generate-draw/ironWallPrompt";
import { getStyleById } from "@/shared/constants/marketStyles";

describe("buildIronWallPrompt", () => {
  const style = getStyleById("SKILL_CYBER_PUNK");
  const prompt = buildIronWallPrompt(style);

  it("把当前 activeStyleId 编织进多个位置 (header + constraint + create_shapes 模板)", () => {
    const occurrences = prompt.match(/SKILL_CYBER_PUNK/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  it("包含核心铁律: 严格 JSON / 无 Markdown / 风格死锁 / 兜底降级", () => {
    expect(prompt).toContain("严格 JSON");
    expect(prompt).toContain("绝对禁止");
    expect(prompt).toContain("死锁");
    expect(prompt).toContain("强制降级");
  });

  it("禁止 markdown fence 包裹", () => {
    expect(prompt).toContain("Markdown");
    expect(prompt).toContain("```json");
  });

  it("枚举 5 个命令类型", () => {
    expect(prompt).toContain("CREATE_SHAPES");
    expect(prompt).toContain("MODIFY_SHAPE");
    expect(prompt).toContain("DELETE_SHAPE");
    expect(prompt).toContain("CLEAR_CANVAS");
    expect(prompt).toContain("STYLE_TRANSFORM");
  });

  it("提供决策树和示例 (三个圆 / 改方块 / 清空)", () => {
    expect(prompt).toContain("DECISION TREE");
    expect(prompt).toContain("EXAMPLES");
    expect(prompt).toMatch(/三个|3 个/);
  });
});
