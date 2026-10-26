import { describe, expect, it } from "vitest";
import { createGeneratedProject, createVideoProject } from "../../src/engine/core/project";
import { formatSeconds, getRenderableLayers, layerEndAt, layerStartAt, percentToTime, seekBy, sourceTimeAt, sourceTimestampAt, timeAtPointer, timeToPercent } from "../../src/engine/core/timeline";

describe("timeline math", () => {
  it("converts time and percent without leaving the timeline", () => {
    expect(timeToPercent(4, 8)).toBe(50);
    expect(percentToTime(125, 8)).toBe(8);
    expect(seekBy(0.1, -1, 8)).toBe(0);
    expect(seekBy(7.9, 1, 8)).toBe(8);
  });

  it("maps pointer positions to bounded project time", () => {
    const rect = { left: 100, width: 800 } as DOMRect;
    expect(timeAtPointer(100, rect, 10)).toBe(0);
    expect(timeAtPointer(500, rect, 10)).toBe(5);
    expect(timeAtPointer(1000, rect, 10)).toBe(10);
  });

  it("keeps source playback inside a trimmed video range", () => {
    const asset = { id: "asset-1", name: "clip.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 12, storageKey: "asset-1" };
    const project = createVideoProject("4:5", asset);
    const layer = project.layers[0];
    if (layer.kind !== "video") throw new Error("expected video layer");
    layer.trimStart = 2;
    layer.trimEnd = 6;
    expect(sourceTimeAt(layer, -1)).toBe(2);
    expect(sourceTimeAt(layer, 1.5)).toBe(3.5);
    expect(sourceTimeAt(layer, 9)).toBeCloseTo(5.999, 3);
  });

  it("maps a placed clip to source time and evaluates overlapping layers", () => {
    const asset = { id: "asset-1", name: "clip.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 12, storageKey: "asset-1" };
    const videoProject = createVideoProject("4:5", asset);
    const video = videoProject.layers[0];
    if (video.kind !== "video") throw new Error("expected video layer");
    video.trimStart = 2;
    video.trimEnd = 6;
    video.timeline.start = 3;
    video.timeline.duration = 4;
    const fieldProject = createGeneratedProject("4:5", "pulse", "FIELD-01");
    fieldProject.layers[0].timeline.duration = 8;
    const project = { ...fieldProject, assets: videoProject.assets, layers: [fieldProject.layers[0], video], canvas: { ...fieldProject.canvas, duration: 8 }, timeline: { inPoint: 0, outPoint: 8 } };

    expect(layerStartAt(video)).toBe(3);
    expect(layerEndAt(video)).toBe(7);
    expect(sourceTimeAt(video, 3)).toBe(2);
    expect(sourceTimestampAt(video, 3, 4)).toBe(6);
    expect(sourceTimeAt(video, 5.5)).toBe(4.5);
    expect(getRenderableLayers(project, 1).map((layer) => layer.kind)).toEqual(["procedural"]);
    expect(getRenderableLayers(project, 4).map((layer) => layer.kind)).toEqual(["procedural", "video"]);
    expect(getRenderableLayers(project, 7.5).map((layer) => layer.kind)).toEqual(["procedural"]);
  });

  it("keeps a nonzero source presentation start separate from clip-local trim", () => {
    const asset = { id: "asset-offset", name: "offset.webm", mimeType: "video/webm", size: 1, width: 160, height: 90, duration: 1, storageKey: "offset", videoStartTime: 0.25 };
    const project = createVideoProject("4:5", asset);
    const layer = project.layers[0];
    if (layer.kind !== "video") throw new Error("expected video layer");
    layer.trimStart = 0.1;
    layer.trimEnd = 0.6;
    layer.timeline.start = 2;
    layer.timeline.duration = 0.5;

    expect(sourceTimeAt(layer, 2)).toBe(0.1);
    expect(sourceTimestampAt(layer, 2, asset.videoStartTime)).toBeCloseTo(0.35, 6);
    expect(sourceTimestampAt(layer, 2.5, asset.videoStartTime)).toBeCloseTo(0.849, 3);
  });

  it("formats compact timecodes", () => {
    expect(formatSeconds(0)).toBe("0:00.00");
    expect(formatSeconds(61.25)).toBe("1:01.25");
  });
});
