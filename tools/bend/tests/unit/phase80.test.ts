import { describe, expect, it } from "vitest";
import { createVideoLayer, createVideoProject, normalizeProject, updateProjectDuration } from "../../src/engine/core/project";
import { splitVideoClip, removeVideoClip, applyTransition, removeTransition, layoutSequence, closeSequenceGap, duplicateVideoClip } from "../../src/engine/editing/operations";
import { clipDurationForSource, defaultClipPlayback, integrateSpeed, sourceTimeForVideoLayer, splitPlaybackAtProgress, videoLayerDuration } from "../../src/engine/core/timeMapping";
import { getVideoClips, resolveTransition, transitionStyleForClip } from "../../src/engine/transitions/transition";
import { evaluateAnimatedProperty, upsertKeyframe } from "../../src/engine/animation/engine";
import { createTemporalEffect } from "../../src/engine/temporal/registry";
import type { MediaAssetRecord } from "../../src/engine/core/types";

function asset(id = "asset-a", duration = 6): MediaAssetRecord {
  return { id, name: `${id}.mp4`, mimeType: "video/mp4", mediaType: "video", size: 100, width: 640, height: 360, duration, storageKey: `blob-${id}`, audio: { status: "available", codec: "aac", channels: 2, sampleRate: 48_000, startTime: 0 } };
}

