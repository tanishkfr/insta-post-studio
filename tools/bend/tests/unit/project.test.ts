import { describe, expect, it } from "vitest";
import { createExampleProject, createGeneratedProject, createVideoLayer, createVideoProject, migrateProject, normalizeProject, updateProjectDuration } from "../../src/engine/core/project";
import { clampWaveDisplacement, directionVector } from "../../src/engine/effects/waveDisplacement";

describe("BEND project model", () => {
  it("creates a generated project with a playable Signal Field layer", () => {
    const project = createGeneratedProject("9:16", "fracture", "TEST-01");
    expect(project.canvas.width).toBe(1080);
    expect(project.canvas.height).toBe(1920);
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0].kind).toBe("procedural");
    expect(project.layers[0].transform.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(project.layers[0].crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(project.layers[0].color).toMatchObject({ brightness: 0, contrast: 0, saturation: 0, hue: 0, enabled: true });
    expect(project.canvas.duration).toBe(project.timeline.outPoint);
  });

  it("creates an editable example with layered motion, effects, and animation", () => {
    const project = createExampleProject("4:5");
    expect(project.name).toBe("BEND / First Study");
    expect(project.layers.map((layer) => layer.name)).toEqual(["Signal bed", "Refraction study"]);
    expect(project.layers[1]?.effects).toHaveLength(1);
    expect(project.layers[1]?.animation.tracks.length).toBeGreaterThanOrEqual(2);
    expect(project.layers[1]?.animation.tracks.some((track) => track.keyframes.length > 1)).toBe(true);
    expect(project.layers[1]?.animation.tracks.some((track) => track.modulator)).toBe(true);
    expect(project.canvas.duration).toBe(project.timeline.outPoint);
  });

  it("derives video duration from trim and normalizes persisted values", () => {
    const asset = { id: "asset-1", name: "clip.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 12, storageKey: "asset-1" };
    const project = createVideoProject("1:1", asset);
    const layer = project.layers[0];
    if (layer.kind !== "video") throw new Error("expected video layer");
    layer.trimStart = 2;
    layer.trimEnd = 5;
    const updated = updateProjectDuration(project);
    expect(updated.canvas.duration).toBe(3);
    expect(updated.timeline.outPoint).toBe(3);

    const normalized = normalizeProject({ ...updated, name: "   ", canvas: { ...updated.canvas, fps: 999 } });
    expect(normalized.name).toBe("Untitled signal");
    expect(normalized.canvas.fps).toBe(120);
  });

  it("bounds persisted crop and layer color metadata", () => {
    const project = createGeneratedProject("1:1", "pulse", "NORMALIZE-EDITING");
    const normalized = normalizeProject({
      ...project,
      layers: [{ ...project.layers[0], crop: { x: -2, y: 0.9, width: 4, height: 0 }, color: { brightness: 4, contrast: -4, saturation: 2, hue: 720, enabled: false } }],
    });
    expect(normalized.layers[0].crop).toEqual({ x: 0, y: 0.9, width: 1, height: 0.05 });
    expect(normalized.layers[0].color).toEqual({ brightness: 1, contrast: -1, saturation: 1, hue: 180, temperature: 0, tint: 0, highlights: 0, shadows: 0, vignette: 0, grain: 0, sharpen: 0, enabled: false });
  });

  it("migrates Phase 1 projects without losing media or generator data", () => {
    const legacy = {
      schemaVersion: 1,
      id: "phase-1-project",
      name: "Legacy signal",
      canvas: { width: 320, height: 240, fps: 25, duration: 4, background: "#0C0C0E" },
      assets: {
        "asset-1": { id: "asset-1", name: "clip.mp4", mimeType: "video/mp4", size: 10, width: 320, height: 240, duration: 4, storageKey: "asset-1" },
      },
      layers: [{
        id: "layer-1",
        name: "Imported footage",
        kind: "video",
        assetId: "asset-1",
        trimStart: 0.5,
        trimEnd: 3.5,
        fit: "contain",
        transform: { x: 12, y: -8, scale: 0.8, rotation: 4, opacity: 0.9 },
        wave: { enabled: true, intensity: 0.2, frequency: 3, speed: 1, direction: 90, phase: 0 },
      }],
      timeline: { inPoint: 0, outPoint: 4 },
      metadata: { createdAt: 1, updatedAt: 2 },
    };
    const migrated = migrateProject(legacy);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.assets["asset-1"].storageKey).toBe("asset-1");
    expect(migrated.layers[0]).toMatchObject({ id: "layer-1", timeline: { start: 0, duration: 3 }, visible: true, locked: false, muted: false });
    expect(migrated.layers[0].kind).toBe("video");
    expect(migrated.layers[0].transform.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(migrated.layers[0].transform.flipX).toBe(false);
    expect(migrated.layers[0].crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(migrated.layers[0].color).toMatchObject({ brightness: 0, contrast: 0, saturation: 0, hue: 0, enabled: true });
  });

  it("keeps independent layer order and derives duration from the furthest layer", () => {
    const generated = createGeneratedProject("1:1", "pulse", "FIELD-01");
    const asset = { id: "asset-2", name: "second.mp4", mimeType: "video/mp4", size: 1, width: 320, height: 240, duration: 4, storageKey: "asset-2" };
    const video = createVideoLayer(asset);
    video.timeline.start = 2;
    const project = updateProjectDuration({ ...generated, assets: { [asset.id]: asset }, layers: [generated.layers[0], video] });
    expect(project.layers.map((layer) => layer.kind)).toEqual(["procedural", "video"]);
    expect(project.canvas.duration).toBe(8);
    expect(project.layers[1].timeline.start).toBe(2);
  });

  it("rejects unsupported and malformed project documents", () => {
    expect(() => migrateProject({ schemaVersion: 9 })).toThrow(/unsupported version/i);
    expect(() => normalizeProject({ schemaVersion: 2, id: "bad", name: "Bad", canvas: {}, assets: {}, layers: [], timeline: {}, metadata: {} })).toThrow();
  });

  it("clamps Wave Displacement values and wraps direction", () => {
    const wave = clampWaveDisplacement({ enabled: true, intensity: 2, frequency: -1, speed: -8, direction: -90, phase: 450 });
    expect(wave).toMatchObject({ enabled: true, intensity: 1, frequency: 0.2, speed: -3, direction: 270, phase: 90 });
    expect(directionVector(0).x).toBeCloseTo(1);
    expect(directionVector(90).y).toBeCloseTo(1);
  });
});
