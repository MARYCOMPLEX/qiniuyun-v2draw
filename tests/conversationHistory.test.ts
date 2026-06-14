import { describe, expect, it } from "vitest";

import {
  buildHistoryMessages,
  type ConversationTurn,
} from "@/features/canvas/types/conversation";

const makeTurn = (overrides: Partial<ConversationTurn>): ConversationTurn => ({
  id: "t-1",
  timestamp: 0,
  userUtterance: "u",
  narration: "n",
  actions: [],
  status: "done",
  turnIndex: 1,
  ...overrides,
});

describe("buildHistoryMessages", () => {
  it("空 turns 返回空数组", () => {
    expect(buildHistoryMessages([], 5)).toEqual([]);
  });

  it("maxTurns=0 永远返回空", () => {
    const turns = [makeTurn({ id: "t-1" })];
    expect(buildHistoryMessages(turns, 0)).toEqual([]);
  });

  it("跳过 narration 为空的 turn (streaming 未完成)", () => {
    const turns = [
      makeTurn({ id: "t-1", userUtterance: "画狐狸", narration: null }),
    ];
    expect(buildHistoryMessages(turns, 5)).toEqual([]);
  });

  it("跳过 userUtterance 为空白的 turn", () => {
    const turns = [
      makeTurn({ id: "t-1", userUtterance: "   ", narration: "已生成" }),
    ];
    expect(buildHistoryMessages(turns, 5)).toEqual([]);
  });

  it("有效 turn 拍成 user+assistant 配对", () => {
    const turns = [
      makeTurn({ id: "t-1", userUtterance: "画狐狸", narration: "狐狸生成中" }),
    ];
    expect(buildHistoryMessages(turns, 5)).toEqual([
      { role: "user", content: "画狐狸" },
      { role: "assistant", content: "狐狸生成中" },
    ]);
  });

  it("超过 maxTurns 时只保留尾部最近 N 个 turn", () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({
        id: `t-${i}`,
        userUtterance: `u${i}`,
        narration: `n${i}`,
      }),
    );
    const result = buildHistoryMessages(turns, 3);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ role: "user", content: "u7" });
    expect(result[5]).toEqual({ role: "assistant", content: "n9" });
  });

  it("混合有效与无效 turn 时按顺序保留有效", () => {
    const turns = [
      makeTurn({ id: "t-1", userUtterance: "画狐狸", narration: "已画" }),
      makeTurn({ id: "t-2", userUtterance: "再来", narration: null }),
      makeTurn({ id: "t-3", userUtterance: "切风格", narration: "已切" }),
    ];
    const result = buildHistoryMessages(turns, 5);
    expect(result).toEqual([
      { role: "user", content: "画狐狸" },
      { role: "assistant", content: "已画" },
      { role: "user", content: "切风格" },
      { role: "assistant", content: "已切" },
    ]);
  });
});