describe("Phase 8.0 multi-clip editing", () => {
  it("maps constant speed and freeze duration deterministically", () => {
    const playback = defaultClipPlayback();
    playback.speed = 2;
    expect(clipDurationForSource(6, playback)).toBe(3);
    playback.freeze = { sourceTime: 2.5, duration: 1.4 };
    expect(clipDurationForSource(6, playback)).toBe(1.4);
    const layer = createVideoLayer(asset("speed", 6));
    layer.playback.speed = 2;
    layer.timeline.duration = videoLayerDuration(layer);
    expect(videoLayerDuration(layer)).toBe(3);
    expect(sourceTimeForVideoLayer(layer, 0)).toBe(0);
    expect(sourceTimeForVideoLayer(layer, 1.5)).toBeCloseTo(3, 3);
    expect(sourceTimeForVideoLayer(layer, 3)).toBeCloseTo(5.999, 3);
  });

  it("keeps the speed-ramp source map monotonic and splits the curve", () => {
    const playback = defaultClipPlayback();
    playback.rampEnabled = true;
    playback.rampPoints = [{ time: 0, speed: 1 }, { time: 0.5, speed: 0.5 }, { time: 1, speed: 2 }];
    expect(integrateSpeed(playback, 1)).toBeCloseTo(1, 6);
    const layer = createVideoLayer(asset("ramp", 6));
    layer.playback = playback;
    layer.timeline.duration = videoLayerDuration(layer);
    let previous = -1;
    for (let index = 0; index <= 20; index += 1) {
      const source = sourceTimeForVideoLayer(layer, (index / 20) * layer.timeline.duration);
      expect(source).toBeGreaterThanOrEqual(previous);
      previous = source;
    }
    const split = splitPlaybackAtProgress(playback, 0.5);
    expect(split.left.rampPoints[0].speed).toBeCloseTo(1, 6);
    expect(split.left.rampPoints.at(-1)?.speed).toBeCloseTo(0.5, 6);
    expect(split.right.rampPoints[0].speed).toBeCloseTo(0.5, 6);
  });

  it("splits a six-second source into independent shared-source segments with animation continuity", () => {
    const project = createVideoProject("9:16", asset("source", 6));
    const layer = project.layers[0];
    if (layer.kind !== "video") throw new Error("expected footage");
    layer.animation = upsertKeyframe(layer, "transform.opacity", 0, 1, "ease-in-out");
    layer.animation = upsertKeyframe(layer, "transform.opacity", 3, 0.4, "ease-in-out");
    layer.animation = upsertKeyframe(layer, "transform.opacity", 6, 0.9, "ease-out");
    const result = splitVideoClip(project, layer.id, 2);
    const normalized = normalizeProject(updateProjectDuration(result.project));
    const left = normalized.layers.find((candidate) => candidate.id === result.leftId);
    const right = normalized.layers.find((candidate) => candidate.id === result.rightId);
    expect(left?.kind).toBe("video");
    expect(right?.kind).toBe("video");
    if (!left || left.kind !== "video" || !right || right.kind !== "video") throw new Error("expected both split segments");
    expect(left.timeline.duration).toBeCloseTo(2, 4);
    expect(left.trimStart).toBe(0);
    expect(left.trimEnd).toBeCloseTo(2, 4);
    expect(right.timeline.start).toBeCloseTo(2, 4);
    expect(right.trimStart).toBeCloseTo(2, 4);
    expect(right.trimEnd).toBe(6);
    expect(right.timeline.duration).toBeCloseTo(4, 4);
    expect(Object.keys(normalized.assets)).toEqual([asset("source", 6).id]);
    const originalOpacityAtCut = Number(evaluateAnimatedProperty(layer, "transform.opacity", 2));
    expect(Number(evaluateAnimatedProperty(left, "transform.opacity", 2))).toBeCloseTo(originalOpacityAtCut, 3);
    expect(Number(evaluateAnimatedProperty(right, "transform.opacity", 2))).toBeCloseTo(originalOpacityAtCut, 3);
    expect(normalized.canvas.duration).toBeCloseTo(6, 4);
  });

  it("keeps effects on both split halves and re-links downstream transitions", () => {
    const project = normalizeProject(createVideoProject("9:16", asset("effects", 6)));
    const first = project.layers[0];
    if (first.kind !== "video") throw new Error("expected footage");
    first.effects = [createTemporalEffect("motion-echo", "ghost-trail")];
    const second = createVideoLayer(asset("after", 4));
    second.timeline.start = 6;
    project.layers.push(second);
    project.assets[asset("after", 4).id] = asset("after", 4);
    const transitioned = normalizeProject(applyTransition(project, second.id, { type: "crossfade", duration: 0.5 }));
    const split = splitVideoClip(transitioned, first.id, 2);
    const left = split.project.layers.find((layer) => layer.id === split.leftId);
    const right = split.project.layers.find((layer) => layer.id === split.rightId);
    if (!left || left.kind !== "video" || !right || right.kind !== "video") throw new Error("expected split halves");
    expect(left.effects).toHaveLength(1);
    expect(right.effects).toHaveLength(1);
    expect(left.effects[0]).not.toBe(right.effects[0]);
    const downstream = split.project.layers.find((layer) => layer.id === second.id);
    if (!downstream || downstream.kind !== "video") throw new Error("expected downstream");
    expect(downstream.transitionIn?.fromLayerId).toBe(right.id);
  });

  it("supports ordinary delete, ripple delete, gap closing and duplicates", () => {
    const project = normalizeProject(createVideoProject("4:5", asset("a", 3)));
    const second = createVideoLayer(asset("b", 3));
    second.timeline.start = 3;
    const third = createVideoLayer(asset("c", 3));
    third.timeline.start = 6;
    project.layers.push(second, third);
    project.assets[asset("b", 3).id] = asset("b", 3);
    project.assets[asset("c", 3).id] = asset("c", 3);
    const withGap = removeVideoClip(project, second.id, false);
    expect(withGap.layers.find((layer) => layer.id === third.id)?.timeline.start).toBe(6);
    const rippled = removeVideoClip(project, second.id, true);
    expect(rippled.layers.find((layer) => layer.id === third.id)?.timeline.start).toBe(3);
    const gapped = normalizeProject({
      ...project,
      layers: project.layers.map((layer) => layer.id === third.id ? { ...layer, timeline: { ...layer.timeline, start: 8 } } : layer),
    });
    const closed = closeSequenceGap(gapped, third.id);
    expect(closed.layers.find((layer) => layer.id === third.id)?.timeline.start).toBeLessThan(8);
    const duplicate = duplicateVideoClip(project, firstVideoId(project));
    expect(duplicate.project.layers).toHaveLength(4);
    expect(duplicate.project.layers.find((layer) => layer.id === duplicate.layerId)?.timeline.start).toBe(9);
  });

  it("reorders the magnetic sequence and preserves stack order", () => {
    const project = normalizeProject(createVideoProject("1:1", asset("a", 2)));
    const second = createVideoLayer(asset("b", 2));
    second.timeline.start = 2;
    project.layers.push(second);
    project.assets[asset("b", 2).id] = asset("b", 2);
    const ids = getVideoClips(project).map((clip) => clip.id);
    const reordered = layoutSequence(project, "V1", [ids[1], ids[0]]);
    const clips = getVideoClips(reordered);
    expect(clips.map((clip) => clip.id)).toEqual([ids[1], ids[0]]);
    expect(clips[0].timeline.start).toBe(0);
    expect(clips[1].timeline.start).toBe(2);
    expect(reordered.layers.filter((layer) => layer.kind === "video").map((layer) => layer.id)).toEqual([ids[1], ids[0]]);
  });

  it("applies genuine overlap transitions, contributes both clips, and removes cleanly", () => {
    const project = normalizeProject(createVideoProject("4:5", asset("a", 4)));
    const second = createVideoLayer(asset("b", 4));
    second.timeline.start = 4;
    project.layers.push(second);
    project.assets[asset("b", 4).id] = asset("b", 4);
    const normalized = normalizeProject(updateProjectDuration(project));
    const applied = applyTransition(normalized, second.id, { type: "crossfade", duration: 0.8, easing: "linear" });
    const target = applied.layers.find((layer) => layer.id === second.id);
    expect(target?.kind).toBe("video");
    if (!target || target.kind !== "video") throw new Error("expected target");
    expect(target.timeline.start).toBeCloseTo(3.2, 4);
    expect(resolveTransition(applied, target, 3.4)?.progress).toBeCloseTo(0.25, 3);
    const incomingStyle = transitionStyleForClip(applied, target, 3.4);
    const outgoing = applied.layers.find((layer) => layer.kind === "video" && layer.id === target.transitionIn?.fromLayerId);
    if (!outgoing || outgoing.kind !== "video") throw new Error("expected outgoing");
    const outgoingStyle = transitionStyleForClip(applied, outgoing, 3.4);
    expect(incomingStyle.alphaFactor).toBeCloseTo(0.25, 2);
    expect(outgoingStyle.alphaFactor).toBeCloseTo(1, 2);
    expect(incomingStyle.audioGain).toBeCloseTo(0.25, 2);
    const removed = normalizeProject(removeTransition(applied, second.id));
    const restored = removed.layers.find((layer) => layer.id === second.id);
    expect(restored?.kind).toBe("video");
    if (!restored || restored.kind !== "video") throw new Error("expected restored clip");
    expect(restored.transitionIn).toBeNull();
    expect(restored.timeline.start).toBeCloseTo(4, 3);
  });

  it("migrates Phase 7 schema 2 projects with safe defaults without changing output timing", () => {
    const project = normalizeProject(createVideoProject("9:16", asset("legacy", 5)));
    const old = {
      ...structuredClone(project),
      schemaVersion: 2,
      cover: undefined,
      safeAreas: undefined,
      soundtrack: undefined,
      layers: project.layers.map((layer) => layer.kind === "video" ? { ...layer, trackId: undefined, playback: undefined, audio: undefined, transitionIn: undefined } : layer),
    };
    const migrated = normalizeProject(old);
    const video = migrated.layers[0];
    expect(migrated.schemaVersion).toBe(3);
    if (video.kind !== "video") throw new Error("expected video");
    expect(video.timeline.duration).toBe(5);
    expect(video.trackId).toBe("V1");
    expect(video.playback.speed).toBe(1);
    expect(video.audio.enabled).toBe(true);
    expect(migrated.cover.time).toBe(0);
    expect(migrated.safeAreas.enabled).toBe(false);
    expect(migrated.soundtrack).toBeNull();
  });

  it("normalizes color finishing, cover, safe areas and soundtrack metadata", () => {
    const project = normalizeProject(createVideoProject("4:5", asset("a", 10)));
    project.cover.time = 99;
    project.safeAreas = { enabled: true, titleSafe: false, captionSafe: true, grid: true };
    project.assets["music"] = { ...asset("music", 30), mediaType: "audio", mimeType: "audio/mpeg" };
    project.soundtrack = { assetId: "music", timelineStart: 1, sourceIn: 2, sourceOut: 99, gainDb: 20, muted: false, fadeIn: -1, fadeOut: 2, loop: true, loopCrossfade: 9, ducking: { enabled: true, amountDb: 99, thresholdDb: -99, attack: 0, release: 99 } };
    project.layers[0].color = { ...project.layers[0].color, temperature: 5, tint: -3, vignette: 4, grain: -2, sharpen: 9, highlights: 8, shadows: -8 };
    const normalized = normalizeProject(project);
    expect(normalized.cover.time).toBeCloseTo(9.9999, 3);
    expect(normalized.layers[0].color).toMatchObject({ temperature: 1, tint: -1, vignette: 1, grain: 0, sharpen: 1, highlights: 1, shadows: -1 });
    expect(normalized.soundtrack).toMatchObject({ assetId: "music", timelineStart: 1, sourceIn: 2, sourceOut: 30, gainDb: 12, fadeIn: 0, fadeOut: 2, loop: true, loopCrossfade: 0.25, ducking: { enabled: true, amountDb: 24, thresholdDb: -60, attack: 0.01, release: 3 } });
  });
});

function firstVideoId(project: ReturnType<typeof createVideoProject>): string {
  const layer = project.layers.find((candidate) => candidate.kind === "video");
  if (!layer) throw new Error("expected video");
  return layer.id;
}
