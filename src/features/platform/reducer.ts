import type { PlatformState, Viewport } from "@/shared/types/layer";
import { PLATFORM_TOOL } from "@/shared/types/tools";
import type {
  ClosePanelCommand,
  OpenPanelCommand,
  PanCanvasCommand,
  SetThemeCommand,
  ToggleGridCommand,
  ToggleTtsCommand,
  ToggleVoiceCommand,
  ZoomCanvasCommand,
} from "@/shared/types/canvas-tools";

/**
 * Platform 状态 Reducer — 平台工具的唯一处理点。
 *
 * 设计原则 (见 docs/protocols/multimodal-canvas.md §4.1):
 * - **唯一入口**: UI 点击 + 语音工具都走 dispatch, 不分散在 useEffect
 * - **不可变**: 每次返回新对象, React Context 自动通知所有订阅者
 * - **副作用集中**: 主题切换的"重算 layer stroke"由消费者监听 activeStyleId 实现,
 *   reducer 本身只负责状态更新
 *
 * 解决 "切换主题有时候不生效" 的根因 — 之前两条路径走不同 setState,
 * 现在收敛到一个 reducer。
 */

export type PlatformAction =
  | { type: "platform/set_theme"; themeId: string }
  | { type: "platform/open_panel"; panelId: PanelId }
  | { type: "platform/close_panel"; panelId: PanelId }
  | { type: "platform/toggle_voice"; enabled?: boolean }
  | { type: "platform/toggle_tts"; enabled?: boolean }
  | { type: "platform/toggle_grid"; enabled?: boolean }
  | { type: "platform/zoom_canvas"; mode?: "fit" | "actual"; delta?: number }
  | { type: "platform/pan_canvas"; to?: { x: number; y: number }; delta?: { dx: number; dy: number } };

export type PanelId = "capabilities" | "history" | "left_sidebar";

export const createInitialPlatformState = (
  initialThemeId: string = "SKILL_CYBER_PUNK",
): PlatformState => ({
  activeStyleId: initialThemeId,
  panels: {
    leftSidebar: true,
    capabilitiesPanel: true,
    historyPanel: false,
  },
  voice: {
    listening: false,
    ttsEnabled: false,
  },
  showGrid: false,
});

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4.0;

const reduceViewport = (
  prev: Viewport | undefined,
  action: ZoomCanvasCommand | PanCanvasCommand | { mode?: string; delta?: unknown; to?: unknown },
): Viewport => {
  const base: Viewport = prev ?? { pan: { x: 0, y: 0 }, zoom: 1 };
  const a = action as { mode?: string; delta?: number | { dx: number; dy: number }; to?: { x: number; y: number } };
  // zoom
  if (a.mode === "fit" || a.mode === "actual") {
    return { pan: { x: 0, y: 0 }, zoom: 1 };
  }
  if (typeof a.delta === "number") {
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, base.zoom + a.delta));
    return { ...base, zoom: newZoom };
  }
  // pan
  if (a.to && typeof (a.to as { x: number }).x === "number") {
    return { ...base, pan: a.to as { x: number; y: number } };
  }
  if (a.delta && typeof a.delta === "object" && "dx" in a.delta) {
    return {
      ...base,
      pan: {
        x: base.pan.x + (a.delta as { dx: number }).dx,
        y: base.pan.y + (a.delta as { dy: number }).dy,
      },
    };
  }
  return base;
};

const reducePanel = (
  prev: PlatformState["panels"],
  panelId: PanelId,
  open: boolean,
): PlatformState["panels"] => {
  switch (panelId) {
    case "capabilities":
      return { ...prev, capabilitiesPanel: open };
    case "history":
      return { ...prev, historyPanel: open };
    case "left_sidebar":
      return { ...prev, leftSidebar: open };
  }
};

export function platformReducer(state: PlatformState, action: PlatformAction): PlatformState {
  switch (action.type) {
    case "platform/set_theme":
      if (state.activeStyleId === action.themeId) return state;
      return { ...state, activeStyleId: action.themeId };

    case "platform/open_panel":
      return { ...state, panels: reducePanel(state.panels, action.panelId, true) };

    case "platform/close_panel":
      return { ...state, panels: reducePanel(state.panels, action.panelId, false) };

    case "platform/toggle_voice": {
      const next = action.enabled ?? !state.voice.listening;
      if (state.voice.listening === next) return state;
      return { ...state, voice: { ...state.voice, listening: next } };
    }

    case "platform/toggle_tts": {
      const next = action.enabled ?? !state.voice.ttsEnabled;
      if (state.voice.ttsEnabled === next) return state;
      return { ...state, voice: { ...state.voice, ttsEnabled: next } };
    }

    case "platform/toggle_grid": {
      const next = action.enabled ?? !state.showGrid;
      if (state.showGrid === next) return state;
      return { ...state, showGrid: next };
    }

    case "platform/zoom_canvas":
    case "platform/pan_canvas":
      return {
        ...state,
        viewportMirror: reduceViewport(state.viewportMirror, action),
      };

    default:
      return state;
  }
}

/**
 * 把 LLM 命令 (canvas-tools schema) 转换为内部 PlatformAction。
 * 类型守卫由 commandType 字段保证。
 */
export function platformCommandToAction(
  cmd:
    | SetThemeCommand
    | OpenPanelCommand
    | ClosePanelCommand
    | ToggleVoiceCommand
    | ToggleTtsCommand
    | ToggleGridCommand
    | ZoomCanvasCommand
    | PanCanvasCommand,
): PlatformAction {
  switch (cmd.tool) {
    case PLATFORM_TOOL.SET_THEME:
      return { type: "platform/set_theme", themeId: cmd.themeId };
    case PLATFORM_TOOL.OPEN_PANEL:
      return { type: "platform/open_panel", panelId: cmd.panelId };
    case PLATFORM_TOOL.CLOSE_PANEL:
      return { type: "platform/close_panel", panelId: cmd.panelId };
    case PLATFORM_TOOL.TOGGLE_VOICE:
      return { type: "platform/toggle_voice", enabled: cmd.enabled };
    case PLATFORM_TOOL.TOGGLE_TTS:
      return { type: "platform/toggle_tts", enabled: cmd.enabled };
    case PLATFORM_TOOL.TOGGLE_GRID:
      return { type: "platform/toggle_grid", enabled: cmd.enabled };
    case PLATFORM_TOOL.ZOOM_CANVAS:
      return { type: "platform/zoom_canvas", mode: cmd.mode, delta: cmd.delta };
    case PLATFORM_TOOL.PAN_CANVAS:
      return { type: "platform/pan_canvas", to: cmd.to, delta: cmd.delta };
  }
}
