import { describe, expect, it } from "vitest";

import {
  buildFallbackInstruction,
  dispatchCompletedTool,
  dispatchPartialTool,
} from "@/features/art-canvas/utils/toolDispatcher";

describe("toolDispatcher.dispatchPartialTool", () => {
  it("returns null for undefined / empty partial", () => {
    expect(dispatchPartialTool(undefined, "id")).toBeNull();
    expect(dispatchPartialTool({}, "id")).toBeNull();
  });

  it("returns null when only toolType discriminator is known", () => {
    expect(dispatchPartialTool({ toolType: "ATOMIC_SHAPE" }, "id")).toBeNull();
  });

  it("returns instruction once all atomic fields are present", () => {
    const inst = dispatchPartialTool(
      {
        toolType: "ATOMIC_SHAPE",
        action: "create",
        shape: "circle",
        activeStyleId: "SKILL_CYBER_PUNK",
        useAccentColor: true,
        position: { x: 100, y: 200 },
        size: 80,
      },
      "id-1",
    );
    expect(inst).not.toBeNull();
    expect(inst!.id).toBe("id-1");
    expect(inst!.stroke).toBe("#db2777");
  });

  it("clamps negative size to zero", () => {
    const inst = dispatchPartialTool(
      {
        toolType: "ATOMIC_SHAPE",
        action: "create",
        shape: "circle",
        activeStyleId: "SKILL_OBSIDIAN",
        useAccentColor: false,
        position: { x: 1, y: 1 },
        size: -50,
      },
      "id-2",
    );
    expect(inst!.size).toBe(0);
  });
});

describe("toolDispatcher.dispatchCompletedTool", () => {
  it("maps ATOMIC_SHAPE to canvas instruction", () => {
    const inst = dispatchCompletedTool(
      {
        toolType: "ATOMIC_SHAPE",
        action: "modify",
        shape: "rectangle",
        activeStyleId: "SKILL_VAN_GOGH",
        useAccentColor: false,
        position: { x: 5, y: 5 },
        size: 12,
      },
      "id-3",
    );
    expect(inst!.shape).toBe("rectangle");
    expect(inst!.stroke).toBe("#f59e0b");
  });

  it("returns null for non-canvas tools (DIFFUSION_MELT / WEB_SEARCH)", () => {
    expect(
      dispatchCompletedTool(
        { toolType: "DIFFUSION_MELT", refinedPrompt: "x" },
        "id-4",
      ),
    ).toBeNull();
    expect(
      dispatchCompletedTool(
        { toolType: "WEB_SEARCH", searchQuery: "x", targetLayerId: "y" },
        "id-5",
      ),
    ).toBeNull();
  });
});

describe("toolDispatcher.buildFallbackInstruction", () => {
  it("emits the spec-mandated default circle (size=10)", () => {
    const inst = buildFallbackInstruction("SKILL_CYBER_PUNK");
    expect(inst.shape).toBe("circle");
    expect(inst.action).toBe("create");
    expect(inst.size).toBe(10);
  });
});
