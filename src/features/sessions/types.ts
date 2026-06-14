/**
 * 会话相关的客户端类型 — 跟 sessionRepo 的 SessionRecord / TurnRecord 形态一致, 但去掉 server-only
 * 字段 (FK 等), 加上 client-only 字段 (loading 状态等)。
 *
 * 服务端响应 envelope: { success: boolean, data: T, error?, code? }
 */

export interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly chartXML: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SessionAction {
  readonly tool: string;
  readonly summary: string;
  readonly status: "pending" | "running" | "done" | "failed";
  readonly error?: string;
  readonly layerId?: string;
}

export interface PersistedTurn {
  readonly id: string;
  readonly sessionId: string;
  readonly turnIndex: number;
  readonly userUtterance: string;
  readonly narration: string | null;
  readonly actions: ReadonlyArray<SessionAction>;
  readonly status: "streaming" | "executing" | "done" | "failed";
  readonly createdAt: number;
}

export interface SessionWithTurns extends SessionSummary {
  readonly turns: ReadonlyArray<PersistedTurn>;
}

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly code?: string;
  readonly message?: string;
}
