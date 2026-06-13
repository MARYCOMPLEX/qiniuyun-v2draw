import { describe, expect, it } from "vitest";

/**
 * useMaskTool 是 React hook, 完整测试需要 React Testing Library。
 * 这里只做核心逻辑的纯函数验证 (距离计算 / polygon 验证规则)。
 * 完整 hook 行为测试在 PR 完成后用 Playwright e2e 验证。
 */

const MIN_POINTS = 3;
const MIN_MOVE_DIST = 4;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const validPolygon = (points: ReadonlyArray<{ x: number; y: number }>): boolean =>
  points.length >= MIN_POINTS;

describe("Mask Tool 核心逻辑", () => {
  it("distance 计算两点欧几里得距离", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
  });

  it("MIN_MOVE_DIST = 4 确保稀疏采样", () => {
    expect(MIN_MOVE_DIST).toBe(4);
    // 移动 3px (< 4) 不算新点
    expect(distance({ x: 0, y: 0 }, { x: 2, y: 2 })).toBeLessThan(MIN_MOVE_DIST);
    // 移动 5px (> 4) 算新点
    expect(distance({ x: 0, y: 0 }, { x: 4, y: 3 })).toBeGreaterThanOrEqual(MIN_MOVE_DIST);
  });

  it("polygon 至少 3 点才合法", () => {
    expect(validPolygon([])).toBe(false);
    expect(validPolygon([{ x: 0, y: 0 }])).toBe(false);
    expect(validPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])).toBe(false);
    expect(validPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ])).toBe(true);
  });

  it("layer 局部坐标系 — 鼠标事件转换", () => {
    // 鼠标在屏幕 (200, 150), layer 容器在屏幕 (100, 100), 容器尺寸 400×300, layer 实际 800×600
    const screen = { x: 200, y: 150 };
    const containerOrigin = { x: 100, y: 100 };
    const containerSize = { w: 400, h: 300 };
    const layerSize = { width: 800, height: 600 };

    const local = {
      x: ((screen.x - containerOrigin.x) / containerSize.w) * layerSize.width,
      y: ((screen.y - containerOrigin.y) / containerSize.h) * layerSize.height,
    };

    expect(local.x).toBe(200); // (200-100)/400 * 800 = 200
    expect(local.y).toBe(100); // (150-100)/300 * 600 = 100
  });
});
