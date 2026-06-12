import { describe, expect, it } from "vitest";

import {
  COMMAND_TYPE,
  drawToolSchema,
  isClearCanvas,
  isCreateShapes,
  isDeleteShape,
  isModifyShape,
  isStyleTransform,
} from "@/shared/types/schema";

describe("drawToolSchema", () => {
  it("接受单条 CREATE_SHAPES envelope", () => {
    const parsed = drawToolSchema.parse({
      commands: [
        {
          commandType: COMMAND_TYPE.CREATE_SHAPES,
          activeStyleId: "SKILL_CYBER_PUNK",
          shapes: [
            {
              id: "c-1",
              shape: "circle",
              position: { x: 100, y: 200 },
              size: 50,
              useAccentColor: true,
            },
          ],
        },
      ],
      narration: "已生成",
    });
    expect(parsed.commands).toHaveLength(1);
    expect(isCreateShapes(parsed.commands[0]!)).toBe(true);
  });

  it("接受 MODIFY/DELETE/CLEAR/STYLE 复合命令", () => {
    const parsed = drawToolSchema.parse({
      commands: [
        { commandType: COMMAND_TYPE.MODIFY_SHAPE, targetId: "c-1", patch: { size: 80 } },
        { commandType: COMMAND_TYPE.DELETE_SHAPE, targetId: "c-2" },
        { commandType: COMMAND_TYPE.CLEAR_CANVAS },
        { commandType: COMMAND_TYPE.STYLE_TRANSFORM, activeStyleId: "SKILL_VAN_GOGH" },
      ],
    });
    expect(parsed.commands).toHaveLength(4);
    expect(isModifyShape(parsed.commands[0]!)).toBe(true);
    expect(isDeleteShape(parsed.commands[1]!)).toBe(true);
    expect(isClearCanvas(parsed.commands[2]!)).toBe(true);
    expect(isStyleTransform(parsed.commands[3]!)).toBe(true);
  });

  it("拒绝未知 commandType (discriminator guard)", () => {
    expect(() =>
      drawToolSchema.parse({
        commands: [{ commandType: "UNKNOWN" }],
      }),
    ).toThrow();
  });

  it("拒绝空 commands 数组", () => {
    expect(() => drawToolSchema.parse({ commands: [] })).toThrow();
  });

  it("CREATE_SHAPES 缺 shapes 字段直接失败", () => {
    expect(() =>
      drawToolSchema.parse({
        commands: [
          { commandType: COMMAND_TYPE.CREATE_SHAPES, activeStyleId: "SKILL_CYBER_PUNK" },
        ],
      }),
    ).toThrow();
  });

  it("MODIFY_SHAPE 接受空 patch (不改任何字段也合法)", () => {
    const parsed = drawToolSchema.parse({
      commands: [
        { commandType: COMMAND_TYPE.MODIFY_SHAPE, targetId: "x", patch: {} },
      ],
    });
    expect(isModifyShape(parsed.commands[0]!)).toBe(true);
  });
});
