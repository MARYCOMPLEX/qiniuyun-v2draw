import { describe, expect, it } from "vitest";

import {
  drawToolSchema,
  isAtomicShape,
  isDiffusionMelt,
  isWebSearch,
  TOOL_TYPE,
} from "@/shared/types/schema";

describe("drawToolSchema", () => {
  it("accepts a complete ATOMIC_SHAPE payload", () => {
    const parsed = drawToolSchema.parse({
      toolType: "ATOMIC_SHAPE",
      action: "create",
      shape: "circle",
      activeStyleId: "SKILL_CYBER_PUNK",
      useAccentColor: true,
      position: { x: 1, y: 2 },
      size: 12,
    });
    expect(isAtomicShape(parsed)).toBe(true);
  });

  it("rejects unknown toolType (discriminator guard)", () => {
    expect(() =>
      drawToolSchema.parse({ toolType: "UNKNOWN", refinedPrompt: "x" }),
    ).toThrow();
  });

  it("rejects negative size on ATOMIC_SHAPE", () => {
    expect(() =>
      drawToolSchema.parse({
        toolType: "ATOMIC_SHAPE",
        action: "create",
        shape: "circle",
        activeStyleId: "SKILL_CYBER_PUNK",
        useAccentColor: false,
        position: { x: 0, y: 0 },
        size: -1,
      }),
    ).toThrow();
  });

  it("narrows DIFFUSION_MELT and WEB_SEARCH via guards", () => {
    const diffusion = drawToolSchema.parse({
      toolType: "DIFFUSION_MELT",
      refinedPrompt: "starry night neon",
    });
    const search = drawToolSchema.parse({
      toolType: "WEB_SEARCH",
      searchQuery: "tokyo skyline 8k",
      targetLayerId: "layer-1",
    });
    expect(isDiffusionMelt(diffusion)).toBe(true);
    expect(isWebSearch(search)).toBe(true);
  });

  it("exposes TOOL_TYPE constants matching the schema literals", () => {
    expect(TOOL_TYPE.ATOMIC_SHAPE).toBe("ATOMIC_SHAPE");
    expect(TOOL_TYPE.DIFFUSION_MELT).toBe("DIFFUSION_MELT");
    expect(TOOL_TYPE.WEB_SEARCH).toBe("WEB_SEARCH");
  });
});
