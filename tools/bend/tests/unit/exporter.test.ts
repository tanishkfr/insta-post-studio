import { describe, expect, it } from "vitest";
import { audioOutputTimestamp, getExportFrameCount, isAbortError, throwIfAborted } from "../../src/engine/export/exporter";
import { createVideoProject } from "../../src/engine/core/project";
import { resolveExportRange } from "../../src/engine/export/range";

describe("export safeguards", () => {
  it("does not add a full extra frame to fractional compositions", () => {
    expect(getExportFrameCount(1, 30)).toBe(30);
    expect(getExportFrameCount(0.9666666667, 30)).toBe(29);
    expect(getExportFrameCount(1.001, 30)).toBe(31);
  });

  it("rounds full ranges so 15 seconds at 30 FPS is exactly 450 frames", () => {
    const asset = { id: "asset-range", name: "range.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 15.000000000000002, storageKey: "range" };
    const project = createVideoProject("9:16", asset);
    project.canvas.duration = 15.000000000000002;
    const range = resolveExportRange(project);
    expect(range.duration).toBe(15);
    expect(range.frameCount).toBe(450);
  });

  it("throws a recognizable cancellation error", () => {
    const controller = new AbortController();
    controller.abort();
    try {
      throwIfAborted(controller.signal);
      throw new Error("expected cancellation");
    } catch (error) {
      expect(isAbortError(error)).toBe(true);
      expect(error).toMatchObject({ name: "AbortError" });
    }
  });

  it("places trimmed audio at the same timeline offset as its video layer", () => {
    const asset = { id: "asset-audio", name: "voice.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 12, storageKey: "audio" };
    const project = createVideoProject("4:5", asset);
    const layer = project.layers[0];
    if (layer.kind !== "video") throw new Error("expected video layer");
    layer.trimStart = 2;
    layer.trimEnd = 6;
    layer.timeline.start = 4;
    layer.timeline.duration = 4;
    expect(audioOutputTimestamp(layer, 1, 3, 0, 48_000)).toBe(4);
    expect(audioOutputTimestamp(layer, 1, 3.5, 0, 48_000)).toBe(4.5);
    expect(audioOutputTimestamp(layer, 1, 4, 24_000, 48_000)).toBe(5.5);
  });

  it("preserves delayed and negative source starts when mapping audio", () => {
    const asset = { id: "asset-audio-offset", name: "offset.mp4", mimeType: "video/mp4", size: 1, width: 160, height: 90, duration: 2, storageKey: "offset" };
    const project = createVideoProject("4:5", asset);
    const layer = project.layers[0];
    if (layer.kind !== "video") throw new Error("expected video layer");
    layer.trimStart = 0;
    layer.trimEnd = 1;
    layer.timeline.start = 3;
    layer.timeline.duration = 1;

    expect(audioOutputTimestamp(layer, 0.228667, 0.478667, 0, 48_000)).toBeCloseTo(3.25, 6);
    expect(audioOutputTimestamp(layer, -0.25, -0.25, 0, 48_000)).toBeCloseTo(3, 6);
  });
});
