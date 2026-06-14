import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, setTestDb } from "@/shared/db/connection";
import { runMigrations } from "@/shared/db/migrations";
import { createSession, listSessions } from "@/shared/db/sessionRepo";

// 路由直接 import 调用
import { GET as listGET, POST as createPOST } from "@/app/api/sessions/route";
import {
  DELETE as sessionDELETE,
  GET as sessionGET,
  PATCH as sessionPATCH,
} from "@/app/api/sessions/[id]/route";
import {
  GET as turnsGET,
  POST as turnsPOST,
} from "@/app/api/sessions/[id]/turns/route";

beforeEach(() => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  setTestDb(db);
});

afterEach(() => {
  closeDb();
});

const jsonReq = (path: string, method: string, body?: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/sessions GET (list)", () => {
  it("空库时 ensureDefaultSession 自动创建首会话", async () => {
    const res = await listGET();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toMatch(/^Untitled · /);
  });

  it("已有会话时返回列表 DESC", async () => {
    createSession({ id: "s-1", title: "First" });
    await new Promise((r) => setTimeout(r, 5));
    createSession({ id: "s-2", title: "Second" });
    const res = await listGET();
    const body = await res.json();
    expect(body.data[0].id).toBe("s-2");
  });
});

describe("/api/sessions POST (create)", () => {
  it("无 body 默认 title 'Untitled · YYYY-MM-DD'", async () => {
    const res = await createPOST(jsonReq("/api/sessions", "POST", {}));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toMatch(/^Untitled · \d{4}-\d{2}-\d{2}$/);
  });

  it("带 title 创建", async () => {
    const res = await createPOST(jsonReq("/api/sessions", "POST", { title: "My Project" }));
    const body = await res.json();
    expect(body.data.title).toBe("My Project");
  });

  it("空白 title 退化为默认", async () => {
    const res = await createPOST(jsonReq("/api/sessions", "POST", { title: "   " }));
    const body = await res.json();
    expect(body.data.title).toMatch(/^Untitled · /);
  });

  it("title 超长 (>120) 拒绝 422", async () => {
    const res = await createPOST(
      jsonReq("/api/sessions", "POST", { title: "a".repeat(121) }),
    );
    expect(res.status).toBe(422);
  });
});

describe("/api/sessions/[id] GET / PATCH / DELETE", () => {
  beforeEach(() => {
    createSession({ id: "s-1", title: "Test" });
  });

  it("GET 不存在 → 404", async () => {
    const res = await sessionGET(jsonReq("/x", "GET"), ctx("s-not-exist"));
    expect(res.status).toBe(404);
  });

  it("GET 返回 session + turns", async () => {
    const res = await sessionGET(jsonReq("/x", "GET"), ctx("s-1"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("s-1");
    expect(body.data.turns).toEqual([]);
  });

  it("PATCH title 改名", async () => {
    await sessionPATCH(
      jsonReq("/x", "PATCH", { title: "Renamed" }),
      ctx("s-1"),
    );
    const res = await sessionGET(jsonReq("/x", "GET"), ctx("s-1"));
    const body = await res.json();
    expect(body.data.title).toBe("Renamed");
  });

  it("PATCH chartXML 更新画布", async () => {
    await sessionPATCH(
      jsonReq("/x", "PATCH", { chartXML: "<mxfile/>" }),
      ctx("s-1"),
    );
    const res = await sessionGET(jsonReq("/x", "GET"), ctx("s-1"));
    const body = await res.json();
    expect(body.data.chartXML).toBe("<mxfile/>");
  });

  it("PATCH 空 body → 422", async () => {
    const res = await sessionPATCH(
      jsonReq("/x", "PATCH", {}),
      ctx("s-1"),
    );
    expect(res.status).toBe(422);
  });

  it("DELETE 删除", async () => {
    await sessionDELETE(jsonReq("/x", "DELETE"), ctx("s-1"));
    expect(listSessions()).toHaveLength(0);
  });
});

describe("/api/sessions/[id]/turns GET / POST", () => {
  beforeEach(() => {
    createSession({ id: "s-1", title: "Test" });
  });

  it("POST upsert turn", async () => {
    const res = await turnsPOST(
      jsonReq("/x", "POST", {
        id: "t-1",
        turnIndex: 1,
        userUtterance: "画狐狸",
        narration: "狐狸生成中",
        actions: [{ tool: "canvas.generate_image", summary: "生图", status: "running" }],
        status: "executing",
      }),
      ctx("s-1"),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("t-1");
  });

  it("POST 父会话不存在 → 404", async () => {
    const res = await turnsPOST(
      jsonReq("/x", "POST", {
        id: "t-1",
        turnIndex: 1,
        userUtterance: "x",
        narration: null,
        actions: [],
        status: "done",
      }),
      ctx("s-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("POST 同 id 二次写覆盖", async () => {
    await turnsPOST(
      jsonReq("/x", "POST", {
        id: "t-1",
        turnIndex: 1,
        userUtterance: "x",
        narration: null,
        actions: [],
        status: "streaming",
      }),
      ctx("s-1"),
    );
    await turnsPOST(
      jsonReq("/x", "POST", {
        id: "t-1",
        turnIndex: 1,
        userUtterance: "x",
        narration: "完成",
        actions: [{ tool: "x", summary: "y", status: "done" }],
        status: "done",
      }),
      ctx("s-1"),
    );
    const res = await turnsGET(jsonReq("/x", "GET"), ctx("s-1"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe("done");
  });

  it("POST userUtterance 超长 → 422", async () => {
    const res = await turnsPOST(
      jsonReq("/x", "POST", {
        id: "t-1",
        turnIndex: 1,
        userUtterance: "u".repeat(2001),
        narration: null,
        actions: [],
        status: "done",
      }),
      ctx("s-1"),
    );
    expect(res.status).toBe(422);
  });

  it("GET 父会话不存在 → 404", async () => {
    const res = await turnsGET(jsonReq("/x", "GET"), ctx("s-not-exist"));
    expect(res.status).toBe(404);
  });
});
