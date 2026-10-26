import { describe, expect, it } from "vitest";
import { createProceduralLayer, createProject, createVideoLayer, defaultSoundtrackDucking, normalizeProject } from "../../src/engine/core/project";
import { createTemporalEffect } from "../../src/engine/temporal/registry";
import { upsertKeyframe } from "../../src/engine/animation/engine";
import { computeDuckingEnvelope } from "../../src/engine/audio/ducking";
import { soundtrackLoopSummary, soundtrackPlaybackEnd, soundtrackSamplePointsAt, soundtrackSourceDuration } from "../../src/engine/audio/soundtrack";
import { clipWaveformSamples, peakAtSourceTime, soundtrackWaveformSamples, type WaveformPeaks } from "../../src/engine/audio/waveform";
import { copyLayerTreatment, pasteLayerTreatment } from "../../src/engine/editing/treatment";
import { createBendPackage, decodeBendPackage } from "../../src/engine/package/bendPackage";
import { applyTransition, orderVideoClips, removeTransition, splitVideoClip } from "../../src/engine/editing/operations";
import { resolveTransition, transitionStyleForClip } from "../../src/engine/transitions/transition";
import type { ClipTransitionType } from "../../src/engine/core/types";
import type { BendProject, MediaAssetRecord, ProjectSoundtrack, VideoLayer } from "../../src/engine/core/types";

const asset: MediaAssetRecord = {
  id: "asset-video",
  name: "shot.mp4",
  mimeType: "video/mp4",
  mediaType: "video",
  size: 1_000,
  width: 1080,
  height: 1920,
  duration: 12,
  storageKey: "blob",
  audio: { status: "available", codec: "aac", channels: 2, sampleRate: 48_000, startTime: 0 },
};

function videoProject(): BendProject {
  const project = createProject("9:16", "Audio test");
  const layer = createVideoLayer(asset);
  layer.timeline.duration = 12;
  layer.trimEnd = 12;
  project.assets[asset.id] = asset;
  project.layers = [layer];
  project.canvas.duration = 12;
  return normalizeProject(project);
}

function soundtrack(overrides: Partial<ProjectSoundtrack> = {}): ProjectSoundtrack {
  return {
    assetId: "music",
    timelineStart: 1,
    sourceIn: 0,
    sourceOut: 4,
    gainDb: -6,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    loop: true,
    loopCrossfade: 0.05,
    ducking: defaultSoundtrackDucking(),
    ...overrides,
  };
}

describe("Phase 8.1 soundtrack looping", () => {
  it("loops a short source through the composition and ends at the timeline boundary", () => {
    const project = videoProject();
    project.assets.music = { ...asset, id: "music", name: "music.mp3", mimeType: "audio/mpeg", mediaType: "audio", duration: 4 };
    project.soundtrack = soundtrack();
    expect(soundtrackSourceDuration(project.soundtrack)).toBe(4);
    expect(soundtrackPlaybackEnd(project)).toBe(12);
    const summary = soundtrackLoopSummary(project);
    expect(summary).toMatchObject({ playbackDuration: 11, repetitions: 3, loop: true });
  });

  it("uses the real source duration when looping is off", () => {
    const project = videoProject();
    project.soundtrack = soundtrack({ loop: false });
    expect(soundtrackPlaybackEnd(project)).toBe(5);
    expect(soundtrackLoopSummary(project)).toMatchObject({ playbackDuration: 4, repetitions: 1, loop: false });
  });

  it("maps the final partial repetition and crossfades only after a loop boundary", () => {
    const track = soundtrack();
    expect(soundtrackSamplePointsAt(track, 1, 12)).toEqual([{ sourceTime: 0, gain: 1, iteration: 0 }]);
    const late = soundtrackSamplePointsAt(track, 4.9, 12);
    expect(late).toHaveLength(1);
    expect(late[0].sourceTime).toBeCloseTo(3.9, 6);
    expect(late[0].gain).toBeCloseTo(1, 6);
    const boundary = soundtrackSamplePointsAt(track, 5, 12);
    expect(boundary).toHaveLength(2);
    expect(boundary[0].sourceTime).toBeCloseTo(3.95, 6);
    expect(boundary[0].gain).toBeCloseTo(1, 6);
    expect(boundary[1].sourceTime).toBeCloseTo(0, 6);
    expect(boundary[1].gain).toBeCloseTo(0, 6);
    const crossfadeMidpoint = soundtrackSamplePointsAt(track, 5.025, 12);
    expect(crossfadeMidpoint[0].gain).toBeCloseTo(Math.SQRT1_2, 5);
    expect(crossfadeMidpoint[1].gain).toBeCloseTo(Math.SQRT1_2, 5);
    expect(soundtrackSamplePointsAt(track, 11.999, 12)[0].sourceTime).toBeCloseTo(2.999, 3);
    expect(soundtrackSamplePointsAt(track, 12, 12)).toEqual([]);
  });
});

