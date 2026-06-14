import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, setTestDb } from "@/shared/db/connection";
import { runMigrations } from "@/shared/db/migrations";
import {
  createSession,
  deleteSession,
  ensureDefaultSession,
  getSession,
  getSessionWithTurns,
  listSessions,
  listTurns,
  renameSession,
  updateChartXML,
  upsertTurn,
} from "@/shared/db/sessionRepo";

beforeEach(() => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  setTestDb(db);
});

afterEach(() => {
  closeDb();
});

describe("sessionRepo · sessions CRUD", () => {
  it("空库 listSessions 返回 []", () => {
    expect(listSessions()).toEqual([]);
  });

  it("createSession 然后 getSession 取回", () => {
    const created = createSession({ id: "s-1", title: "Test" });
    expect(created.id).toBe("s-1");
    expect(created.chartXML).toBe("");
    const got = getSession("s-1");
    expect(got?.title).toBe("Test");
  });

  it("listSessions 按 updated_at DESC 排序", () => {
    createSession({ id: "s-1", title: "First" });
    // 等 1ms 让 updated_at 不同
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    return wait(2).then(() => {
      createSession({ id: "s-2", title: "Second" });
      const list = listSessions();
      expect(list[0]!.id).toBe("s-2");
      expect(list[1]!.id).toBe("s-1");
    });
  });

  it("updateChartXML 更新内容 + 推 updated_at", async () => {
    createSession({ id: "s-1", title: "X" });
    const before = getSession("s-1")!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    updateChartXML("s-1", "<mxfile/>");
    const after = getSession("s-1")!;
    expect(after.chartXML).toBe("<mxfile/>");
    expect(after.updatedAt).toBeGreaterThan(before);
  });

  it("renameSession 改 title", () => {
    createSession({ id: "s-1", title: "Old" });
    renameSession("s-1", "New");
    expect(getSession("s-1")!.title).toBe("New");
  });

  it("deleteSession 级联删 turns (FK ON DELETE CASCADE)", () => {
    createSession({ id: "s-1", title: "X" });
    upsertTurn({
      id: "t-1",
      sessionId: "s-1",
      turnIndex: 1,
      userUtterance: "u",
      narration: null,
      actions: [],
      status: "done",
    });
    expect(listTurns("s-1")).toHaveLength(1);
    deleteSession("s-1");
    expect(getSession("s-1")).toBeNull();
    expect(listTurns("s-1")).toHaveLength(0);
  });
});

describe("sessionRepo · turns", () => {
  beforeEach(() => {
    createSession({ id: "s-1", title: "Test" });
  });

  it("upsertTurn 新增 + 反序列化 actions", () => {
    upsertTurn({
      id: "t-1",
      sessionId: "s-1",
      turnIndex: 1,
      userUtterance: "画狐狸",
      narration: "狐狸生成中",
      actions: [
        { tool: "canvas.generate_image", summary: "生图", status: "running" },
      ],
      status: "executing",
    });
    const turns = listTurns("s-1");
    expect(turns).toHaveLength(1);
    expect(turns[0]!.userUtterance).toBe("画狐狸");
    expect(turns[0]!.actions).toHaveLength(1);
    expect(turns[0]!.actions[0]!.tool).toBe("canvas.generate_image");
  });

  it("upsertTurn 同 id 覆盖 (streaming 中多次 patch)", () => {
    upsertTurn({
      id: "t-1",
      sessionId: "s-1",
      turnIndex: 1,
      userUtterance: "X",
      narration: null,
      actions: [],
      status: "streaming",
    });
    upsertTurn({
      id: "t-1",
      sessionId: "s-1",
      turnIndex: 1,
      userUtterance: "X",
      narration: "完成",
      actions: [{ tool: "x", summary: "y", status: "done" }],
      status: "done",
    });
    const turns = listTurns("s-1");
    expect(turns).toHaveLength(1);
    expect(turns[0]!.status).toBe("done");
    expect(turns[0]!.narration).toBe("完成");
  });

  it("listTurns 按 created_at ASC 排序", async () => {
    upsertTurn({
      id: "t-1",
      sessionId: "s-1",
      turnIndex: 1,
      userUtterance: "u1",
      narration: null,
      actions: [],
      status: "done",
    });
    await new Promise((r) => setTimeout(r, 5));
    upsertTurn({
      id: "t-2",
      sessionId: "s-1",
      turnIndex: 2,
      userUtterance: "u2",
      narration: null,
      actions: [],
      status: "done",
    });
    const turns = listTurns("s-1");
    expect(turns.map((t) => t.id)).toEqual(["t-1", "t-2"]);
  });

  it("getSessionWithTurns 返回 session + turns", () => {
    upsertTurn({
      id: "t-1",
      sessionId: "s-1",
      turnIndex: 1,
      userUtterance: "u",
      narration: null,
      actions: [],
      status: "done",
    });
    const result = getSessionWithTurns("s-1");
    expect(result).not.toBeNull();
    expect(result!.turns).toHaveLength(1);
  });

  it("损坏的 actions_json 降级为空数组不抛错", async () => {
    upsertTurn({
      id: "t-1",
      sessionId: "s-1",
      turnIndex: 1,
      userUtterance: "u",
      narration: null,
      actions: [{ tool: "x", summary: "y", status: "done" }],
      status: "done",
    });
    // 直接改库, 模拟损坏
    const { getDb } = await import("@/shared/db/connection");
    getDb().prepare("UPDATE turns SET actions_json = ? WHERE id = ?").run("not json", "t-1");
    const turns = listTurns("s-1");
    expect(turns[0]!.actions).toEqual([]);
  });
});

describe("ensureDefaultSession", () => {
  it("空库时创建 Untitled session", () => {
    let counter = 0;
    const session = ensureDefaultSession(() => `s-auto-${++counter}`);
    expect(session.id).toBe("s-auto-1");
    expect(session.title).toMatch(/^Untitled · \d{4}-\d{2}-\d{2}$/);
    expect(listSessions()).toHaveLength(1);
  });

  it("已有会话时返回最新, 不重复创建", () => {
    createSession({ id: "s-existing", title: "Existing" });
    const session = ensureDefaultSession(() => "s-should-not-be-used");
    expect(session.id).toBe("s-existing");
    expect(listSessions()).toHaveLength(1);
  });
});
