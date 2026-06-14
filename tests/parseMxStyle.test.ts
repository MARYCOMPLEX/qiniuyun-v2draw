import { describe, expect, it } from "vitest";

import {
  parseEdgeStyle,
  parseNodeStyle,
  tokenizeStyle,
} from "@/features/diagram/svg/parseMxStyle";

describe("tokenizeStyle", () => {
  it("空字符串返回空 record", () => {
    expect(tokenizeStyle("")).toEqual({});
    expect(tokenizeStyle(null)).toEqual({});
    expect(tokenizeStyle(undefined)).toEqual({});
  });

  it("k=v 拆开", () => {
    expect(tokenizeStyle("rounded=1;fillColor=#abc;")).toEqual({
      rounded: "1",
      fillColor: "#abc",
    });
  });

  it("无值 token 视为 shape 别名 (mxgraph 老语法)", () => {
    expect(tokenizeStyle("cylinder;fillColor=#abc")).toEqual({
      shape: "cylinder",
      fillColor: "#abc",
    });
  });

  it("容忍多余空格和末尾分号", () => {
    expect(tokenizeStyle("  rounded = 1 ; fillColor=#abc ; ")).toEqual({
      rounded: "1",
      fillColor: "#abc",
    });
  });
});

describe("parseNodeStyle", () => {
  it("默认矩形 (无 style)", () => {
    expect(parseNodeStyle(null).kind).toBe("rect");
    expect(parseNodeStyle("").kind).toBe("rect");
  });

  it("rounded=1 → rounded-rect", () => {
    const s = parseNodeStyle("rounded=1;fillColor=#dae8fc;");
    expect(s.kind).toBe("rounded-rect");
    expect(s.fillColor).toBe("#dae8fc");
  });

  it("shape=cylinder → cylinder", () => {
    expect(parseNodeStyle("shape=cylinder;fillColor=#f8cecc;").kind).toBe(
      "cylinder",
    );
  });

  it("shape=ellipse / rhombus", () => {
    expect(parseNodeStyle("shape=ellipse;").kind).toBe("ellipse");
    expect(parseNodeStyle("shape=rhombus;").kind).toBe("rhombus");
  });

  it("shape=image 解析 imageUrl", () => {
    const s = parseNodeStyle(
      "shape=image;image=https://example.com/x.png;imageAspect=1;",
    );
    expect(s.kind).toBe("image");
    expect(s.imageUrl).toBe("https://example.com/x.png");
  });

  it("拒绝 javascript: 协议的 image (XSS 防御)", () => {
    const s = parseNodeStyle(
      "shape=image;image=javascript:alert(1);imageAspect=1;",
    );
    expect(s.kind).toBe("image");
    expect(s.imageUrl).toBeUndefined();
  });

  it("接受 data:image/* (无 base64 分号干扰)", () => {
    const s = parseNodeStyle(
      "shape=image;image=data:image/png,abc;imageAspect=1;",
    );
    expect(s.kind).toBe("image");
    expect(s.imageUrl).toBe("data:image/png,abc");
  });

  it("非法 hex 颜色被丢弃", () => {
    const s = parseNodeStyle("rounded=1;fillColor=red;");
    expect(s.fillColor).toBeUndefined();
  });

  it("fillColor=none 保留 (透明背景)", () => {
    const s = parseNodeStyle("rounded=1;fillColor=none;");
    expect(s.fillColor).toBe("none");
  });
});

describe("parseEdgeStyle", () => {
  it("默认带箭头, 无 orthogonal", () => {
    const s = parseEdgeStyle("");
    expect(s.endArrow).toBe(true);
    expect(s.orthogonal).toBe(false);
  });

  it("endArrow=none → 无箭头", () => {
    expect(parseEdgeStyle("endArrow=none;").endArrow).toBe(false);
  });

  it("edgeStyle=orthogonalEdgeStyle → orthogonal", () => {
    expect(parseEdgeStyle("edgeStyle=orthogonalEdgeStyle;").orthogonal).toBe(
      true,
    );
  });

  it("exit/entry 锚点解析为 0..1 浮点", () => {
    const s = parseEdgeStyle("exitX=1;exitY=0.5;entryX=0;entryY=0.5;");
    expect(s.exitX).toBe(1);
    expect(s.exitY).toBe(0.5);
    expect(s.entryX).toBe(0);
    expect(s.entryY).toBe(0.5);
  });
});
