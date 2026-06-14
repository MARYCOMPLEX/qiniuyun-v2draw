import { describe, expect, it } from "vitest";

import { buildCanvasState } from "@/app/api/generate-draw/canvasState";

describe("buildCanvasState", () => {
  it("两段都缺 → undefined", () => {
    expect(buildCanvasState({})).toBeUndefined();
  });

  it("空白 chartXML 不计入", () => {
    expect(buildCanvasState({ chartXML: "   " })).toBeUndefined();
  });

  it("只有 chartXML 时只输出 chartXML 段", () => {
    const result = buildCanvasState({
      chartXML: "<mxfile><diagram>x</diagram></mxfile>",
    });
    expect(result).toContain("### chartXML");
    expect(result).toContain("edit_diagram 必须引用其中的 cell_id");
    expect(result).toContain("<mxfile>");
    expect(result).not.toContain("### existingShapes");
  });

  it("只有 existingShapes 时只输出 existingShapes 段", () => {
    const result = buildCanvasState({
      existingShapes: [
        {
          id: "img-1",
          shape: "image",
          size: 400,
          position: { x: 100, y: 200 },
        },
      ],
    });
    expect(result).toContain("### existingShapes");
    expect(result).toContain('"id": "img-1"');
    expect(result).not.toContain("### chartXML");
  });

  it("两段都有 时按 chartXML → existingShapes 顺序拼接", () => {
    const result = buildCanvasState({
      chartXML: "<mxfile/>",
      existingShapes: [
        {
          id: "img-1",
          shape: "image",
          size: 400,
          position: { x: 0, y: 0 },
        },
      ],
    });
    expect(result).toBeDefined();
    const xmlIdx = result!.indexOf("### chartXML");
    const shapesIdx = result!.indexOf("### existingShapes");
    expect(xmlIdx).toBeGreaterThanOrEqual(0);
    expect(shapesIdx).toBeGreaterThan(xmlIdx);
  });

  it("空 existingShapes 数组 不计入 (沿用原行为)", () => {
    const result = buildCanvasState({
      existingShapes: [],
    });
    expect(result).toBeUndefined();
  });
});
