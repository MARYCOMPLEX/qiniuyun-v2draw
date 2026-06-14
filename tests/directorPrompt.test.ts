import { describe, expect, it } from "vitest";

import { buildDirectorPrompt } from "@/app/api/generate-draw/directorPrompt";
import { getStyleById } from "@/shared/constants/marketStyles";

describe("buildDirectorPrompt (drawio + canvas + platform 31 工具)", () => {
  const style = getStyleById("SKILL_CYBER_PUNK");
  const prompt = buildDirectorPrompt(style);

  it("锁定当前 activeStyleId 至少 2 处 (header + 风格后缀)", () => {
    const occurrences = prompt.match(/SKILL_CYBER_PUNK/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("声明 drawio 4 工具命名空间", () => {
    expect(prompt).toContain("drawio.display_diagram");
    expect(prompt).toContain("drawio.edit_diagram");
    expect(prompt).toContain("drawio.append_diagram");
    expect(prompt).toContain("drawio.get_shape_library");
  });

  it("声明 canvas 图像工具命名空间", () => {
    expect(prompt).toContain("canvas.generate_image");
    expect(prompt).toContain("canvas.undo");
  });

  it("声明 platform 工具命名空间", () => {
    expect(prompt).toContain("platform.set_theme");
    expect(prompt).toContain("platform.zoom_canvas");
  });

  it("包含 image prompt 写作要点 (主语+动作+环境+风格+光线+镜头)", () => {
    expect(prompt).toMatch(/主语.*动作.*环境.*风格.*光线.*镜头/);
  });

  it("包含 8 个调用示例 (8 个 → 用户:)", () => {
    const examples = prompt.match(/用户:/g) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(8);
  });

  it("包含决策树 8 个分支 (复合/矢量/编辑/生图/图编辑/风格/视口/撤销)", () => {
    expect(prompt).toContain("# 决策树");
    expect(prompt).toContain("画矢量图");
    expect(prompt).toContain("生成图像");
    expect(prompt).toContain("图像编辑");
    expect(prompt).toContain("撤销");
  });

  it("包含矢量画图的边路由 7 法则", () => {
    expect(prompt).toContain("边路由 7 法则");
    expect(prompt).toContain("waypoint");
  });

  it("强制 JSON / 禁止 Markdown 等核心约束", () => {
    expect(prompt).toContain("严格 JSON");
    expect(prompt).toContain("不能编造");
  });

  it("说明用户指令无法解析时的兜底降级", () => {
    expect(prompt).toContain("降级");
    expect(prompt).toContain("矩形");
  });

  it("3 个风格的 prompt 后缀建议都齐全", () => {
    expect(prompt).toContain("cyberpunk neon");
    expect(prompt).toContain("van gogh oil painting");
    expect(prompt).toContain("dark obsidian");
  });

  it("含 mxCell id 规则 (从 2 开始, 0/1 是 root)", () => {
    expect(prompt).toContain("从 2 开始");
  });

  it("含图像作为 mxCell 的混合用例说明", () => {
    expect(prompt).toContain("image mxCell");
  });
});
