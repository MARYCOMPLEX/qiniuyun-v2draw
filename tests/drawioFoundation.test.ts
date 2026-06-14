import { describe, expect, it } from "vitest";

import {
  DRAWIO_TOOL,
  drawioCommandSchema,
  isDisplayDiagram,
  isEditDiagram,
  isAppendDiagram,
  isGetShapeLibrary,
  isDrawioTool,
  SHAPE_LIBRARIES,
} from "@/shared/types/drawio-tools";
import {
  isMxCellXmlComplete,
  extractCompleteMxCells,
  wrapWithMxFile,
  isRealDiagram,
  MIN_REAL_DIAGRAM_LENGTH,
} from "@/features/diagram/utils/mxCellUtils";

describe("drawio-tools schema", () => {
  it("接受 display_diagram 命令", () => {
    const cmd = drawioCommandSchema.parse({
      tool: DRAWIO_TOOL.DISPLAY_DIAGRAM,
      xml: '<mxCell id="2" value="Box" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60"/></mxCell>',
    });
    expect(isDisplayDiagram(cmd)).toBe(true);
  });

  it("接受 edit_diagram operations", () => {
    const cmd = drawioCommandSchema.parse({
      tool: DRAWIO_TOOL.EDIT_DIAGRAM,
      operations: [
        { operation: "update", cell_id: "3", new_xml: "<mxCell .../>" },
        { operation: "delete", cell_id: "5" },
      ],
    });
    expect(isEditDiagram(cmd)).toBe(true);
  });

  it("接受 append_diagram 续传", () => {
    const cmd = drawioCommandSchema.parse({
      tool: DRAWIO_TOOL.APPEND_DIAGRAM,
      xml: "<mxCell id=\"7\" .../>",
    });
    expect(isAppendDiagram(cmd)).toBe(true);
  });

  it("接受 get_shape_library 查 aws4", () => {
    const cmd = drawioCommandSchema.parse({
      tool: DRAWIO_TOOL.GET_SHAPE_LIBRARY,
      library: "aws4",
    });
    expect(isGetShapeLibrary(cmd)).toBe(true);
  });

  it("拒绝未知 library 名", () => {
    expect(() =>
      drawioCommandSchema.parse({
        tool: DRAWIO_TOOL.GET_SHAPE_LIBRARY,
        library: "non-existent",
      }),
    ).toThrow();
  });

  it("isDrawioTool 命名空间守卫", () => {
    expect(isDrawioTool("drawio.display_diagram")).toBe(true);
    expect(isDrawioTool("canvas.generate_image")).toBe(false);
    expect(isDrawioTool("platform.set_theme")).toBe(false);
  });

  it("SHAPE_LIBRARIES 至少包含基础 4 个", () => {
    expect(SHAPE_LIBRARIES).toContain("flowchart");
    expect(SHAPE_LIBRARIES).toContain("basic");
    expect(SHAPE_LIBRARIES).toContain("aws4");
    expect(SHAPE_LIBRARIES).toContain("kubernetes");
  });
});

describe("mxCellUtils", () => {
  it("isMxCellXmlComplete 识别完整自闭合", () => {
    expect(isMxCellXmlComplete('<mxCell id="2" .../>')).toBe(true);
    expect(isMxCellXmlComplete('<mxCell id="2" ...></mxCell>')).toBe(true);
  });

  it("isMxCellXmlComplete 识别截断", () => {
    expect(isMxCellXmlComplete('<mxCell id="2" sty')).toBe(false);
    expect(isMxCellXmlComplete("")).toBe(false);
  });

  it("isMxCellXmlComplete 容忍尾部 wrapper 闭合标签", () => {
    expect(isMxCellXmlComplete('<mxCell id="2" .../></root></mxGraphModel>')).toBe(true);
  });

  it("extractCompleteMxCells 取已闭合元素, 丢半成品", () => {
    const xml = '<mxCell id="1" .../><mxCell id="2" sty';
    const result = extractCompleteMxCells(xml);
    expect(result).toContain('id="1"');
    expect(result).not.toContain('id="2"');
  });

  it("extractCompleteMxCells 处理嵌套 mxCell + mxGeometry", () => {
    const xml = '<mxCell id="3"><mxGeometry x="0" y="0"/></mxCell>';
    expect(extractCompleteMxCells(xml)).toContain('id="3"');
  });

  it("wrapWithMxFile 包成完整 mxfile", () => {
    const wrapped = wrapWithMxFile('<mxCell id="2" vertex="1" parent="1"/>');
    expect(wrapped).toContain("<mxfile>");
    expect(wrapped).toContain("<mxGraphModel>");
    expect(wrapped).toContain('<mxCell id="0"/>');
    expect(wrapped).toContain('<mxCell id="1" parent="0"/>');
    expect(wrapped).toContain('id="2"');
  });

  it("wrapWithMxFile 处理空输入返回空模板", () => {
    const wrapped = wrapWithMxFile("");
    expect(wrapped).toContain("<mxfile>");
    expect(wrapped).toContain('<mxCell id="0"/>');
  });

  it("wrapWithMxFile 已有 mxfile 不重复包", () => {
    const xml = "<mxfile><diagram>...</diagram></mxfile>";
    expect(wrapWithMxFile(xml)).toBe(xml);
  });

  it("wrapWithMxFile 剥离 LLM 误加的 root cell", () => {
    const xml = '<mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" .../>';
    const wrapped = wrapWithMxFile(xml);
    // 应该只保留一份 root cells, 原 LLM 重复的被去掉
    const id0Count = (wrapped.match(/id="0"/g) ?? []).length;
    expect(id0Count).toBe(1);
  });

  it("isRealDiagram 按 MIN_REAL_DIAGRAM_LENGTH 阈值判定", () => {
    expect(isRealDiagram(undefined)).toBe(false);
    expect(isRealDiagram("")).toBe(false);
    expect(isRealDiagram("a".repeat(MIN_REAL_DIAGRAM_LENGTH - 1))).toBe(false);
    expect(isRealDiagram("a".repeat(MIN_REAL_DIAGRAM_LENGTH + 1))).toBe(true);
  });
});
