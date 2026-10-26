import { describe, expect, it, vi } from "vitest";
import { createGeneratedProject, createProceduralLayer, createProject, createVideoLayer, createVideoProject, normalizeProject, updateProjectDuration } from "../../src/engine/core/project";
import { createDefaultLoop, normalizeLoopRegion } from "../../src/engine/core/loop";
import { createDefaultMask } from "../../src/engine/core/mask";
import { getAnimatableProperties, getPropertyDefinition, upsertKeyframe } from "../../src/engine/animation/engine";
import { randomizeLayerParameters } from "../../src/engine/random/randomize";
import { applyMotionRecipe, BUILTIN_MOTION_RECIPES } from "../../src/engine/recipes/recipes";
import { createTemporalEffect } from "../../src/engine/temporal/registry";
import { isSupportedTemporalStack } from "../../src/engine/temporal/time";
import { getRequiredVideoAssetIds, layerOverlapsRange } from "../../src/engine/export/exporter";
import { useEditorStore } from "../../src/app/store";
import { ProjectSaveCoordinator } from "../../src/storage/saveCoordinator";
import type { BendLayer, BendProject, MediaAssetRecord, SignalFieldParams } from "../../src/engine/core/types";

function videoAsset(id: string): MediaAssetRecord {
  return { id, name: `${id}.mp4`, mimeType: "video/mp4", size: 128, width: 320, height: 240, duration: 4, storageKey: `blob-${id}` };
}

function projectWithVideo(): BendProject {
  return createVideoProject("4:5", videoAsset("asset-visible"));
}

