import { describe, expect, it } from "vitest";
import { createExampleProject, createGeneratedProject, createProceduralLayer, createProject, createVideoLayer, normalizeProject, updateProjectDuration } from "../../src/engine/core/project";
import { normalizeMask } from "../../src/engine/core/mask";
import { normalizeLoopRegion } from "../../src/engine/core/loop";
import { createTemporalEffect } from "../../src/engine/temporal/registry";
import { createEffectStackClipboard, pasteEffectStack } from "../../src/engine/temporal/clipboard";
import { createDefaultModulator, evaluateEasingProgress, getAnimatableProperties, upsertKeyframe } from "../../src/engine/animation/engine";
import { applyEasingToKeyframeSelection, copyKeyframeSelection, deleteKeyframeSelection, duplicateKeyframeSelection, moveKeyframeSelection, pasteKeyframeClipboard, type KeyframeRef } from "../../src/engine/animation/keyframes";
import { randomizeLayerParameters } from "../../src/engine/random/randomize";
import { analyzeSeamlessLoopSupport, resolveExportRange, seamlessLoopProjectTime } from "../../src/engine/export/range";
import { applySourceReplacement, countAnimationBeyond, planSourceReplacement } from "../../src/engine/media/replacement";
import { audioOutputTimestamp } from "../../src/engine/export/exporter";
import type { BendLayer } from "../../src/engine/core/types";

describe("Phase 5.5 project schema", () => {
  it("adds safe defaults to pre-5.5 projects without changing appearance", () => {
    const project = createGeneratedProject("1:1", "pulse", "DEFAULTS");
    const legacy = structuredClone(project) as unknown as Record<string, unknown>;
    delete legacy.loop;
    const layers = legacy.layers as Array<Record<string, unknown>>;
    delete layers[0].blendMode;
    delete layers[0].mask;
    const normalized = normalizeProject(legacy);
    expect(normalized.loop).toEqual({ enabled: false, start: 0, end: normalized.canvas.duration });
    expect(normalized.layers[0].blendMode).toBe("normal");
    expect(normalized.layers[0].mask.type).toBe("none");
    expect(normalized.layers[0].transform).toEqual(project.layers[0].transform);
    expect(normalized.layers[0].animation).toEqual(project.layers[0].animation);
  });

  it("validates masks, blend modes, and loop regions", () => {
    expect(normalizeMask({ type: "ellipse", x: -8, y: 9, width: 0, height: 9, feather: 4, invert: true, angle: 999, falloff: -2 })).toMatchObject({
      type: "ellipse",
      x: -1,
      y: 2,
      width: 0.01,
      height: 2,
      feather: 1,
      invert: true,
      angle: 360,
      falloff: 0.01,
    });
    expect(normalizeMask({ type: "triangle" }).type).toBe("none");
    const project = createGeneratedProject("4:5", "pulse", "LOOP");
    const normalized = normalizeProject({ ...project, loop: { enabled: true, start: 2, end: 5 } });
    expect(normalized.loop).toEqual({ enabled: true, start: 2, end: 5 });
    expect(normalizeProject({ ...project, loop: { enabled: true, start: 6, end: 2 } }).loop).toEqual({ enabled: false, start: 0, end: project.canvas.duration });
    expect(normalizeLoopRegion({ enabled: true, start: 0, end: 3 }, 8)).toEqual({ enabled: true, start: 0, end: 3 });
    const invalidLayer = normalizeProject({ ...project, layers: [{ ...project.layers[0], blendMode: "dissolve" } as unknown as BendLayer] });
    expect(invalidLayer.layers[0].blendMode).toBe("normal");
  });

  it("keeps a loop region inside a shrinking composition duration", () => {
    const project = createProject("1:1", "Loop clamp");
    project.loop = { enabled: true, start: 2, end: 8 };
    const shortened = updateProjectDuration({ ...project, layers: [createProceduralLayer("signal-field", "SHORT")] });
    expect(shortened.loop.end).toBeLessThanOrEqual(shortened.canvas.duration);
    expect(shortened.loop.end).toBeGreaterThan(shortened.loop.start);
  });
});

