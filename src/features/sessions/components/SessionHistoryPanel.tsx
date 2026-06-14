"use client";

import { useState } from "react";

import type { MarketStyle } from "@/shared/constants/marketStyles";

import type { SessionSummary } from "../types";

interface SessionHistoryPanelProps {
  readonly sessions: ReadonlyArray<SessionSummary>;
  readonly activeSessionId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly activeStyle: MarketStyle;
  readonly onActivate: (id: string) => void;
  readonly onCreate: () => void;
  readonly onDelete: (id: string) => void;
  readonly onRename: (id: string, title: string) => void;
}

const formatRelative = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(timestamp).toLocaleDateString();
};

/**
 * 左侧栏会话历史面板 — 列表 + 新建 + 删除 + 重命名 (双击 title)。
 *
 * 视觉风格跟 CapabilitiesPanel 协调:
 * - 顶部 header "SESSIONS" + 右侧 "+" 新建按钮
 * - 列表项: title 一行 + updatedAt 相对时间一行
 * - 激活项 高亮 + 左侧色带
 * - 双击 title 进入编辑模式 enter 提交 / esc 取消
 * - 列表项 hover 出删除按钮 (确认弹窗 → 调 onDelete)
 *
 * 不写删除确认 dialog (跟原 panel 风格一致, 用 window.confirm 简单可靠)。
 */
export function SessionHistoryPanel({
  sessions,
  activeSessionId,
  loading,
  error,
  activeStyle,
  onActivate,
  onCreate,
  onDelete,
  onRename,
}: SessionHistoryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const startEdit = (s: SessionSummary): void => {
    setEditingId(s.id);
    setDraftTitle(s.title);
  };

  const commitEdit = (id: string): void => {
    const title = draftTitle.trim();
    if (title && title.length <= 120) {
      onRename(id, title);
    }
    setEditingId(null);
  };

  const handleDelete = (s: SessionSummary): void => {
    if (window.confirm(`删除会话 "${s.title}"? 该会话所有对话历史一并消失。`)) {
      onDelete(s.id);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border p-3"
      style={{
        background: activeStyle.ui.panelBg,
        borderColor: activeStyle.ui.panelBorder,
      }}
    >
      <header className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.3em]"
          style={{ color: activeStyle.ui.textMuted }}
        >
          Sessions
        </span>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-md border px-2 py-0.5 text-[11px] transition-colors hover:bg-white/5"
          style={{
            borderColor: activeStyle.ui.panelBorder,
            color: activeStyle.ui.textMuted,
          }}
          aria-label="新建会话"
        >
          + 新建
        </button>
      </header>

      {error ? (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
          {error}
        </p>
      ) : null}

      {loading && sessions.length === 0 ? (
        <p
          className="text-center text-[11px]"
          style={{ color: activeStyle.ui.textMuted }}
        >
          加载中…
        </p>
      ) : null}

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId;
          const isEditing = editingId === s.id;
          return (
            <li
              key={s.id}
              className="group relative flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 transition-colors"
              style={{
                background: isActive
                  ? `${activeStyle.accent}26`
                  : "transparent",
                borderColor: isActive
                  ? activeStyle.accent
                  : activeStyle.ui.panelBorder,
              }}
              onClick={() => !isEditing && onActivate(s.id)}
            >
              <span
                aria-hidden
                className="mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{
                  background: isActive
                    ? activeStyle.accent
                    : "rgba(148,163,184,0.4)",
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={() => commitEdit(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(s.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    maxLength={120}
                    className="w-full rounded border bg-transparent px-1 py-0.5 text-[12px] outline-none"
                    style={{
                      color: activeStyle.ui.textPrimary,
                      borderColor: activeStyle.accent,
                    }}
                  />
                ) : (
                  <span
                    className="truncate text-[12px] font-medium"
                    style={{ color: activeStyle.ui.textPrimary }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEdit(s);
                    }}
                    title="双击重命名"
                  >
                    {s.title}
                  </span>
                )}
                <span
                  className="text-[10px]"
                  style={{ color: activeStyle.ui.textMuted }}
                >
                  {formatRelative(s.updatedAt)}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(s);
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: activeStyle.ui.textMuted }}
                aria-label="删除会话"
                title="删除会话"
              >
                ✕
              </button>
            </li>
          );
        })}
        {!loading && sessions.length === 0 ? (
          <li
            className="text-center text-[11px]"
            style={{ color: activeStyle.ui.textMuted }}
          >
            还没有会话
          </li>
        ) : null}
      </ul>
    </div>
  );
}
