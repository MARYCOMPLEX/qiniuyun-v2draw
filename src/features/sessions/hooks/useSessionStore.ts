"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ApiResponse,
  PersistedTurn,
  SessionSummary,
  SessionWithTurns,
} from "../types";

export interface UseSessionStoreResult {
  readonly sessions: ReadonlyArray<SessionSummary>;
  readonly activeSessionId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** 切换会话; 触发 onActivate 回调让上层灌 chartXML/turns */
  readonly activateSession: (id: string) => Promise<void>;
  /** 新建一个会话, 自动激活 */
  readonly createNewSession: (title?: string) => Promise<SessionSummary | null>;
  /** 删除会话 (确认前提下), 删了当前激活的 → 切到第一个; 没了就新建一个 */
  readonly deleteSession: (id: string) => Promise<void>;
  /** 重命名会话 */
  readonly renameSession: (id: string, title: string) => Promise<void>;
  /** 推 chartXML 到当前激活会话 (autosave) */
  readonly syncChartXML: (chartXML: string) => Promise<void>;
  /** 推 turn 到当前激活会话 (upsert) */
  readonly syncTurn: (turn: PersistedTurn) => Promise<void>;
}

export interface UseSessionStoreParams {
  /**
   * 切换会话时的回调 — 让上层把 chartXML / turns 灌进 orchestrator + DiagramContext
   * 新建会话场景: 也会触发 (传空 chartXML / turns)
   */
  readonly onActivate: (snapshot: SessionWithTurns) => void;
}

const SESSIONS_BASE = "/api/sessions";

async function jsonFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success || body.data === undefined) {
    throw new Error(body.message || `${init?.method || "GET"} ${url} failed`);
  }
  return body.data;
}

export function useSessionStore(
  params: UseSessionStoreParams,
): UseSessionStoreResult {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onActivateRef = useRef(params.onActivate);
  onActivateRef.current = params.onActivate;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeSessionId;
  const initRef = useRef(false);

  // 启动: 拉列表, 激活第一个 (后端 ensureDefaultSession 兜底空库)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        setLoading(true);
        const list = await jsonFetch<SessionSummary[]>(SESSIONS_BASE);
        setSessions(list);
        if (list.length > 0 && list[0]) {
          const detail = await jsonFetch<SessionWithTurns>(
            `${SESSIONS_BASE}/${list[0].id}`,
          );
          setActiveSessionId(list[0].id);
          onActivateRef.current(detail);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "load sessions failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activateSession = useCallback(async (id: string): Promise<void> => {
    if (activeIdRef.current === id) return;
    try {
      setError(null);
      const detail = await jsonFetch<SessionWithTurns>(`${SESSIONS_BASE}/${id}`);
      setActiveSessionId(id);
      onActivateRef.current(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "activate failed");
    }
  }, []);

  const createNewSession = useCallback(
    async (title?: string): Promise<SessionSummary | null> => {
      try {
        setError(null);
        const created = await jsonFetch<SessionSummary>(SESSIONS_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(title ? { title } : {}),
        });
        setSessions((prev) => [created, ...prev]);
        setActiveSessionId(created.id);
        onActivateRef.current({ ...created, turns: [] });
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : "create failed");
        return null;
      }
    },
    [],
  );

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      await jsonFetch<{ id: string }>(`${SESSIONS_BASE}/${id}`, {
        method: "DELETE",
      });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeIdRef.current === id) {
        // 删了激活的 → 自动切到剩下的第一个; 没了就新建
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0 && remaining[0]) {
          await activateSession(remaining[0].id);
        } else {
          await createNewSession();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  }, [activateSession, createNewSession, sessions]);

  const renameSession = useCallback(
    async (id: string, title: string): Promise<void> => {
      try {
        setError(null);
        await jsonFetch<{ id: string }>(`${SESSIONS_BASE}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title } : s)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "rename failed");
      }
    },
    [],
  );

  const syncChartXML = useCallback(
    async (chartXML: string): Promise<void> => {
      const id = activeIdRef.current;
      if (!id) return;
      try {
        await jsonFetch<{ id: string }>(`${SESSIONS_BASE}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chartXML }),
        });
        // 推 updated_at 但不重拉详情, 列表 updatedAt 顺便更新
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, chartXML, updatedAt: Date.now() } : s,
          ),
        );
      } catch (err) {
        // chartXML 同步失败不阻塞用户操作, 只在 console 报
        console.warn("[useSessionStore] syncChartXML failed:", err);
      }
    },
    [],
  );

  const syncTurn = useCallback(async (turn: PersistedTurn): Promise<void> => {
    const id = activeIdRef.current;
    if (!id) return;
    try {
      await jsonFetch<PersistedTurn>(
        `${SESSIONS_BASE}/${id}/turns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: turn.id,
            turnIndex: turn.turnIndex,
            userUtterance: turn.userUtterance,
            narration: turn.narration,
            actions: turn.actions,
            status: turn.status,
          }),
        },
      );
    } catch (err) {
      console.warn("[useSessionStore] syncTurn failed:", err);
    }
  }, []);

  return {
    sessions,
    activeSessionId,
    loading,
    error,
    activateSession,
    createNewSession,
    deleteSession,
    renameSession,
    syncChartXML,
    syncTurn,
  };
}
