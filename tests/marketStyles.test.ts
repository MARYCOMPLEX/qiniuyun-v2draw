import { describe, expect, it } from "vitest";

import {
  DEFAULT_STYLE_ID,
  MARKET_STYLES,
  getStyleById,
  resolveStrokeColor,
} from "@/shared/constants/marketStyles";

describe("marketStyles registry", () => {
  it("hardcodes exactly three premium presets", () => {
    expect(MARKET_STYLES).toHaveLength(3);
    expect(MARKET_STYLES.map((s) => s.id)).toEqual([
      "SKILL_CYBER_PUNK",
      "SKILL_VAN_GOGH",
      "SKILL_OBSIDIAN",
    ]);
  });

  it("locks Cyber Punk background and palette per spec", () => {
    const cyber = getStyleById("SKILL_CYBER_PUNK");
    expect(cyber.background).toBe("#000000");
    expect(cyber.palette).toEqual(["#06b6d4", "#db2777", "#7c3aed"]);
  });

  it("locks Van Gogh background and palette per spec", () => {
    const vg = getStyleById("SKILL_VAN_GOGH");
    expect(vg.background).toBe("#020617");
    expect(vg.palette).toEqual(["#f59e0b", "#1d4ed8", "#10b981"]);
  });

  it("locks Obsidian background and palette per spec", () => {
    const ob = getStyleById("SKILL_OBSIDIAN");
    expect(ob.background).toBe("#030712");
    expect(ob.palette).toEqual(["#f8fafc", "#475569", "#38bdf8"]);
  });

  it("throws domain error on unknown id", () => {
    expect(() => getStyleById("SKILL_GHOST" as never)).toThrowError(
      /MARKET_STYLE_NOT_FOUND/,
    );
  });

  it("resolveStrokeColor returns accent or first palette color", () => {
    const cyber = getStyleById("SKILL_CYBER_PUNK");
    expect(resolveStrokeColor(cyber, true)).toBe(cyber.accent);
    expect(resolveStrokeColor(cyber, false)).toBe(cyber.palette[0]);
  });

  it("DEFAULT_STYLE_ID points to a registered style", () => {
    expect(MARKET_STYLES.some((s) => s.id === DEFAULT_STYLE_ID)).toBe(true);
  });
});
