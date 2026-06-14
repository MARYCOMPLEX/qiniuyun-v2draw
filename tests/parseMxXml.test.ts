import { describe, expect, it } from "vitest";

import { parseMxXml } from "@/features/diagram/svg/parseMxXml";

const wrap = (cells: string): string =>
  `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;

describe("parseMxXml", () => {
  it("空 / null 返回空模型", () => {
    expect(parseMxXml("")).toEqual({ nodes: [], edges: [] });
    expect(parseMxXml(null)).toEqual({ nodes: [], edges: [] });
    expect(parseMxXml(undefined)).toEqual({ nodes: [], edges: [] });
  });

  it("跳过 root cells (id=0 / id=1)", () => {
    const result = parseMxXml(wrap(""));
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("解析单个矩形节点 (含几何)", () => {
    const xml = wrap(
      '<mxCell id="2" value="Frontend" style="rounded=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60" as="geometry"/></mxCell>',
    );
    const { nodes, edges } = parseMxXml(xml);
    expect(edges).toHaveLength(0);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "2",
      value: "Frontend",
      geometry: { x: 100, y: 100, width: 120, height: 60 },
      style: { kind: "rounded-rect", fillColor: "#dae8fc" },
    });
  });

  it("解析圆柱节点 (shape=cylinder)", () => {
    const xml = wrap(
      '<mxCell id="4" value="Database" style="shape=cylinder;fillColor=#f8cecc;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>',
    );
    const { nodes } = parseMxXml(xml);
    expect(nodes[0]!.style.kind).toBe("cylinder");
  });

  it("解析边 (edge=1) 含 source / target", () => {
    const xml = wrap(
      '<mxCell id="5" style="endArrow=classic;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>',
    );
    const { nodes, edges } = parseMxXml(xml);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      id: "5",
      source: "2",
      target: "3",
      style: { endArrow: true },
    });
  });

  it("解析多节点 + 多边 (混合)", () => {
    const xml = wrap(
      '<mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell>' +
        '<mxCell id="3" value="B" vertex="1" parent="1"><mxGeometry x="200" y="0" width="100" height="50" as="geometry"/></mxCell>' +
        '<mxCell id="4" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>',
    );
    const { nodes, edges } = parseMxXml(xml);
    expect(nodes.map((n) => n.id)).toEqual(["2", "3"]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.source).toBe("2");
    expect(edges[0]!.target).toBe("3");
  });

  it("解析 image mxCell (LLM 生成图注入)", () => {
    const xml = wrap(
      '<mxCell id="img-1" style="shape=image;image=https://example.com/fox.png;imageAspect=1;" vertex="1" parent="1"><mxGeometry x="200" y="100" width="400" height="400" as="geometry"/></mxCell>',
    );
    const { nodes } = parseMxXml(xml);
    expect(nodes[0]!.style.kind).toBe("image");
    expect(nodes[0]!.style.imageUrl).toBe("https://example.com/fox.png");
  });

  it("self-closing mxCell 无 geometry 时给默认 0 值", () => {
    const xml = wrap('<mxCell id="2" value="X" vertex="1" parent="1"/>');
    const { nodes } = parseMxXml(xml);
    expect(nodes[0]!.geometry).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("解码 XML entity (&amp; / &lt; / &quot;)", () => {
    const xml = wrap(
      '<mxCell id="2" value="A &amp; B &lt;/&gt;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="50" height="20" as="geometry"/></mxCell>',
    );
    const { nodes } = parseMxXml(xml);
    expect(nodes[0]!.value).toBe("A & B </>");
  });

  it("缺 source/target 的边降级为 source='' target=''", () => {
    const xml = wrap('<mxCell id="5" edge="1" parent="1"/>');
    const { edges } = parseMxXml(xml);
    expect(edges[0]!.source).toBe("");
    expect(edges[0]!.target).toBe("");
  });
});
