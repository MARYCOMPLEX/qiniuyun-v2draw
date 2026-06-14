import { describe, expect, it } from "vitest";

import { buildDirectorPrompt } from "@/app/api/generate-draw/directorPrompt";

describe("buildDirectorPrompt (drawio + canvas + platform 30 工具)", () => {
  const prompt = buildDirectorPrompt();

  it("不再注入 activeStyleId / 风格后缀模板 (跟 style market 解耦)", () => {
    expect(prompt).not.toContain("activeStyleId=");
    expect(prompt).not.toContain("# CURRENT STYLE");
    expect(prompt).not.toMatch(/SKILL_CYBER_PUNK.*cyberpunk neon/);
    expect(prompt).not.toMatch(/SKILL_VAN_GOGH.*van gogh/);
    expect(prompt).not.toMatch(/SKILL_OBSIDIAN.*minimalist/);
  });

  it("仍然告诉 LLM 主题切换走 platform.set_theme 工具", () => {
    expect(prompt).toContain("platform.set_theme");
    expect(prompt).toContain("SKILL_CYBER_PUNK");
    expect(prompt).toContain("SKILL_VAN_GOGH");
    expect(prompt).toContain("SKILL_OBSIDIAN");
  });

  it("声明 drawio 3 工具命名空间", () => {
    expect(prompt).toContain("drawio.display_diagram");
    expect(prompt).toContain("drawio.edit_diagram");
    expect(prompt).toContain("drawio.append_diagram");
  });

  it("不再声明已废弃的 get_shape_library 工具", () => {
    expect(prompt).not.toContain("drawio.get_shape_library");
    expect(prompt).not.toContain("get_shape_library");
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

  it("包含 7 个调用示例 (7 个 → 用户:)", () => {
    const examples = prompt.match(/用户:/g) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(7);
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

  it("不再含 3 个风格的英文 prompt 后缀模板 (跟 LLM 解耦)", () => {
    expect(prompt).not.toContain("cyberpunk neon");
    expect(prompt).not.toContain("van gogh oil painting");
    expect(prompt).not.toContain("dark obsidian");
  });

  it("含 mxCell id 规则 (从 2 开始, 0/1 是 root)", () => {
    expect(prompt).toContain("从 2 开始");
  });

  it("含图像作为 mxCell 的混合用例说明", () => {
    expect(prompt).toContain("image mxCell");
  });
});
