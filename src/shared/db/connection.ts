/**
 * SQLite 连接器 — 单例 + 懒初始化 + schema migration。
 *
 * Why better-sqlite3 (vs node:sqlite / drizzle / prisma):
 * - 同步 API, Next.js route handler 直接用, 不必 await
 * - 无服务进程, 单文件 .db, dev/prod 都简单
 * - 性能高 (C++ binding, 比 sqlite3 npm 包 ~5x)
 *
 * 部署:
 * - 默认数据文件 data/voice-canvas.db (相对项目 cwd)
 * - DATABASE_URL 环境变量可覆盖 (例 docker 挂载卷)
 * - data/ 已在 .gitignore, 不入库
 *
 * Schema 演进: 用 PRAGMA user_version 做版本号, migrations.ts 定义迁移列表。
 */

import Database, { type Database as Db } from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { runMigrations } from "./migrations";

let dbInstance: Db | null = null;

const DEFAULT_DB_PATH = "data/voice-canvas.db";

/** 解析数据文件路径, 默认 data/voice-canvas.db, 通过 DATABASE_URL 覆盖 */
function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL?.trim() || DEFAULT_DB_PATH;
  return resolve(process.cwd(), raw);
}

/**
 * 获取 SQLite 单例连接, 首次调用做:
 * 1. 创建父目录 (data/) 如果不存在
 * 2. 打开 better-sqlite3 连接
 * 3. PRAGMA 优化 (WAL + foreign_keys)
 * 4. 跑 migrations
 *
 * 后续调用直接复用单例。
 */
export function getDb(): Db {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  // WAL: 写日志走单独文件, 读写并发不锁; 适合 next.js 多请求场景
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // synchronous=NORMAL 在 WAL 下足够安全, 写入更快
  db.pragma("synchronous = NORMAL");

  runMigrations(db);

  dbInstance = db;
  return db;
}

/**
 * 测试 / 进程退出时关闭连接, 释放 .db-wal lock。
 * 生产中 next.js 进程退出时 OS 会自动释放, 一般不需要手动调。
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * 测试专用 — 显式注入 in-memory 单例, 隔离每个 test case 的状态。
 * 调用一次后 getDb() 返回此 db 直到下一次 setTestDb / closeDb。
 */
export function setTestDb(db: Db): void {
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = db;
}
