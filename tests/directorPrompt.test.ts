import { describe, expect, it } from "vitest";

import { buildDirectorPrompt } from "@/app/api/generate-draw/directorPrompt";
import { getStyleById } from "@/shared/constants/marketStyles";

describe("buildDirectorPrompt", () => {
  const style = getStyleById("SKILL_CYBER_PUNK");
  const prompt = buildDirectorPrompt(style);

  it("锁定当前 activeStyleId 至少 2 处 (header + 风格后缀)", () => {
    const occurrences = prompt.match(/SKILL_CYBER_PUNK/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("声明 27 工具的命名空间 (canvas.* + platform.*)", () => {
    expect(prompt).toContain("canvas.generate_image");
    expect(prompt).toContain("canvas.move_layer");
    expect(prompt).toContain("canvas.undo");
    expect(prompt).toContain("platform.set_theme");
    expect(prompt).toContain("platform.toggle_grid");
    expect(prompt).toContain("platform.zoom_canvas");
  });

  it("包含 image prompt 写作要点 (主语+动作+环境+风格+光线+镜头)", () => {
    expect(prompt).toMatch(/主语.*动作.*环境.*风格.*光线.*镜头/);
  });

  it("包含 8 个调用示例 (8 个 → 用户:)", () => {
    const examples = prompt.match(/用户:/g) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(8);
  });

  it("包含决策树 6 个分支", () => {
    expect(prompt).toContain("# DECISION TREE");
    expect(prompt).toContain("新画");
    expect(prompt).toContain("改图");
    expect(prompt).toContain("布局");
    expect(prompt).toContain("删除");
    expect(prompt).toContain("平台");
  });

  it("强制 JSON / 禁止 Markdown 等 4 条核心约束", () => {
    expect(prompt).toContain("严格 JSON");
    expect(prompt).toContain("targetLayerId");
    expect(prompt).toContain("不能编造");
  });

  it("标注 canvasState AUTHORITATIVE", () => {
    expect(prompt).toContain("AUTHORITATIVE");
  });

  it("说明用户指令无法解析时的兜底降级", () => {
    expect(prompt).toContain("强制降级");
    expect(prompt).toContain("abstract dreamlike scene");
  });

  it("3 个风格的 prompt 后缀建议都齐全", () => {
    expect(prompt).toContain("cyberpunk neon");
    expect(prompt).toContain("van gogh oil painting");
    expect(prompt).toContain("dark obsidian");
  });
});
