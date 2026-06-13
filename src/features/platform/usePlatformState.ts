"use client";

import { useReducer, useCallback } from "react";

import type { PlatformState } from "@/shared/types/layer";

import {
  createInitialPlatformState,
  platformReducer,
  type PlatformAction,
} from "./reducer";

export interface UsePlatformStateResult {
  readonly state: PlatformState;
  readonly dispatch: (action: PlatformAction) => void;
  /** 便捷快捷方法 — UI 点击和语音工具走同一个 dispatch */
  readonly setTheme: (themeId: string) => void;
  readonly openPanel: (panelId: PlatformAction extends { panelId: infer P } ? P : never) => void;
  readonly closePanel: (panelId: PlatformAction extends { panelId: infer P } ? P : never) => void;
  readonly toggleVoice: (enabled?: boolean) => void;
  readonly toggleTts: (enabled?: boolean) => void;
  readonly toggleGrid: (enabled?: boolean) => void;
}

/**
 * Platform 状态机 React hook — 包装 useReducer + 便捷方法。
 *
 * 唯一入口规范 (见 docs/protocols/multimodal-canvas.md §4.1):
 * - UI 点击风格卡 → setTheme(id)
 * - 语音命令 platform.set_theme → dispatch(platformCommandToAction(cmd))
 * - 两条路径都走 reducer, 不可能不一致
 */
export function usePlatformState(initialThemeId?: string): UsePlatformStateResult {
  const [state, dispatch] = useReducer(
    platformReducer,
    initialThemeId,
    createInitialPlatformState,
  );

  const setTheme = useCallback((themeId: string): void => {
    dispatch({ type: "platform/set_theme", themeId });
  }, []);

  const openPanel = useCallback((panelId: "capabilities" | "history" | "left_sidebar"): void => {
    dispatch({ type: "platform/open_panel", panelId });
  }, []);

  const closePanel = useCallback((panelId: "capabilities" | "history" | "left_sidebar"): void => {
    dispatch({ type: "platform/close_panel", panelId });
  }, []);

  const toggleVoice = useCallback((enabled?: boolean): void => {
    dispatch({ type: "platform/toggle_voice", enabled });
  }, []);

  const toggleTts = useCallback((enabled?: boolean): void => {
    dispatch({ type: "platform/toggle_tts", enabled });
  }, []);

  const toggleGrid = useCallback((enabled?: boolean): void => {
    dispatch({ type: "platform/toggle_grid", enabled });
  }, []);

  return {
    state,
    dispatch,
    setTheme,
    openPanel: openPanel as UsePlatformStateResult["openPanel"],
    closePanel: closePanel as UsePlatformStateResult["closePanel"],
    toggleVoice,
    toggleTts,
    toggleGrid,
  };
}