describe("Phase 5.5 effect clipboard", () => {
  it("remaps animated effect identities and preserves preset/easing/modulation", () => {
    const source = createGeneratedProject("1:1", "pulse", "COPY-SOURCE").layers[0];
    const echo = createTemporalEffect("motion-echo", "ghost-trail");
    const delay = createTemporalEffect("channel-delay", "chromatic-ghost");
    source.effects = [echo, delay];
    source.animation = upsertKeyframe(source, `effects.${echo.instanceId}.decay`, 0, 0.82, "ease-out");
    source.animation = upsertKeyframe(source, `effects.${echo.instanceId}.decay`, 2, 0.44, "cubic-bezier");
    source.animation = { ...source.animation, tracks: source.animation.tracks.map((track) => track.property.includes(echo.instanceId) ? { ...track, modulator: createDefaultModulator("triangle") } : track) };
    const clipboard = createEffectStackClipboard(source);
    expect(clipboard?.effects).toHaveLength(2);
    expect(clipboard?.animation).toHaveLength(1);

    const target = createGeneratedProject("1:1", "pulse", "COPY-TARGET").layers[0];
    const result = pasteEffectStack(target, clipboard, "replace");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0].instanceId).not.toBe(echo.instanceId);
    expect(result.effects[1].instanceId).not.toBe(delay.instanceId);
    expect(new Set(result.effects.map((effect) => effect.instanceId)).size).toBe(2);
    const track = result.animation.tracks.find((candidate) => candidate.property.startsWith("effects."));
    expect(track?.property).toBe(`effects.${result.effects[0].instanceId}.decay`);
    expect(track?.keyframes.map((keyframe) => keyframe.easing)).toEqual(["ease-out", "cubic-bezier"]);
    expect(track?.keyframes.map((keyframe) => keyframe.id)).not.toContain("duplicate");
    expect(track?.modulator?.type).toBe("triangle");
    expect(result.addedTrackCount).toBe(1);
  });

  it("appends compatible effects and rejects duplicates or overflow", () => {
    const source = createGeneratedProject("4:5", "pulse", "APPEND-SOURCE").layers[0];
    source.effects = [createTemporalEffect("motion-echo"), createTemporalEffect("channel-delay")];
    const clipboard = createEffectStackClipboard(source);
    const target = createGeneratedProject("1:1", "pulse", "APPEND-TARGET").layers[0];
    target.effects = [createTemporalEffect("motion-echo")];
    const appended = pasteEffectStack(target, clipboard, "append");
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(appended.effects.map((effect) => effect.id)).toEqual(["motion-echo", "channel-delay"]);
    expect(appended.skippedDuplicateCount).toBe(1);

    const duplicateOnlyClipboard = createEffectStackClipboard(target);
    const duplicate = pasteEffectStack({ ...target, effects: [target.effects[0]] }, duplicateOnlyClipboard, "append");
    expect(duplicate.ok).toBe(false);
    const tooMany = pasteEffectStack({ ...target, effects: Array.from({ length: 8 }, (_, index) => ({ ...createTemporalEffect("motion-echo"), instanceId: `effect-${index}` })) }, clipboard, "append");
    expect(tooMany.ok).toBe(false);
  });

  it("keeps Frame Feedback terminal when appending", () => {
    const source = createGeneratedProject("4:5", "pulse", "ORDER-SOURCE").layers[0];
    source.effects = [createTemporalEffect("channel-delay")];
    const target = createGeneratedProject("1:1", "pulse", "ORDER-TARGET").layers[0];
    target.effects = [createTemporalEffect("frame-feedback")];
    const result = pasteEffectStack(target, createEffectStackClipboard(source), "append");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effects.at(-1)?.id).toBe("frame-feedback");
    expect(result.insertedBeforeFeedback).toBe(true);
  });
});

