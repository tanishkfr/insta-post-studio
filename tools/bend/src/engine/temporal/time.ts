import type { BendLayer, BendProject, TemporalCurve, TemporalDirection, TemporalEffectInstance } from "../core/types";
import { layerEndAt, layerStartAt, sourceTimeAt } from "../core/timeline";

export function clampTemporalProjectTime(layer: BendLayer, time: number): number {
  return Math.min(layerEndAt(layer) - 0.0001, Math.max(layerStartAt(layer), Number.isFinite(time) ? time : layerStartAt(layer)));
}

export function sourceTimeForTemporalSample(layer: BendLayer, projectTime: number): number {
  return sourceTimeAt(layer, clampTemporalProjectTime(layer, projectTime));
}

export function offsetProjectTime(layer: BendLayer, projectTime: number, offset: number, mode: "clip" | "loop" = "clip"): number {
  const start = layerStartAt(layer);
  const end = Math.max(start + 0.0001, layerEndAt(layer) - 0.0001);
  const span = Math.max(0.0001, end - start);
  const requested = projectTime + (Number.isFinite(offset) ? offset : 0);
  if (mode === "loop") {
    const wrapped = ((requested - start) % span + span) % span;
    return start + wrapped;
  }
  return Math.min(end, Math.max(start, requested));
}

export function motionEchoSampleTimes(layer: BendLayer, projectTime: number, count: number, spacing: number, direction: TemporalDirection, range: number): number[] {
  const safeCount = Math.max(0, Math.min(8, Math.round(count)));
  const times: number[] = [];
  for (let index = 1; index <= safeCount; index += 1) {
    const sign = direction === "forward" ? 1 : direction === "both" && index % 2 === 0 ? 1 : -1;
    const offset = Math.min(Math.max(0, range), Math.max(0, spacing) * index) * sign;
    times.push(offsetProjectTime(layer, projectTime, offset));
  }
  return times;
}

export function timeSliceSampleTime(layer: BendLayer, projectTime: number, position: number, offset: number, direction: "backward" | "forward", curve: TemporalCurve, speed: number): number {
  const shaped = curveValue(Math.min(1, Math.max(0, position)), curve);
  const sign = direction === "forward" ? 1 : -1;
  return offsetProjectTime(layer, projectTime, sign * Math.max(0, offset) * shaped * Math.max(0.1, speed));
}

export function curveValue(value: number, curve: TemporalCurve): number {
  const t = Math.min(1, Math.max(0, value));
  if (curve === "ease-in") return t * t;
  if (curve === "ease-out") return 1 - (1 - t) * (1 - t);
  if (curve === "ease-in-out") return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  if (curve === "wave") return (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  return t;
}

export function seededUnit(seed: string, index: number): number {
  let hash = 2166136261 ^ index;
  for (let character = 0; character < seed.length; character += 1) {
    hash ^= seed.charCodeAt(character);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

export function frameIndexAt(layer: BendLayer, projectTime: number, fps: number): number {
  return Math.max(0, Math.round((clampTemporalProjectTime(layer, projectTime) - layerStartAt(layer)) * Math.max(1, fps)));
}

export function temporalStackSignature(project: BendProject, layer: BendLayer): string {
  const asset = layer.kind === "video" ? project.assets[layer.assetId] : null;
  return JSON.stringify({
    layer: layer.id,
    kind: layer.kind,
    canvas: { width: project.canvas.width, height: project.canvas.height, fps: project.canvas.fps },
    asset: asset ? { id: asset.id, duration: asset.duration, size: asset.size, storageKey: asset.storageKey, videoStartTime: asset.videoStartTime ?? 0 } : null,
    timeline: layer.timeline,
    trim: layer.kind === "video" ? [layer.trimStart, layer.trimEnd] : null,
    playback: layer.kind === "video" ? layer.playback : null,
    effects: layer.effects,
    animation: layer.animation,
  });
}

export function isSupportedTemporalStack(effects: TemporalEffectInstance[]): { supported: boolean; reason?: string } {
  const feedbackIndex = effects.findIndex((effect) => effect.id === "frame-feedback");
  if (feedbackIndex >= 0 && feedbackIndex !== effects.length - 1) return { supported: false, reason: "Frame Feedback must remain the last temporal effect so its replay state stays deterministic." };
  if (effects.filter((effect) => effect.id === "frame-feedback").length > 1) return { supported: false, reason: "A layer can contain only one Frame Feedback state." };
  return { supported: true };
}

/**
 * Estimates how many nested source samples a single output frame can require.
 * Temporal effects recursively resample the effects before them, so counts
 * multiply. This is intentionally conservative and used to warn before a
 * pathological stack makes interactive preview look frozen.
 */
export function estimateTemporalSamplingLoad(effects: TemporalEffectInstance[]): number {
  let load = 1;
  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.id === "motion-echo") load *= Math.max(1, Math.min(8, Math.round(effect.echoCount)));
    if (effect.id === "time-slice") load *= Math.max(1, Math.min(48, Math.round(effect.sliceCount)));
    if (effect.id === "channel-delay") load *= 3;
  }
  return load;
}

export function isHeavyTemporalStack(effects: TemporalEffectInstance[]): boolean {
  const enabled = effects.filter((effect) => effect.enabled);
  const hasFeedback = enabled.some((effect) => effect.id === "frame-feedback");
  const load = estimateTemporalSamplingLoad(enabled);
  return (hasFeedback && enabled.length > 1) || load > 128;
}
