import { describe, expect, it } from "vitest";

import { buildIronWallPrompt } from "@/app/api/generate-draw/ironWallPrompt";
import { getStyleById } from "@/shared/constants/marketStyles";

describe("buildIronWallPrompt", () => {
  const style = getStyleById("SKILL_CYBER_PUNK");
  const prompt = buildIronWallPrompt(style);

  it("把当前 activeStyleId 编织进多个位置 (header + 死锁 + 模板示例)", () => {
    const occurrences = prompt.match(/SKILL_CYBER_PUNK/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  it("包含画布坐标系描述", () => {
    expect(prompt).toContain("CANVAS COORDINATE SYSTEM");
    expect(prompt).toContain("920");
    expect(prompt).toContain("(480, 320)");
  });

  it("包含核心契约: 严格 JSON / 不解释 / 风格死锁 / 兜底降级", () => {
    expect(prompt).toContain("严格 JSON");
    expect(prompt).toContain("不解释");
    expect(prompt).toContain("死锁");
    expect(prompt).toContain("强制降级");
  });

  it("枚举 8 个命令类型", () => {
    expect(prompt).toContain("CREATE_SHAPES");
    expect(prompt).toContain("MOVE_SHAPE");
    expect(prompt).toContain("RESIZE_SHAPE");
    expect(prompt).toContain("MODIFY_SHAPE");
    expect(prompt).toContain("DELETE_SHAPE");
    expect(prompt).toContain("CLEAR_CANVAS");
    expect(prompt).toContain("STYLE_TRANSFORM");
    expect(prompt).toContain("BATCH_TRANSFORM");
  });

  it("提供决策树和艺术构图法则", () => {
    expect(prompt).toContain("DECISION TREE");
    expect(prompt).toContain("ARTISTIC COMPOSITION RULES");
    expect(prompt).toMatch(/Rule 1|黄金留白/);
  });

  it("包含至少 8 个示例", () => {
    expect(prompt).toContain("EXAMPLES");
    expect(prompt).toMatch(/三圆|三个|对称/);
  });

  it("强调 id 一致性管理", () => {
    expect(prompt).toContain("id 一致性");
    expect(prompt).toContain("canvasState");
  });
});
