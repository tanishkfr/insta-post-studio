import { describe, expect, it } from "vitest";
import { createSignalFieldParams, sampleSignalField, SIGNAL_PRESETS } from "../../src/engine/generators/signalField";

describe("Signal Field generator", () => {
  it("exposes the four Phase 1 presets", () => {
    expect(SIGNAL_PRESETS.map((preset) => preset.id)).toEqual(["pulse", "drift", "current", "fracture"]);
  });

  it("normalizes a seed and produces deterministic samples", () => {
    const first = createSignalFieldParams("pulse", " BEND 01! ");
    const second = createSignalFieldParams("pulse", "BEND01");
    expect(first.seed).toBe("BEND01");
    expect(sampleSignalField(0.25, 0.75, 1.2, first)).toEqual(sampleSignalField(0.25, 0.75, 1.2, second));
  });

  it("changes the field when the seed changes", () => {
    const first = createSignalFieldParams("pulse", "BEND-01");
    const second = createSignalFieldParams("pulse", "BEND-02");
    expect(sampleSignalField(0.25, 0.75, 1.2, first)).not.toEqual(sampleSignalField(0.25, 0.75, 1.2, second));
  });
});
