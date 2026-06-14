/**
 * 会话 / Turn ID 分配器 — 前后端共用。
 *
 * 设计:
 * - 时间戳 base36 + 随机后缀, 短且无序号竞争
 * - 不依赖 crypto.randomUUID (某些旧 Node 版本无), 用 Math.random 兜底
 *
 * 前端 / 后端在不同进程都能独立分配 ID, 不会冲突 (随机后缀 + 时间戳)。
 */

const RANDOM_SUFFIX_LEN = 6;

const randSuffix = (): string => {
  // 不依赖 crypto, 兼容 edge runtime
  return Math.random().toString(36).slice(2, 2 + RANDOM_SUFFIX_LEN);
};

export function allocateSessionId(): string {
  return `s-${Date.now().toString(36)}-${randSuffix()}`;
}

export function allocateTurnId(): string {
  return `t-${Date.now().toString(36)}-${randSuffix()}`;
}
