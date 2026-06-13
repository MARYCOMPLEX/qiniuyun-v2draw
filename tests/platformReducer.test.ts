import { describe, expect, it } from "vitest";

import {
  createInitialPlatformState,
  platformCommandToAction,
  platformReducer,
} from "@/features/platform/reducer";
import { PLATFORM_TOOL } from "@/shared/types/tools";

describe("platformReducer", () => {
  const initial = createInitialPlatformState("SKILL_CYBER_PUNK");

  it("初始状态 cyber_punk 风格 + 默认面板可见", () => {
    expect(initial.activeStyleId).toBe("SKILL_CYBER_PUNK");
    expect(initial.panels.leftSidebar).toBe(true);
    expect(initial.panels.capabilitiesPanel).toBe(true);
    expect(initial.panels.historyPanel).toBe(false);
    expect(initial.voice.listening).toBe(false);
    expect(initial.showGrid).toBe(false);
  });

  it("set_theme 切换主题", () => {
    const next = platformReducer(initial, {
      type: "platform/set_theme",
      themeId: "SKILL_VAN_GOGH",
    });
    expect(next.activeStyleId).toBe("SKILL_VAN_GOGH");
  });

  it("set_theme 同 id 不创建新对象 (优化)", () => {
    const next = platformReducer(initial, {
      type: "platform/set_theme",
      themeId: "SKILL_CYBER_PUNK",
    });
    expect(next).toBe(initial);
  });

  it("open_panel / close_panel 切换面板可见性", () => {
    const opened = platformReducer(initial, {
      type: "platform/open_panel",
      panelId: "history",
    });
    expect(opened.panels.historyPanel).toBe(true);

    const closed = platformReducer(opened, {
      type: "platform/close_panel",
      panelId: "history",
    });
    expect(closed.panels.historyPanel).toBe(false);
  });

  it("toggle_voice 不传参数则翻转", () => {
    const on = platformReducer(initial, { type: "platform/toggle_voice" });
    expect(on.voice.listening).toBe(true);
    const off = platformReducer(on, { type: "platform/toggle_voice" });
    expect(off.voice.listening).toBe(false);
  });

  it("toggle_voice 传 enabled 强制设值", () => {
    const on = platformReducer(initial, {
      type: "platform/toggle_voice",
      enabled: true,
    });
    expect(on.voice.listening).toBe(true);

    const stillOn = platformReducer(on, {
      type: "platform/toggle_voice",
      enabled: true,
    });
    expect(stillOn).toBe(on); // 同值不创新对象
  });

  it("toggle_tts / toggle_grid 同样支持翻转和强制", () => {
    const tts = platformReducer(initial, { type: "platform/toggle_tts" });
    expect(tts.voice.ttsEnabled).toBe(true);

    const grid = platformReducer(initial, {
      type: "platform/toggle_grid",
      enabled: true,
    });
    expect(grid.showGrid).toBe(true);
  });

  it("zoom_canvas mode=fit 重置 viewport", () => {
    const zoomed = platformReducer(initial, {
      type: "platform/zoom_canvas",
      delta: 0.5,
    });
    expect(zoomed.viewportMirror?.zoom).toBe(1.5);

    const fit = platformReducer(zoomed, {
      type: "platform/zoom_canvas",
      mode: "fit",
    });
    expect(fit.viewportMirror?.zoom).toBe(1);
    expect(fit.viewportMirror?.pan).toEqual({ x: 0, y: 0 });
  });

  it("pan_canvas delta 累加位移", () => {
    const moved = platformReducer(initial, {
      type: "platform/pan_canvas",
      delta: { dx: 100, dy: 50 },
    });
    expect(moved.viewportMirror?.pan).toEqual({ x: 100, y: 50 });

    const moreMoved = platformReducer(moved, {
      type: "platform/pan_canvas",
      delta: { dx: -30, dy: 0 },
    });
    expect(moreMoved.viewportMirror?.pan).toEqual({ x: 70, y: 50 });
  });

  it("zoom 限制在 [0.1, 4]", () => {
    const ultraZoom = platformReducer(initial, {
      type: "platform/zoom_canvas",
      delta: 100,
    });
    expect(ultraZoom.viewportMirror?.zoom).toBe(4);

    const ultraShrink = platformReducer(initial, {
      type: "platform/zoom_canvas",
      delta: -100,
    });
    expect(ultraShrink.viewportMirror?.zoom).toBe(0.1);
  });

  it("未知 action 类型保持原状态", () => {
    const next = platformReducer(initial, {
      type: "unknown" as never,
    } as never);
    expect(next).toBe(initial);
  });
});

describe("platformCommandToAction", () => {
  it("set_theme 命令转 action", () => {
    const action = platformCommandToAction({
      tool: PLATFORM_TOOL.SET_THEME,
      themeId: "SKILL_VAN_GOGH",
    });
    expect(action).toEqual({
      type: "platform/set_theme",
      themeId: "SKILL_VAN_GOGH",
    });
  });

  it("zoom_canvas 命令转 action", () => {
    const action = platformCommandToAction({
      tool: PLATFORM_TOOL.ZOOM_CANVAS,
      mode: "fit",
    });
    expect(action.type).toBe("platform/zoom_canvas");
  });

  it("toggle_voice 命令转 action", () => {
    const action = platformCommandToAction({
      tool: PLATFORM_TOOL.TOGGLE_VOICE,
      enabled: true,
    });
    expect(action).toEqual({
      type: "platform/toggle_voice",
      enabled: true,
    });
  });

  it("UI 点击和语音命令产生等价 action", () => {
    // UI 点击直接 dispatch
    const fromUi = { type: "platform/set_theme" as const, themeId: "SKILL_VAN_GOGH" };
    // 语音命令通过转换器
    const fromVoice = platformCommandToAction({
      tool: PLATFORM_TOOL.SET_THEME,
      themeId: "SKILL_VAN_GOGH",
    });
    expect(fromUi).toEqual(fromVoice);
  });
});
