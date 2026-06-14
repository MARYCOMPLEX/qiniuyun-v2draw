import { describe, expect, it, vi } from "vitest";

import {
  applyAppendDiagram,
  applyDisplayDiagram,
  applyEditDiagram,
} from "@/features/diagram/dispatchers/drawio-dispatcher";
import type {
  AppendDiagramCommand,
  DisplayDiagramCommand,
  EditDiagramCommand,
} from "@/shared/types/drawio-tools";

const baseChart = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Old" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;

const makeCtx = (chartXML: string = "") => {
  const loadDiagram = vi.fn((_xml: string) => null);
  return {
    ctx: { chartXML, loadDiagram },
    loadDiagram,
  };
};

describe("applyEditDiagram — 局部编辑 + 流式守卫", () => {
  it("update 操作只替换目标 cell, 其他 cell 保留", () => {
    const { ctx, loadDiagram } = makeCtx(baseChart);
    const cmd: EditDiagramCommand = {
      tool: "drawio.edit_diagram",
      operations: [
        {
          operation: "update",
          cell_id: "2",
          new_xml: '<mxCell id="2" value="Redis" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>',
        },
      ],
    };
    applyEditDiagram(cmd, ctx);
    expect(loadDiagram).toHaveBeenCalledOnce();
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).toContain('value="Redis"');
    expect(out).not.toContain('value="Old"');
    expect(out).toContain('<mxCell id="0"/>');
  });

  it("delete 操作只删目标 cell", () => {
    const { ctx, loadDiagram } = makeCtx(baseChart);
    const cmd: EditDiagramCommand = {
      tool: "drawio.edit_diagram",
      operations: [{ operation: "delete", cell_id: "2" }],
    };
    applyEditDiagram(cmd, ctx);
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).not.toContain('id="2"');
    expect(out).toContain('<mxCell id="0"/>');
  });

  it("add 操作把新 cell 插到 </root> 前", () => {
    const { ctx, loadDiagram } = makeCtx(baseChart);
    const cmd: EditDiagramCommand = {
      tool: "drawio.edit_diagram",
      operations: [
        {
          operation: "add",
          cell_id: "9",
          new_xml: '<mxCell id="9" value="New" vertex="1" parent="1"/>',
        },
      ],
    };
    applyEditDiagram(cmd, ctx);
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).toContain('id="9"');
    expect(out).toContain('value="New"');
    expect(out).toContain('value="Old"');
  });

  it("缺 cell_id 的 op 被静默跳过, 不抛 'replace of undefined'", () => {
    const { ctx, loadDiagram } = makeCtx(baseChart);
    // 模拟流式中间帧: operation 已到, cell_id 还没补
    const cmd = {
      tool: "drawio.edit_diagram",
      operations: [
        { operation: "update" } as unknown as { operation: "update"; cell_id: string },
      ],
    } as EditDiagramCommand;
    expect(() => applyEditDiagram(cmd, ctx)).not.toThrow();
    // 跳过该 op, xml 原样回灌
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).toBe(baseChart);
  });

  it("空 cell_id 字符串也被跳过", () => {
    const { ctx, loadDiagram } = makeCtx(baseChart);
    const cmd: EditDiagramCommand = {
      tool: "drawio.edit_diagram",
      operations: [{ operation: "delete", cell_id: "" }],
    };
    expect(() => applyEditDiagram(cmd, ctx)).not.toThrow();
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).toBe(baseChart);
  });

  it("画布空时, edit 退化为 display 取 add 操作的 new_xml", () => {
    const { ctx, loadDiagram } = makeCtx("");
    const cmd: EditDiagramCommand = {
      tool: "drawio.edit_diagram",
      operations: [
        {
          operation: "add",
          cell_id: "2",
          new_xml: '<mxCell id="2" value="X" vertex="1" parent="1"/>',
        },
      ],
    };
    applyEditDiagram(cmd, ctx);
    expect(loadDiagram).toHaveBeenCalledOnce();
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).toContain("<mxfile>");
    expect(out).toContain('id="2"');
  });
});

describe("applyDisplayDiagram", () => {
  it("整张重画, 包成 mxfile 后回灌", () => {
    const { ctx, loadDiagram } = makeCtx("");
    const cmd: DisplayDiagramCommand = {
      tool: "drawio.display_diagram",
      xml: '<mxCell id="2" value="A" vertex="1" parent="1"/>',
    };
    applyDisplayDiagram(cmd, ctx);
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).toContain("<mxfile>");
    expect(out).toContain('id="2"');
  });
});

describe("applyAppendDiagram", () => {
  it("空画布时 append 等于 display", () => {
    const { ctx, loadDiagram } = makeCtx("");
    const cmd: AppendDiagramCommand = {
      tool: "drawio.append_diagram",
      xml: '<mxCell id="2" value="A" vertex="1" parent="1"/>',
    };
    applyAppendDiagram(cmd, ctx);
    expect(loadDiagram).toHaveBeenCalledOnce();
    const out = loadDiagram.mock.calls[0]![0];
    expect(out).toContain('id="2"');
  });
});
