/**
 * Schema 迁移 — 用 PRAGMA user_version 跟踪当前版本, 跑未应用的迁移。
 *
 * 添加新迁移: 在 MIGRATIONS 数组末尾追加, 不要改已有迁移内容
 * (生产已有数据库会按版本号跳过应用过的迁移)。
 *
 * 当前 schema (v1):
 * - sessions: 会话, 一个 = 用户一段对话, 包含末状态 chartXML
 * - turns: 单条对话轮次 (user_utterance + agent_narration + commands JSON)
 *
 * 设计取舍:
 * - turns 不规范化 actions 字段, 存 JSON 字符串 (action 结构稳定但表项灵活)
 * - chartXML 存在 sessions 而不是末 turn, 方便 list 查询不 join
 * - 不存 layers (image layer) 元数据 — 当前架构 image 已经包成 image mxCell 进 chartXML
 */

import type { Database as Db } from "better-sqlite3";

interface Migration {
  readonly version: number;
  readonly sql: string;
}

const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        chart_xml TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
        ON sessions(updated_at DESC);

      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        user_utterance TEXT NOT NULL,
        narration TEXT,
        actions_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_turns_session_created
        ON turns(session_id, created_at ASC);
    `,
  },
];

export function runMigrations(db: Db): void {
  const current = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > current);

  if (pending.length === 0) return;

  for (const migration of pending) {
    db.exec(migration.sql);
    db.pragma(`user_version = ${migration.version}`);
  }
}