describe("Phase 7.0 reliability regressions", () => {
  it("clamps a loop/work range when a layer edit shortens the composition instead of discarding it", () => {
    const project = createGeneratedProject("4:5", "pulse", "LOOP-SHRINK");
    project.loop = { enabled: true, start: 2, end: 7 };
    const layer = project.layers[0];
    layer.timeline.duration = 4;
    if (layer.kind === "procedural") layer.generator.duration = 4;
    const next = updateProjectDuration(project);
    expect(next.canvas.duration).toBe(4);
    expect(next.loop).toEqual({ enabled: true, start: 2, end: 4 });
    expect(normalizeLoopRegion({ enabled: true, start: 1, end: 99 }, 5)).toEqual({ enabled: true, start: 1, end: 5 });
    expect(normalizeLoopRegion({ enabled: true, start: 10, end: 11 }, 5)).toEqual({ enabled: true, start: 4.95, end: 5 });
    expect(normalizeLoopRegion(null, 5)).toEqual(createDefaultLoop(5));
  });

  it("preserves mask animation tracks when the mask is temporarily set to none", () => {
    const project = createGeneratedProject("4:5", "pulse", "MASK-KEEP");
    const layer = project.layers[0];
    layer.mask = { ...createDefaultMask(), type: "ellipse" };
    layer.animation = upsertKeyframe(layer, "mask.width", 0, 0.4);
    layer.animation = upsertKeyframe(layer, "mask.width", 2, 0.8);
    expect(layer.animation.tracks.some((track) => track.property === "mask.width")).toBe(true);

    layer.mask = { ...createDefaultMask(), type: "none" };
    const normalized = normalizeProject({ ...project, layers: [layer] });
    expect(normalized.layers[0].animation.tracks.find((track) => track.property === "mask.width")?.keyframes).toHaveLength(2);
    expect(getAnimatableProperties(normalized.layers[0]).some((property) => property.property === "mask.width")).toBe(true);
    normalized.layers[0].mask = { ...normalized.layers[0].mask, type: "ellipse" };
    expect(normalizeProject(normalized).layers[0].animation.tracks.some((track) => track.property === "mask.width")).toBe(true);
  });

  it("reconciles the active layer after undo and redo", () => {
    const project = createGeneratedProject("1:1", "pulse", "UNDO-ACTIVE");
    const layerId = project.layers[0].id;
    const store = useEditorStore.getState();
    store.setProject(project);
    store.commit("Remove layer", (draft) => ({ ...draft, layers: [] }));
    useEditorStore.getState().setActiveLayer(null);
    expect(useEditorStore.getState().activeLayerId).toBeNull();
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]?.id).toBe(layerId);
    expect(useEditorStore.getState().activeLayerId).toBe(layerId);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().activeLayerId).toBeNull();
    useEditorStore.getState().clearProject();
  });

  it("retries the newest pending save, not a stale failed snapshot", async () => {
    const writes: string[] = [];
    const coordinator = new ProjectSaveCoordinator(async (project) => {
      writes.push(project.name);
      if (writes.length === 1) throw new Error("quota");
    }, () => undefined, 60_000);
    const first = createProject("4:5", "First snapshot");
    const second = createProject("4:5", "Newest snapshot");
    coordinator.schedule(first);
    await expect(coordinator.flush(first.id)).rejects.toThrow("quota");
    coordinator.schedule(second);
    await coordinator.retry(second.id);
    expect(writes).toEqual(["First snapshot", "Newest snapshot"]);
  });

  it("scales existing generator keyframes when a seeded variation changes their base value", () => {
    const base = createProceduralLayer("signal-field", "VARY-ANIM", "Signal variation");
    base.animation = upsertKeyframe(base, "generator.speed", 0, 0.4);
    base.animation = upsertKeyframe(base, "generator.speed", 3, 0.8);
    const baseSpeed = (base.generator as SignalFieldParams).speed;
    let found: ReturnType<typeof randomizeLayerParameters> | null = null;
    for (let index = 0; index < 200; index += 1) {
      const candidate = randomizeLayerParameters(base, { seed: `VARY-${index}`, strength: "wild", scope: "motion", target: "generator" });
      if (candidate.ok && candidate.changedKeys.includes("generator.speed")) {
        found = candidate;
        break;
      }
    }
    expect(found?.ok).toBe(true);
    if (!found?.ok) return;
    const varied = found.layer;
    if (varied.kind !== "procedural") throw new Error("expected procedural layer");
    const newBase = (varied.generator as SignalFieldParams).speed;
    expect(newBase).not.toBe(baseSpeed);
    const track = varied.animation.tracks.find((candidate) => candidate.property === "generator.speed");
    expect(track).toBeDefined();
    const first = Number(track?.keyframes.find((keyframe) => keyframe.time === 0)?.value);
    const second = Number(track?.keyframes.find((keyframe) => keyframe.time === 3)?.value);
    expect(first).toBeCloseTo(0.4 * newBase / baseSpeed, 5);
    expect(second).toBeCloseTo(0.8 * newBase / baseSpeed, 5);
    expect(first).not.toBe(0.4);
    expect(second).not.toBe(0.8);
  });

  it("keeps Frame Feedback terminal when appending a recipe and does not duplicate effect types", () => {
    const project = projectWithVideo();
    const layer = project.layers[0];
    layer.effects = [createTemporalEffect("channel-delay"), createTemporalEffect("frame-feedback")];
    const ghost = BUILTIN_MOTION_RECIPES.find((recipe) => recipe.id === "analog-ghost");
    if (!ghost) throw new Error("expected Analog Ghost recipe");
    const result = applyMotionRecipe({ ...project, layers: [layer] }, ghost, layer.id, "append");
    const appended = result.project.layers.find((candidate) => candidate.id === layer.id);
    expect(appended?.effects.map((effect) => effect.id)).toEqual(["channel-delay", "motion-echo", "frame-feedback"]);
    expect(isSupportedTemporalStack(appended?.effects ?? []).supported).toBe(true);

    const duplicate = applyMotionRecipe({ ...project, layers: [{ ...layer, effects: [createTemporalEffect("motion-echo")] }] }, ghost, layer.id, "append");
    expect(duplicate.project.layers.find((candidate) => candidate.id === layer.id)?.effects.filter((effect) => effect.id === "motion-echo")).toHaveLength(1);
  });

  it("aligns Wave controls with persisted bounds", () => {
    const layer = projectWithVideo().layers[0];
    expect(getPropertyDefinition(layer, "wave.frequency")).toMatchObject({ min: 0.2, max: 12 });
    expect(getPropertyDefinition(layer, "wave.speed")).toMatchObject({ min: -3, max: 3 });
    expect(getPropertyDefinition(layer, "wave.phase")).toMatchObject({ min: 0, max: 360 });
  });

  it("requires media only for visible video layers and knows range overlap", () => {
    const project = projectWithVideo();
    const hiddenAsset = videoAsset("asset-hidden");
    const hiddenLayer = createVideoLayer(hiddenAsset);
    hiddenLayer.visible = false;
    project.assets[hiddenAsset.id] = hiddenAsset;
    project.layers.push(hiddenLayer);
    expect(getRequiredVideoAssetIds(project)).toEqual(["asset-visible"]);

    const layer = project.layers[0];
    expect(layer.kind).toBe("video");
    if (layer.kind !== "video") return;
    layer.timeline.start = 2;
    layer.timeline.duration = 3;
    expect(layerOverlapsRange(layer, { start: 0, end: 1 })).toBe(false);
    expect(layerOverlapsRange(layer, { start: 0, end: 3 })).toBe(true);
    expect(layerOverlapsRange(layer, { start: 4.9, end: 5 })).toBe(true);
    expect(layerOverlapsRange(layer, { start: 5, end: 8 })).toBe(false);
  });
});
