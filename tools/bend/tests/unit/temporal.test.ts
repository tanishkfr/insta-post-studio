import { describe, expect, it } from "vitest";
import { createProject, createVideoLayer, normalizeProject } from "../../src/engine/core/project";
import { createTemporalEffect, normalizeTemporalEffect, normalizeTemporalEffects, TEMPORAL_EFFECTS } from "../../src/engine/temporal/registry";
import { BoundedCanvasCache } from "../../src/engine/temporal/engine";
import { curveValue, isSupportedTemporalStack, motionEchoSampleTimes, offsetProjectTime, seededUnit, timeSliceSampleTime } from "../../src/engine/temporal/time";

describe("Phase 3 temporal effects", () => {
  it("registers four effects with four functional presets each", () => {
    expect(TEMPORAL_EFFECTS.map((effect) => effect.id)).toEqual(["motion-echo", "time-slice", "frame-feedback", "channel-delay"]);
    expect(TEMPORAL_EFFECTS.every((effect) => effect.presets.length > 0)).toBe(true);
    expect(TEMPORAL_EFFECTS.flatMap((effect) => effect.presets)).toHaveLength(16);
    expect(TEMPORAL_EFFECTS.every((effect) => effect.presets.length === 4)).toBe(true);
  });

  it("normalizes temporal parameters and rejects future effect versions", () => {
    const effect = normalizeTemporalEffect({ id: "motion-echo", version: 1, enabled: true, preset: "custom", echoCount: 99, decay: -1, opacity: 2, tint: "bad" });
    expect(effect).toMatchObject({ id: "motion-echo", echoCount: 8, decay: 0, opacity: 1, tint: "#F5F3EF" });
    expect(() => normalizeTemporalEffect({ id: "motion-echo", version: 2 })).toThrow(/unsupported version/i);
    expect(() => normalizeTemporalEffects([{ id: "not-real", version: 1 }])).toThrow(/unsupported temporal effect/i);
  });

  it("persists an empty effect stack on old layers and normalizes a new stack", () => {
    const project = createProject("1:1");
    const asset = { id: "asset-1", name: "clip.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 3, storageKey: "clip" };
    const layer = createVideoLayer(asset);
    const restored = normalizeProject({ ...project, assets: { [asset.id]: asset }, layers: [{ ...layer, effects: [createTemporalEffect("channel-delay", "chromatic-ghost")] }] });
    expect(restored.layers[0].effects).toHaveLength(1);
    expect(restored.layers[0].effects[0]).toMatchObject({ id: "channel-delay", version: 1, preset: "chromatic-ghost" });
  });

  it("maps temporal samples to layer bounds and remains deterministic", () => {
    const asset = { id: "asset-2", name: "clip.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 4, storageKey: "clip" };
    const layer = createVideoLayer(asset);
    layer.timeline.start = 3;
    layer.trimStart = 1;
    layer.trimEnd = 3;
    layer.timeline.duration = 2;
    expect(offsetProjectTime(layer, 3, -9)).toBeCloseTo(3);
    expect(offsetProjectTime(layer, 3.5, 9)).toBeCloseTo(4.9999, 3);
    expect(motionEchoSampleTimes(layer, 4, 3, 0.2, "backward", 0.5)).toEqual([3.8, 3.6, 3.5]);
    expect(timeSliceSampleTime(layer, 4, 1, 0.4, "backward", "ease-in-out", 1)).toBeCloseTo(3.6, 4);
    expect(curveValue(0.25, "ease-in")).toBeCloseTo(0.0625);
    expect(seededUnit("BEND", 2)).toBe(seededUnit("BEND", 2));
  });

  it("bounds raw frame cache entries and blocks unsafe feedback order", () => {
    const cache = new BoundedCanvasCache(2);
    const first = {} as HTMLCanvasElement;
    const second = {} as HTMLCanvasElement;
    const third = {} as HTMLCanvasElement;
    cache.set("layer|0", first);
    cache.set("layer|1", second);
    cache.set("layer|2", third);
    expect(cache.size).toBe(2);
    expect(cache.get("layer|0")).toBeUndefined();
    cache.deletePrefix("layer|");
    expect(cache.size).toBe(0);
    expect(isSupportedTemporalStack([createTemporalEffect("frame-feedback"), createTemporalEffect("motion-echo")])).toMatchObject({ supported: false });
    expect(isSupportedTemporalStack([createTemporalEffect("motion-echo"), createTemporalEffect("frame-feedback")])).toMatchObject({ supported: true });
  });
});