describe("Phase 8.1 deterministic ducking", () => {
  it("does not duck silence or a disabled setting", () => {
    const silence = new Float32Array(4800);
    const disabled = computeDuckingEnvelope(silence, silence, 48_000, { ...defaultSoundtrackDucking(), enabled: false });
    expect(Array.from(disabled.gain.every((value) => value === 1) ? [1] : [])).toEqual([1]);
    const enabled = computeDuckingEnvelope(silence, silence, 48_000, { ...defaultSoundtrackDucking(), enabled: true });
    expect(enabled.maxReductionDb).toBe(0);
    expect(enabled.activeRatio).toBe(0);
  });

  it("reduces the music under loud clip audio with attack and release smoothing", () => {
    const sampleRate = 48_000;
    const length = sampleRate * 2;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      const value = index < sampleRate * 0.5 ? 0.5 * Math.sin(index / 10) : 0;
      left[index] = value;
      right[index] = value;
    }
    const result = computeDuckingEnvelope(left, right, sampleRate, { ...defaultSoundtrackDucking(), enabled: true, amountDb: 12, thresholdDb: -36, attack: 0.08, release: 0.4 });
    expect(result.maxReductionDb).toBeGreaterThan(9);
    expect(result.maxReductionDb).toBeLessThanOrEqual(12.01);
    expect(result.activeRatio).toBeGreaterThan(0.3);
    expect(result.gain[0]).toBeGreaterThan(0.999);
    expect(result.gain[Math.floor(sampleRate * 0.25)]).toBeLessThan(0.5);
    expect(result.gain[length - 1]).toBeGreaterThan(0.95);
  });
});