describe("Phase 5.5 seeded variation", () => {
  it("is reproducible, bounded, and excludes structural values", () => {
    const layer = createProceduralLayer("signal-field", "STABLE-SEED") as Extract<BendLayer, { kind: "procedural" }>;
    const copy = structuredClone(layer);
    const base = structuredClone(layer);
    const first = randomizeLayerParameters(layer, { seed: "VAR-01", strength: "moderate", target: "generator" });
    const second = randomizeLayerParameters(copy, { seed: "VAR-01", strength: "moderate", target: "generator" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.layer).toEqual(second.layer);
    expect(first.changedKeys.length).toBeGreaterThan(0);
    expect(first.layer.kind).toBe("procedural");
    if (first.layer.kind !== "procedural") return;
    const generator = first.layer.generator as Extract<typeof first.layer.generator, { id: "signal-field" }>;
    const baseGenerator = base.generator as Extract<typeof base.generator, { id: "signal-field" }>;
    expect(generator.seed).toBe(baseGenerator.seed);
    expect(generator.duration).toBe(baseGenerator.duration);
    expect(generator.speed).toBeGreaterThanOrEqual(-2);
    expect(generator.speed).toBeLessThanOrEqual(2);
    expect(generator.frequency).toBeGreaterThanOrEqual(0.2);
    expect(generator.frequency).toBeLessThanOrEqual(12);
    const different = randomizeLayerParameters(structuredClone(base), { seed: "VAR-02", strength: "moderate", target: "generator" });
    expect(different.ok).toBe(true);
    if (different.ok) expect(different.layer).not.toEqual(first.layer);
  });

  it("varies effect values and animated values within their declared ranges", () => {
    const layer = createExampleProject("4:5").layers[1];
    const effect = layer.effects[0];
    layer.animation = upsertKeyframe(layer, `effects.${effect.instanceId}.decay`, 0, 0.76, "ease-out");
    layer.animation = upsertKeyframe(layer, `effects.${effect.instanceId}.decay`, 3, 0.42, "ease-in");
    const result = randomizeLayerParameters(layer, { seed: "EFFECT-VARY", strength: "wild", target: "effects" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const variedEffect = result.layer.effects.find((candidate) => candidate.instanceId === effect.instanceId) as Extract<typeof effect, { id: "motion-echo" }> | undefined;
    expect(variedEffect).toBeDefined();
    if (!variedEffect) return;
    expect(variedEffect.decay).toBeGreaterThanOrEqual(0);
    expect(variedEffect.decay).toBeLessThanOrEqual(1);
    const track = result.layer.animation.tracks.find((candidate) => candidate.property === `effects.${effect.instanceId}.decay`);
    expect(track?.keyframes.every((keyframe) => typeof keyframe.value === "number" && keyframe.value >= 0 && keyframe.value <= 1)).toBe(true);
  });
});

describe("Phase 5.5 keyframe groups", () => {
  function selected(layer: BendLayer, property: string): KeyframeRef[] {
    const track = layer.animation.tracks.find((candidate) => candidate.property === property);
    return (track?.keyframes ?? []).map((keyframe) => ({ layerId: layer.id, property, keyframeId: keyframe.id }));
  }

  it("copies, pastes, and duplicates a group with relative timing and fresh identities", () => {
    let layer = createGeneratedProject("4:5", "pulse", "KEYS").layers[0];
    layer.animation = upsertKeyframe(layer, "transform.scale", 0, 0.8, "ease-out");
    layer.animation = upsertKeyframe(layer, "transform.scale", 1, 1.2, "ease-in-out");
    layer.animation = upsertKeyframe(layer, "transform.scale", 2, 0.9, "ease-in");
    const refs = selected(layer, "transform.scale");
    const clipboard = copyKeyframeSelection(layer, refs);
    expect(clipboard?.entries.map((entry) => entry.offset)).toEqual([0, 1, 2]);
    const pasted = pasteKeyframeClipboard(layer, clipboard, 3);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    const times = pasted.animation.tracks[0].keyframes.map((keyframe) => keyframe.time);
    expect(times).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(pasted.animation.tracks[0].keyframes.map((keyframe) => keyframe.id)).size).toBe(6);
    const duplicateBase = { ...layer, animation: pasted.animation };
    const duplicated = duplicateKeyframeSelection(duplicateBase, pasted.selection, 30);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;
    expect(duplicated.selection).toHaveLength(3);
    const moved = moveKeyframeSelection({ ...layer, animation: duplicated.animation }, duplicated.selection, 100, 30);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const movedTimes = moved.animation.tracks[0].keyframes.filter((keyframe) => duplicated.selection.some((ref) => ref.keyframeId === keyframe.id)).map((keyframe) => keyframe.time);
    expect(movedTimes[1] - movedTimes[0]).toBeCloseTo(1);
  });

  it("replaces same-time collisions predictably and respects delete/easing operations", () => {
    let layer = createGeneratedProject("4:5", "pulse", "KEYS-2").layers[0];
    layer.animation = upsertKeyframe(layer, "transform.opacity", 0, 0.4, "linear");
    layer.animation = upsertKeyframe(layer, "transform.opacity", 1, 0.8, "hold");
    layer.animation = upsertKeyframe(layer, "transform.opacity", 2, 0.2, "ease-in");
    const refs = selected(layer, "transform.opacity");
    const clipboard = copyKeyframeSelection(layer, refs);
    const pasted = pasteKeyframeClipboard(layer, clipboard, 1);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    const track = pasted.animation.tracks[0];
    expect(track.keyframes.filter((keyframe) => Math.abs(keyframe.time - 1) < 0.0001)).toHaveLength(1);
    expect(track.keyframes.find((keyframe) => Math.abs(keyframe.time - 1) < 0.0001)?.value).toBe(0.4);
    const eased = applyEasingToKeyframeSelection({ ...layer, animation: pasted.animation }, pasted.selection, "cubic-bezier", [0.2, 0.8, 0.3, 1]);
    expect(eased.ok).toBe(true);
    if (!eased.ok) return;
    const easedTrack = eased.animation.tracks[0];
    expect(easedTrack.keyframes.filter((keyframe) => pasted.selection.some((ref) => ref.keyframeId === keyframe.id)).every((keyframe) => keyframe.easing === "cubic-bezier" && keyframe.bezier?.length === 4)).toBe(true);
    const deleted = deleteKeyframeSelection({ ...layer, animation: eased.animation }, pasted.selection);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.animation.tracks[0].keyframes.some((keyframe) => pasted.selection.some((ref) => ref.keyframeId === keyframe.id))).toBe(false);
  });

  it("uses the same easing evaluator for cubic Bézier and hold", () => {
    expect(evaluateEasingProgress(0.5, "linear")).toBeCloseTo(0.5);
    expect(evaluateEasingProgress(0.9, "hold")).toBe(0);
    expect(evaluateEasingProgress(0, "cubic-bezier", [0.2, 0.4, 0.6, 0.8])).toBeCloseTo(0);
    expect(evaluateEasingProgress(1, "cubic-bezier", [0.2, 0.4, 0.6, 0.8])).toBeCloseTo(1);
    const layer = createGeneratedProject("4:5", "pulse", "MASK-ANIM").layers[0];
    layer.mask = { ...layer.mask, type: "ellipse" };
    expect(getAnimatableProperties(layer).map((property) => property.property)).toContain("mask.feather");
  });
});

describe("Phase 5.5 range, loop, and source replacement", () => {
  it("resolves exact range metadata and rejects empty or out-of-bounds ranges", () => {
    const project = createGeneratedProject("4:5", "pulse", "RANGE");
    const range = resolveExportRange(project, { start: 2, end: 5 });
    expect(range).toMatchObject({ start: 2, end: 5, duration: 3, frameCount: 90, full: false });
    expect(() => resolveExportRange(project, { start: 2, end: 2 })).toThrow(/empty/i);
    expect(() => resolveExportRange(project, { start: -1, end: 3 })).toThrow(/inside/i);
    expect(() => resolveExportRange(project, { start: 0, end: project.canvas.duration + 1 })).toThrow(/inside/i);
  });

  it("maps a seamless repeat back toward the start and identifies unsupported stacks", () => {
    const range = { start: 2, end: 5 };
    expect(seamlessLoopProjectTime(range, 0)).toBe(2);
    expect(seamlessLoopProjectTime(range, 1.5)).toBe(5);
    expect(seamlessLoopProjectTime(range, 3)).toBe(2);
    expect(seamlessLoopProjectTime(range, 2.9)).toBeCloseTo(2.2);
    const supported = createGeneratedProject("4:5", "pulse", "SEAMLESS");
    expect(analyzeSeamlessLoopSupport(supported, { start: 0, end: supported.canvas.duration }).supported).toBe(true);
    const temporal = structuredClone(supported);
    temporal.layers[0].effects = [createTemporalEffect("motion-echo")];
    expect(analyzeSeamlessLoopSupport(temporal, { start: 0, end: 5 }).supported).toBe(false);
    const liquid = structuredClone(supported);
    if (liquid.layers[0].kind === "procedural") liquid.layers[0].generator = { ...liquid.layers[0].generator, id: "liquid", ...createLiquidShape() } as never;
    expect(analyzeSeamlessLoopSupport(liquid, { start: 0, end: 5 }).supported).toBe(false);
  });

  it("preserves or fits source duration and reports unreachable animation", () => {
    const asset = { id: "asset-a", name: "a.mp4", mimeType: "video/mp4", size: 1, width: 100, height: 100, duration: 10, storageKey: "a" };
    const layer = createVideoLayer(asset);
    layer.timeline = { start: 1, duration: 6 };
    layer.trimStart = 0;
    layer.trimEnd = 6;
    layer.animation = upsertKeyframe(layer, "transform.scale", 5, 1.2, "ease-in");
    const preserve = planSourceReplacement(layer, { duration: 12 }, "preserve-timing");
    expect(preserve).toMatchObject({ trimStart: 0, trimEnd: 6, timelineDuration: 6 });
    const fit = planSourceReplacement(layer, { duration: 4 }, "preserve-timing");
    expect(fit).toMatchObject({ trimStart: 0, trimEnd: 4, timelineDuration: 4 });
    expect(fit.animationBeyondEnd).toBe(1);
    const replaced = applySourceReplacement(layer, "new-asset", fit);
    expect(replaced.assetId).toBe("new-asset");
    expect(replaced.timeline.start).toBe(1);
  });

  it("maps audio timestamps relative to the export start", () => {
    const layer = {
      timeline: { start: 1, duration: 4 },
      trimStart: 0.5,
      trimEnd: 4.5,
    } as unknown as Extract<BendLayer, { kind: "video" }>;
    expect(audioOutputTimestamp(layer, 0, 0.5, 0, 48_000, 2)).toBeCloseTo(0);
    expect(audioOutputTimestamp(layer, 0, 2.5, 0, 48_000, 2)).toBeCloseTo(1);
    expect(countAnimationBeyond({ ...layer, animation: { version: 1, tracks: [{ id: "t", property: "transform.x", valueType: "number", enabled: true, keyframes: [{ id: "k", time: 10, value: 1, easing: "linear" }] }] } } as never, 3)).toBe(1);
  });
});

function createLiquidShape(): Record<string, unknown> {
  return { version: 1, preset: "ink-spill", seed: "X", flowSpeed: 1, forceStrength: 1, swirl: 1, viscosity: 0.3, turbulence: 0.2, dyeAmount: 0.8, dyeDissipation: 0.2, palette: "mono", simulationQuality: "standard", duration: 5 };
}
