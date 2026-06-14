import { describe, expect, it } from "vitest";

import { buildImageMxCell } from "@/features/diagram/utils/imageMxCell";

describe("buildImageMxCell", () => {
  it("生成符合 drawio 协议的 image mxCell XML", () => {
    const xml = buildImageMxCell({
      id: "l-test",
      imageUrl: "https://example.com/fox.png",
    });
    expect(xml).toContain('id="l-test"');
    expect(xml).toContain("shape=image");
    expect(xml).toContain("image=https://example.com/fox.png");
    expect(xml).toContain("imageAspect=1");
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('parent="1"');
    expect(xml).toContain("<mxGeometry");
  });

  it("默认位置 (200, 100), 默认尺寸 400x400", () => {
    const xml = buildImageMxCell({
      id: "x",
      imageUrl: "u",
    });
    expect(xml).toContain('x="200"');
    expect(xml).toContain('y="100"');
    expect(xml).toContain('width="400"');
    expect(xml).toContain('height="400"');
  });

  it("可指定位置和尺寸", () => {
    const xml = buildImageMxCell({
      id: "x",
      imageUrl: "u",
      position: { x: 100, y: 50 },
      size: { width: 160, height: 160 },
    });
    expect(xml).toContain('x="100"');
    expect(xml).toContain('y="50"');
    expect(xml).toContain('width="160"');
    expect(xml).toContain('height="160"');
  });

  it("aspectLocked=false 时 imageAspect=0 (允许拉伸)", () => {
    const xml = buildImageMxCell({
      id: "x",
      imageUrl: "u",
      aspectLocked: false,
    });
    expect(xml).toContain("imageAspect=0");
  });

  it("imageUrl 含双引号会被 HTML 实体转义", () => {
    const xml = buildImageMxCell({
      id: "x",
      imageUrl: 'https://x.com/path?a="b"',
    });
    expect(xml).not.toContain('?a="b"');
    expect(xml).toContain("&quot;b&quot;");
  });
});
