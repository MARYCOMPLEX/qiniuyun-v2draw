/**
 * Session / Turn Repository — 封装 SQLite CRUD, 暴露领域语义的方法。
 *
 * 调用方 (route handler / service) 只看 listSessions / getSessionWithTurns 这种方法,
 * 不关心 SQL 细节。
 *
 * 设计:
 * - id 用前端传入 (allocateSessionId / allocateTurnId), 跨进程一致
 * - 时间戳统一 epoch ms (Date.now())
 * - actions JSON 序列化在 Repo 内做, 调用方拿到结构化对象
 * - createSession 不接 chartXML 字段 (新建必空), 后续用 updateChartXML 推
 */

import { getDb } from "./connection";

export interface SessionAction {
  readonly tool: string;
  readonly summary: string;
  readonly status: "pending" | "running" | "done" | "failed";
  readonly error?: string;
  readonly layerId?: string;
}

export interface TurnRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly turnIndex: number;
  readonly userUtterance: string;
  readonly narration: string | null;
  readonly actions: ReadonlyArray<SessionAction>;
  readonly status: "streaming" | "executing" | "done" | "failed";
  readonly createdAt: number;
}

export interface SessionRecord {
  readonly id: string;
  readonly title: string;
  readonly chartXML: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SessionWithTurns extends SessionRecord {
  readonly turns: ReadonlyArray<TurnRecord>;
}

interface SessionRow {
  id: string;
  title: string;
  chart_xml: string;
  created_at: number;
  updated_at: number;
}

interface TurnRow {
  id: string;
  session_id: string;
  turn_index: number;
  user_utterance: string;
  narration: string | null;
  actions_json: string;
  status: TurnRecord["status"];
  created_at: number;
}

const rowToSession = (row: SessionRow): SessionRecord => ({
  id: row.id,
  title: row.title,
  chartXML: row.chart_xml,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToTurn = (row: TurnRow): TurnRecord => {
  let actions: ReadonlyArray<SessionAction> = [];
  try {
    const parsed = JSON.parse(row.actions_json);
    if (Array.isArray(parsed)) actions = parsed as SessionAction[];
  } catch {
    // 损坏数据降级为空 actions, 不抛错; 调用方仍能看到 utterance/narration
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    turnIndex: row.turn_index,
    userUtterance: row.user_utterance,
    narration: row.narration,
    actions,
    status: row.status,
    createdAt: row.created_at,
  };
};

export function createSession(input: {
  id: string;
  title: string;
}): SessionRecord {
  const now = Date.now();
  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (id, title, chart_xml, created_at, updated_at)
     VALUES (?, ?, '', ?, ?)`,
  ).run(input.id, input.title, now, now);

  return {
    id: input.id,
    title: input.title,
    chartXML: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function listSessions(): ReadonlyArray<SessionRecord> {
  const rows = getDb()
    .prepare(
      `SELECT id, title, chart_xml, created_at, updated_at
       FROM sessions
       ORDER BY updated_at DESC`,
    )
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export function getSession(id: string): SessionRecord | null {
  const row = getDb()
    .prepare(
      `SELECT id, title, chart_xml, created_at, updated_at
       FROM sessions WHERE id = ?`,
    )
    .get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function updateChartXML(sessionId: string, chartXML: string): void {
  getDb()
    .prepare(
      `UPDATE sessions SET chart_xml = ?, updated_at = ? WHERE id = ?`,
    )
    .run(chartXML, Date.now(), sessionId);
}

export function renameSession(sessionId: string, title: string): void {
  getDb()
    .prepare(
      `UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`,
    )
    .run(title, Date.now(), sessionId);
}

export function deleteSession(sessionId: string): void {
  // ON DELETE CASCADE 会一起删 turns
  getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

export function listTurns(sessionId: string): ReadonlyArray<TurnRecord> {
  const rows = getDb()
    .prepare(
      `SELECT id, session_id, turn_index, user_utterance, narration,
              actions_json, status, created_at
       FROM turns
       WHERE session_id = ?
       ORDER BY created_at ASC`,
    )
    .all(sessionId) as TurnRow[];
  return rows.map(rowToTurn);
}

export function getSessionWithTurns(id: string): SessionWithTurns | null {
  const session = getSession(id);
  if (!session) return null;
  return { ...session, turns: listTurns(id) };
}

export interface UpsertTurnInput {
  readonly id: string;
  readonly sessionId: string;
  readonly turnIndex: number;
  readonly userUtterance: string;
  readonly narration: string | null;
  readonly actions: ReadonlyArray<SessionAction>;
  readonly status: TurnRecord["status"];
  readonly createdAt?: number;
}

/**
 * upsert turn — 同 id 已存在则覆盖 (前端 streaming 中多次 patch 同一 turn)。
 * createdAt 仅插入时使用, 更新时保留原值。
 */
export function upsertTurn(input: UpsertTurnInput): TurnRecord {
  const now = input.createdAt ?? Date.now();
  const actionsJson = JSON.stringify(input.actions);
  getDb()
    .prepare(
      `INSERT INTO turns
        (id, session_id, turn_index, user_utterance, narration, actions_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_utterance = excluded.user_utterance,
         narration = excluded.narration,
         actions_json = excluded.actions_json,
         status = excluded.status`,
    )
    .run(
      input.id,
      input.sessionId,
      input.turnIndex,
      input.userUtterance,
      input.narration,
      actionsJson,
      input.status,
      now,
    );

  return {
    id: input.id,
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    userUtterance: input.userUtterance,
    narration: input.narration,
    actions: input.actions,
    status: input.status,
    createdAt: now,
  };
}

/**
 * 启动时若没有任何会话, 自动创建一个 "Untitled" 会话作为活动会话。
 * 返回当前最新会话 (最新 updated_at)。
 */
export function ensureDefaultSession(allocateId: () => string): SessionRecord {
  const sessions = listSessions();
  if (sessions.length > 0) return sessions[0]!;
  const id = allocateId();
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return createSession({
    id,
    title: `Untitled · ${dateStr}`,
  });
}
