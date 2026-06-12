import { describe, expect, it } from "vitest";

import { buildIronWallPrompt } from "@/app/api/generate-draw/ironWallPrompt";
import { getStyleById } from "@/shared/constants/marketStyles";

describe("buildIronWallPrompt", () => {
  const style = getStyleById("SKILL_CYBER_PUNK");
  const prompt = buildIronWallPrompt(style);

  it("locks the activeStyleId twice (header + constraint #3)", () => {
    const occurrences = prompt.match(/SKILL_CYBER_PUNK/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("contains all four mandatory negative constraints", () => {
    expect(prompt).toContain("第一个输出字符必须是 '{'");
    expect(prompt).toContain("严禁进行任何人类语言的解释");
    expect(prompt).toContain("唯一死锁");
    expect(prompt).toContain("默认兜底工具对象");
  });

  it("forbids markdown fence wrapping in the rules", () => {
    expect(prompt).toContain("绝不能包裹");
    expect(prompt).toContain("```json");
  });
});
