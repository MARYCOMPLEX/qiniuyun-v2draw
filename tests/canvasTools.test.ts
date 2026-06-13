import { describe, expect, it } from "vitest";

import {
  canvasEnvelopeSchema,
  canvasCommandSchema,
} from "@/shared/types/canvas-tools";
import { CANVAS_TOOL, PLATFORM_TOOL, isCanvasTool, isPlatformTool, isAsyncTool, isHistoryTracked } from "@/shared/types/tools";

describe("canvasEnvelopeSchema (新协议)", () => {
  it("接受单条 canvas.generate_image envelope", () => {
    const parsed = canvasEnvelopeSchema.parse({
      commands: [
        {
          tool: CANVAS_TOOL.GENERATE_IMAGE,
          prompt: "a cute fox in forest",
        },
      ],
      narration: "正在画狐狸",
    });
    expect(parsed.commands).toHaveLength(1);
    expect(parsed.commands[0]!.tool).toBe(CANVAS_TOOL.GENERATE_IMAGE);
  });

  it("接受多条复合命令 (主题切换 + 生图)", () => {
    const parsed = canvasEnvelopeSchema.parse({
      commands: [
        {
          tool: PLATFORM_TOOL.SET_THEME,
          themeId: "SKILL_VAN_GOGH",
        },
        {
          tool: CANVAS_TOOL.GENERATE_BACKGROUND,
          prompt: "magical forest",
        },
        {
          tool: CANVAS_TOOL.GENERATE_CHARACTER,
          prompt: "cute red fox",
        },
      ],
    });
    expect(parsed.commands).toHaveLength(3);
  });

  it("接受 MOVE_LAYER 相对/绝对位移", () => {
    const rel = canvasCommandSchema.parse({
      tool: CANVAS_TOOL.MOVE_LAYER,
      targetLayerId: "l-1",
      delta: { dx: 50, dy: 0 },
    });
    expect(rel.tool).toBe(CANVAS_TOOL.MOVE_LAYER);

    const abs = canvasCommandSchema.parse({
      tool: CANVAS_TOOL.MOVE_LAYER,
      targetLayerId: "l-1",
      to: { x: 480, y: 320 },
    });
    expect(abs.tool).toBe(CANVAS_TOOL.MOVE_LAYER);
  });

  it("接受 INPAINT_LAYER 含 maskPolygon", () => {
    const parsed = canvasCommandSchema.parse({
      tool: CANVAS_TOOL.INPAINT_LAYER,
      targetLayerId: "l-1",
      maskPolygon: {
        polygon: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
          { x: 100, y: 200 },
        ],
      },
      replacePrompt: "a yellow flower",
    });
    expect(parsed.tool).toBe(CANVAS_TOOL.INPAINT_LAYER);
  });

  it("接受 ARRANGE_LAYERS 批量布局", () => {
    const parsed = canvasCommandSchema.parse({
      tool: CANVAS_TOOL.ARRANGE_LAYERS,
      pattern: "grid",
      layerIds: ["l-1", "l-2", "l-3", "l-4"],
    });
    expect(parsed.tool).toBe(CANVAS_TOOL.ARRANGE_LAYERS);
  });

  it("接受 platform.zoom_canvas mode=fit", () => {
    const parsed = canvasCommandSchema.parse({
      tool: PLATFORM_TOOL.ZOOM_CANVAS,
      mode: "fit",
    });
    expect(parsed.tool).toBe(PLATFORM_TOOL.ZOOM_CANVAS);
  });

  it("拒绝未知 tool", () => {
    expect(() =>
      canvasEnvelopeSchema.parse({
        commands: [{ tool: "unknown.tool" }],
      }),
    ).toThrow();
  });

  it("拒绝空 commands", () => {
    expect(() => canvasEnvelopeSchema.parse({ commands: [] })).toThrow();
  });

  it("INPAINT 拒绝少于 3 个点的 polygon", () => {
    expect(() =>
      canvasCommandSchema.parse({
        tool: CANVAS_TOOL.INPAINT_LAYER,
        targetLayerId: "l-1",
        maskPolygon: {
          polygon: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        replacePrompt: "x",
      }),
    ).toThrow();
  });

  it("UPSCALE 只允许 2 或 4", () => {
    expect(() =>
      canvasCommandSchema.parse({
        tool: CANVAS_TOOL.UPSCALE_LAYER,
        targetLayerId: "l-1",
        scale: 3,
      }),
    ).toThrow();
  });

  it("GENERATE_VARIATIONS count 必须 2-4", () => {
    expect(() =>
      canvasCommandSchema.parse({
        tool: CANVAS_TOOL.GENERATE_VARIATIONS,
        prompt: "x",
        count: 1,
      }),
    ).toThrow();
    expect(() =>
      canvasCommandSchema.parse({
        tool: CANVAS_TOOL.GENERATE_VARIATIONS,
        prompt: "x",
        count: 5,
      }),
    ).toThrow();
  });
});

describe("tools 命名空间常量", () => {
  it("isCanvasTool / isPlatformTool 区分命名空间", () => {
    expect(isCanvasTool(CANVAS_TOOL.GENERATE_IMAGE)).toBe(true);
    expect(isCanvasTool(PLATFORM_TOOL.SET_THEME)).toBe(false);
    expect(isPlatformTool(PLATFORM_TOOL.SET_THEME)).toBe(true);
    expect(isPlatformTool(CANVAS_TOOL.GENERATE_IMAGE)).toBe(false);
  });

  it("isAsyncTool 识别异步生图工具", () => {
    expect(isAsyncTool(CANVAS_TOOL.GENERATE_IMAGE)).toBe(true);
    expect(isAsyncTool(CANVAS_TOOL.EDIT_IMAGE)).toBe(true);
    expect(isAsyncTool(CANVAS_TOOL.INPAINT_LAYER)).toBe(true);
    expect(isAsyncTool(CANVAS_TOOL.MOVE_LAYER)).toBe(false);
    expect(isAsyncTool(CANVAS_TOOL.DELETE_LAYER)).toBe(false);
    expect(isAsyncTool(PLATFORM_TOOL.SET_THEME)).toBe(false);
  });

  it("isHistoryTracked: 业务工具全入历史 + 主题切换入历史", () => {
    expect(isHistoryTracked(CANVAS_TOOL.GENERATE_IMAGE)).toBe(true);
    expect(isHistoryTracked(CANVAS_TOOL.MOVE_LAYER)).toBe(true);
    expect(isHistoryTracked(CANVAS_TOOL.DELETE_LAYER)).toBe(true);
    expect(isHistoryTracked(PLATFORM_TOOL.SET_THEME)).toBe(true);
    // 其他平台工具不入历史
    expect(isHistoryTracked(PLATFORM_TOOL.OPEN_PANEL)).toBe(false);
    expect(isHistoryTracked(PLATFORM_TOOL.TOGGLE_GRID)).toBe(false);
    expect(isHistoryTracked(PLATFORM_TOOL.ZOOM_CANVAS)).toBe(false);
    // UNDO 自身不入历史
    expect(isHistoryTracked(CANVAS_TOOL.UNDO)).toBe(false);
  });
});

describe("layer 类型", () => {
  it("allocateLayerId 生成不重复 id", async () => {
    const { allocateLayerId } = await import("@/shared/types/layer");
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add(allocateLayerId());
    }
    expect(ids.size).toBe(10);
    for (const id of ids) {
      expect(id.startsWith("l-")).toBe(true);
    }
  });
});