describe("Phase 8.1 waveform mapping", () => {
  const peaks: WaveformPeaks = { duration: 4, peak: 1, buckets: Float32Array.from([0.1, 0.5, 1, 0.5]) };

  it("samples source peaks and clamps the source edge", () => {
    expect(peakAtSourceTime(peaks, 0)).toBeCloseTo(0.1, 5);
    expect(peakAtSourceTime(peaks, 1.1)).toBeCloseTo(0.5, 5);
    expect(peakAtSourceTime(peaks, 2.9)).toBeCloseTo(1, 5);
    expect(peakAtSourceTime(peaks, 99)).toBeCloseTo(0.5, 5);
    expect(peakAtSourceTime(peaks, -1)).toBeCloseTo(0.1, 5);
  });

  it("follows trims, reverse, and speed without decoding samples again", () => {
    const project = videoProject();
    const layer = project.layers[0] as VideoLayer;
    layer.trimStart = 0;
    layer.trimEnd = 4;
    layer.timeline.duration = 4;
    layer.playback.speed = 1;
    const forward = Array.from(clipWaveformSamples(peaks, layer, 5));
    expect(forward[0]).toBeCloseTo(0.1, 5);
    expect(forward[2]).toBeCloseTo(1, 5);
    expect(forward[4]).toBeCloseTo(0.5, 5);
    layer.playback.reverse = true;
    const reverse = Array.from(clipWaveformSamples(peaks, layer, 5));
    expect(reverse[0]).toBeCloseTo(0.5, 5);
    expect(reverse[1]).toBeCloseTo(0.5, 5);
    expect(reverse[4]).toBeCloseTo(0.1, 5);
    layer.playback.reverse = false;
    layer.playback.speed = 0.5;
    layer.timeline.duration = 8;
    const slow = Array.from(clipWaveformSamples(peaks, layer, 9));
    expect(slow[0]).toBeCloseTo(0.1, 5);
    expect(slow[4]).toBeCloseTo(1, 5);
    expect(slow[8]).toBeCloseTo(0.5, 5);
  });

  it("renders repeated music peaks with the same loop timing as export", () => {
    const project = videoProject();
    project.soundtrack = soundtrack();
    const samples = soundtrackWaveformSamples(peaks, project, project.soundtrack, 12, 12);
    expect(samples[0]).toBeCloseTo(0.1, 5);
    expect(samples[10]).toBeGreaterThan(0);
    expect(samples[11]).toBe(0);
    expect(samples.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe("Phase 8.1 transition robustness", () => {
  const types: ClipTransitionType[] = ["crossfade", "dip-black", "wipe", "zoom", "glitch", "distortion"];

  function threeClipProject(): BendProject {
    const project = createProject("4:5", "Transitions");
    project.assets[asset.id] = asset;
    project.layers = [0, 2, 4].map((start) => {
      const layer = createVideoLayer(asset);
      layer.timeline = { start, duration: 2 };
      layer.trimEnd = 2;
      return layer;
    });
    project.canvas.duration = 6;
    return normalizeProject(project);
  }

  it("applies, resolves, crossfades, and removes all six transition types", () => {
    for (const type of types) {
      const project = threeClipProject();
      const second = project.layers[1] as VideoLayer;
      const applied = normalizeProject(applyTransition(project, second.id, { type, duration: 0.5, direction: "right", intensity: 0.7, easing: "linear" }));
      const incoming = applied.layers.find((layer) => layer.id === second.id) as VideoLayer;
      expect(incoming.transitionIn?.type).toBe(type);
      expect(incoming.transitionIn?.duration).toBeCloseTo(0.5, 5);
      const resolved = resolveTransition(applied, incoming, arrivedMidpoint(applied, incoming));
      expect(resolved).not.toBeNull();
      const style = transitionStyleForClip(applied, incoming, arrivedMidpoint(applied, incoming));
      expect(style.alphaFactor).toBeGreaterThanOrEqual(0);
      if (type === "wipe" || type === "glitch" || type === "distortion") expect(style.filter?.type).toBe(type);
      const removed = normalizeProject(removeTransition(applied, second.id));
      const after = removed.layers.find((layer) => layer.id === second.id) as VideoLayer;
      expect(after.transitionIn).toBeNull();
    }
  });

  it("rejects a split inside the transition and keeps reverse/speed-mapped sources resolvable", () => {
    const project = threeClipProject();
    const second = project.layers[1] as VideoLayer;
    const applied = normalizeProject(applyTransition(project, second.id, { type: "crossfade", duration: 0.6 }));
    const incoming = applied.layers.find((layer) => layer.id === second.id) as VideoLayer;
    const midpoint = arrivedMidpoint(applied, incoming);
    expect(() => splitVideoClip(applied, second.id, midpoint)).toThrow(/transition/i);

    const slowed = structuredClone(applied);
    const slowedIncoming = slowed.layers.find((layer) => layer.id === second.id) as VideoLayer;
    slowedIncoming.playback.speed = 0.5;
    slowedIncoming.playback.reverse = true;
    const normalized = normalizeProject(slowed);
    const source = normalized.layers.find((layer) => layer.id === second.id) as VideoLayer;
    expect(resolveTransition(normalized, source, arrivedMidpoint(normalized, source))).not.toBeNull();
  });

  it("drops transitions that no longer have an adjacent outgoing clip after a reorder", () => {
    const project = threeClipProject();
    const second = project.layers[1] as VideoLayer;
    const applied = normalizeProject(applyTransition(project, second.id, { type: "crossfade", duration: 0.5 }));
    expect(applied.layers.some((layer) => layer.kind === "video" && layer.transitionIn)).toBe(true);
    const reordered = normalizeProject(orderVideoClips(applied, second.id, 1));
    expect(reordered.layers.some((layer) => layer.kind === "video" && layer.id === second.id && layer.transitionIn)).toBe(false);
  });
});

function arrivedMidpoint(project: BendProject, incoming: VideoLayer): number {
  const transition = incoming.transitionIn;
  if (!transition) return incoming.timeline.start;
  const outgoing = project.layers.find((layer) => layer.kind === "video" && layer.id === transition.fromLayerId) as VideoLayer;
  return Math.max(incoming.timeline.start, outgoing.timeline.start + outgoing.timeline.duration - transition.duration) + transition.duration / 2;
}

describe("Phase 8.1 portable audio settings", () => {
  it("round-trips soundtrack looping, crossfade, and ducking through a .bendpkg", async () => {
    const project = videoProject();
    const musicAsset: MediaAssetRecord = { ...asset, id: "music", name: "music.mp3", mimeType: "audio/mpeg", mediaType: "audio", duration: 4 };
    project.assets.music = musicAsset;
    project.soundtrack = { ...soundtrack(), ducking: { enabled: true, amountDb: 14, thresholdDb: -30, attack: 0.12, release: 0.6 } };
    const created = await createBendPackage(project, [
      { record: project.assets[asset.id], blob: new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }) },
      { record: musicAsset, blob: new Blob([new Uint8Array([4, 5, 6])], { type: "audio/mpeg" }) },
    ]);
    const decoded = await decodeBendPackage(created.blob);
    expect(decoded.project.soundtrack).toMatchObject({
      loop: true,
      loopCrossfade: 0.05,
      ducking: { enabled: true, amountDb: 14, thresholdDb: -30, attack: 0.12, release: 0.6 },
    });
  });
});

describe("Phase 8.1 treatment copy and paste", () => {
  it("keeps source and timing while remapping effects and compatible animation", () => {
    const source = createVideoLayer(asset);
    const effect = createTemporalEffect("motion-echo", "ghost");
    source.effects = [effect];
    source.color = { ...source.color, contrast: 0.2, temperature: 0.4, enabled: true };
    source.mask = { ...source.mask, type: "ellipse", width: 0.6 };
    source.blendMode = "screen";
    source.animation = upsertKeyframe(source, "color.contrast", 0, 0.1);
    source.animation = upsertKeyframe(source, `effects.${effect.instanceId}.decay`, 0.5, 0.4);
    source.animation = upsertKeyframe(source, "transform.scale", 0, 1.2);
    const clipboard = copyLayerTreatment(source);

    const target = createVideoLayer(asset);
    target.trimStart = 2;
    target.trimEnd = 8;
    target.timeline.start = 3;
    target.timeline.duration = 2;
    target.animation = upsertKeyframe(target, "transform.x", 0, 120);
    const result = pasteLayerTreatment(target, clipboard);
    const pasted = result.layer as VideoLayer;
    expect(pasted.assetId).toBe(target.assetId);
    expect(pasted.trimStart).toBe(2);
    expect(pasted.trimEnd).toBe(8);
    expect(pasted.timeline).toEqual(target.timeline);
    expect(pasted.color.temperature).toBe(0.4);
    expect(pasted.blendMode).toBe("screen");
    expect(pasted.mask.type).toBe("ellipse");
    expect(pasted.effects).toHaveLength(1);
    expect(pasted.effects[0].instanceId).not.toBe(effect.instanceId);
    const effectTrack = pasted.animation.tracks.find((track) => track.property.startsWith("effects."));
    expect(effectTrack?.property).toBe(`effects.${pasted.effects[0].instanceId}.decay`);
    expect(pasted.animation.tracks.some((track) => track.property === "transform.x")).toBe(true);
    expect(pasted.animation.tracks.some((track) => track.property === "transform.scale")).toBe(false);
    expect(result.pastedTracks).toBe(2);
  });

  it("drops wave animation when pasted into a procedural layer", () => {
    const source = createVideoLayer(asset);
    source.wave = { ...source.wave, enabled: true };
    source.animation = upsertKeyframe(source, "wave.intensity", 0, 0.5);
    const clipboard = copyLayerTreatment(source);
    const procedural = createProceduralLayer("signal-field", "TEST");
    const result = pasteLayerTreatment(procedural, clipboard);
    expect(result.droppedTracks).toBe(1);
    expect(result.layer.animation.tracks.some((track) => track.property.startsWith("wave."))).toBe(false);
  });
});
