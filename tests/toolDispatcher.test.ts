import { describe, expect, it } from "vitest";

import {
  buildFallbackMap,
  dispatchPartialEnvelope,
  type ShapeMap,
} from "@/features/art-canvas/utils/toolDispatcher";
import { COMMAND_TYPE, type PartialDrawTool } from "@/shared/types/schema";

const STYLE_ID = "SKILL_CYBER_PUNK" as const;

const completeCreate: PartialDrawTool = {
  commands: [
    {
      commandType: COMMAND_TYPE.CREATE_SHAPES,
      activeStyleId: STYLE_ID,
      shapes: [
        {
          id: "c-1",
          shape: "circle",
          position: { x: 100, y: 200 },
          size: 40,
          useAccentColor: true,
        },
      ],
    },
  ],
};

describe("dispatchPartialEnvelope", () => {
  it("半成品命令(缺字段)被丢弃, 返回原 map", () => {
    const partial: PartialDrawTool = {
      commands: [
        {
          commandType: COMMAND_TYPE.CREATE_SHAPES,
          activeStyleId: STYLE_ID,
          shapes: [{ id: "c-1", shape: "circle" } as never],
        },
      ],
    };
    const empty: ShapeMap = new Map();
    const { nextMap } = dispatchPartialEnvelope(partial, empty, STYLE_ID);
    expect(nextMap.size).toBe(0);
  });

  it("完整 CREATE_SHAPES 把图元加入 map, 解析风格 stroke", () => {
    const empty: ShapeMap = new Map();
    const { nextMap } = dispatchPartialEnvelope(completeCreate, empty, STYLE_ID);
    expect(nextMap.size).toBe(1);
    const shape = nextMap.get("c-1")!;
    expect(shape.shape).toBe("circle");
    expect(shape.size).toBe(40);
    expect(shape.stroke).toMatch(/^#|rgb/);
  });

  it("MODIFY_SHAPE 应用 patch, 不改未指定字段", () => {
    const seed = dispatchPartialEnvelope(completeCreate, new Map(), STYLE_ID).nextMap;
    const modify: PartialDrawTool = {
      commands: [
        { commandType: COMMAND_TYPE.MODIFY_SHAPE, targetId: "c-1", patch: { size: 90 } },
      ],
    };
    const { nextMap } = dispatchPartialEnvelope(modify, seed, STYLE_ID);
    const shape = nextMap.get("c-1")!;
    expect(shape.size).toBe(90);
    expect(shape.position).toEqual({ x: 100, y: 200 });
    expect(shape.shape).toBe("circle");
  });

  it("MODIFY_SHAPE 目标不存在 → 不抛错, map 不变", () => {
    const seed = dispatchPartialEnvelope(completeCreate, new Map(), STYLE_ID).nextMap;
    const modify: PartialDrawTool = {
      commands: [
        { commandType: COMMAND_TYPE.MODIFY_SHAPE, targetId: "ghost", patch: { size: 5 } },
      ],
    };
    const { nextMap } = dispatchPartialEnvelope(modify, seed, STYLE_ID);
    expect(nextMap.size).toBe(1);
    expect(nextMap.get("c-1")!.size).toBe(40);
  });

  it("DELETE_SHAPE 移除指定 id", () => {
    const seed = dispatchPartialEnvelope(completeCreate, new Map(), STYLE_ID).nextMap;
    const del: PartialDrawTool = {
      commands: [{ commandType: COMMAND_TYPE.DELETE_SHAPE, targetId: "c-1" }],
    };
    const { nextMap } = dispatchPartialEnvelope(del, seed, STYLE_ID);
    expect(nextMap.size).toBe(0);
  });

  it("CLEAR_CANVAS 清空整个 map", () => {
    const seed = dispatchPartialEnvelope(completeCreate, new Map(), STYLE_ID).nextMap;
    const clear: PartialDrawTool = {
      commands: [{ commandType: COMMAND_TYPE.CLEAR_CANVAS }],
    };
    const { nextMap } = dispatchPartialEnvelope(clear, seed, STYLE_ID);
    expect(nextMap.size).toBe(0);
  });

  it("STYLE_TRANSFORM 通过 sideEffect 上抛, 不改 map", () => {
    const seed = dispatchPartialEnvelope(completeCreate, new Map(), STYLE_ID).nextMap;
    const transform: PartialDrawTool = {
      commands: [
        { commandType: COMMAND_TYPE.STYLE_TRANSFORM, activeStyleId: "SKILL_VAN_GOGH" },
      ],
    };
    const { nextMap, sideEffect } = dispatchPartialEnvelope(transform, seed, STYLE_ID);
    expect(nextMap.size).toBe(1);
    expect(sideEffect.nextActiveStyleId).toBe("SKILL_VAN_GOGH");
  });

  it("混合命令一次应用 (clear + create 三个圆)", () => {
    const seed = dispatchPartialEnvelope(completeCreate, new Map(), STYLE_ID).nextMap;
    const mixed: PartialDrawTool = {
      commands: [
        { commandType: COMMAND_TYPE.CLEAR_CANVAS },
        {
          commandType: COMMAND_TYPE.CREATE_SHAPES,
          activeStyleId: STYLE_ID,
          shapes: [
            { id: "c-a", shape: "circle", position: { x: 0, y: 0 }, size: 10, useAccentColor: true },
            { id: "c-b", shape: "circle", position: { x: 0, y: 0 }, size: 20, useAccentColor: true },
            { id: "c-c", shape: "circle", position: { x: 0, y: 0 }, size: 30, useAccentColor: true },
          ],
        },
      ],
    };
    const { nextMap } = dispatchPartialEnvelope(mixed, seed, STYLE_ID);
    expect(nextMap.size).toBe(3);
  });
});

describe("buildFallbackMap", () => {
  it("返回单个默认圆, id 固定为 fallback-circle", () => {
    const map = buildFallbackMap(STYLE_ID);
    expect(map.size).toBe(1);
    expect(map.get("fallback-circle")?.shape).toBe("circle");
  });
});
