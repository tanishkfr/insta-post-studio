import { getGeneratorDefinition } from "../generators/registry";
import { getTemporalEffectDefinition } from "../temporal/registry";
import type {
  AnimationEasing,
  AnimationKeyframe,
  AnimationModulator,
  AnimationTrack,
  AnimationValue,
  AnimationValueType,
  BendLayer,
  BendProject,
  LayerAnimation,
  ModulationMode,
  ModulatorType,
} from "../core/types";

export const MAX_ANIMATION_TRACKS = 64;
export const MAX_KEYFRAMES_PER_TRACK = 128;
const MAX_TRACKS = MAX_ANIMATION_TRACKS;
const MAX_KEYFRAMES = MAX_KEYFRAMES_PER_TRACK;
const EPSILON = 0.0001;

export interface AnimatablePropertyDefinition {
  property: string;
  label: string;
  group: "Transform" | "Generator" | "Wave" | "Appearance" | "Mask" | "Effects";
  valueType: AnimationValueType;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: AnimationValue;
  wrapRotation?: boolean;
}

export interface AnimationTrackPatch {
  property: string;
  valueType: AnimationValueType;
  keyframes: AnimationKeyframe[];
  modulator?: AnimationModulator;
}

const TRANSFORM_PROPERTIES: readonly AnimatablePropertyDefinition[] = [
  { property: "transform.x", label: "X position", group: "Transform", valueType: "number", min: -10_000, max: 10_000, step: 1, defaultValue: 0 },
  { property: "transform.y", label: "Y position", group: "Transform", valueType: "number", min: -10_000, max: 10_000, step: 1, defaultValue: 0 },
  { property: "transform.scale", label: "Scale", group: "Transform", valueType: "number", min: 0.05, max: 8, step: 0.01, defaultValue: 1 },
  { property: "transform.rotation", label: "Rotation", group: "Transform", valueType: "number", min: -360, max: 360, step: 1, defaultValue: 0, wrapRotation: true },
  { property: "transform.opacity", label: "Opacity", group: "Transform", valueType: "number", min: 0, max: 1, step: 0.01, defaultValue: 1 },
];

const WAVE_PROPERTIES: readonly AnimatablePropertyDefinition[] = [
  { property: "wave.intensity", label: "Wave intensity", group: "Wave", valueType: "number", min: 0, max: 1, step: 0.01, defaultValue: 0.35 },
  { property: "wave.frequency", label: "Wave frequency", group: "Wave", valueType: "number", min: 0.2, max: 12, step: 0.1, defaultValue: 3.4 },
  { property: "wave.speed", label: "Wave speed", group: "Wave", valueType: "number", min: -3, max: 3, step: 0.01, defaultValue: 0.7 },
  { property: "wave.direction", label: "Wave direction", group: "Wave", valueType: "number", min: 0, max: 360, step: 1, defaultValue: 18, wrapRotation: true },
  { property: "wave.phase", label: "Wave phase", group: "Wave", valueType: "number", min: 0, max: 360, step: 1, defaultValue: 0, wrapRotation: true },
];

const COLOR_PROPERTIES: readonly AnimatablePropertyDefinition[] = [
  { property: "color.brightness", label: "Brightness", group: "Appearance", valueType: "number", min: -1, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.contrast", label: "Contrast", group: "Appearance", valueType: "number", min: -1, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.saturation", label: "Saturation", group: "Appearance", valueType: "number", min: -1, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.hue", label: "Hue rotation", group: "Appearance", valueType: "number", min: -180, max: 180, step: 1, defaultValue: 0, wrapRotation: true },
  { property: "color.temperature", label: "Temperature", group: "Appearance", valueType: "number", min: -1, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.tint", label: "Tint", group: "Appearance", valueType: "number", min: -1, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.highlights", label: "Highlights", group: "Appearance", valueType: "number", min: -1, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.shadows", label: "Shadows", group: "Appearance", valueType: "number", min: -1, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.vignette", label: "Vignette", group: "Appearance", valueType: "number", min: 0, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.grain", label: "Film grain", group: "Appearance", valueType: "number", min: 0, max: 1, step: 0.01, defaultValue: 0 },
  { property: "color.sharpen", label: "Sharpen", group: "Appearance", valueType: "number", min: 0, max: 1, step: 0.01, defaultValue: 0 },
];

const MASK_PROPERTIES: readonly AnimatablePropertyDefinition[] = [
  { property: "mask.x", label: "Mask X", group: "Mask", valueType: "number", min: -1, max: 2, step: 0.001, defaultValue: 0.5 },
  { property: "mask.y", label: "Mask Y", group: "Mask", valueType: "number", min: -1, max: 2, step: 0.001, defaultValue: 0.5 },
  { property: "mask.width", label: "Mask width", group: "Mask", valueType: "number", min: 0.01, max: 2, step: 0.001, defaultValue: 0.7 },
  { property: "mask.height", label: "Mask height", group: "Mask", valueType: "number", min: 0.01, max: 2, step: 0.001, defaultValue: 0.7 },
  { property: "mask.rotation", label: "Mask rotation", group: "Mask", valueType: "number", min: -360, max: 360, step: 1, defaultValue: 0, wrapRotation: true },
  { property: "mask.feather", label: "Mask feather", group: "Mask", valueType: "number", min: 0, max: 1, step: 0.01, defaultValue: 0.18 },
  { property: "mask.angle", label: "Gradient direction", group: "Mask", valueType: "number", min: -360, max: 360, step: 1, defaultValue: 90, wrapRotation: true },
  { property: "mask.falloff", label: "Gradient falloff", group: "Mask", valueType: "number", min: 0.01, max: 1, step: 0.01, defaultValue: 0.55 },
];

export function createEmptyAnimation(): LayerAnimation {
  return { version: 1, tracks: [] };
}

export function getAnimatableProperties(layer: BendLayer): AnimatablePropertyDefinition[] {
  const properties = [...TRANSFORM_PROPERTIES];
  properties.push(...COLOR_PROPERTIES);
  // Keep mask animation definitions available even while the mask is off.
  // Otherwise toggling a mask off would normalize its tracks away and
  // irreversibly lose an animation the user built.
  properties.push(...MASK_PROPERTIES);
  if (layer.kind === "video") {
    properties.push(...WAVE_PROPERTIES);
  } else {
    const definition = getGeneratorDefinition(layer.generator.id);
    for (const parameter of definition.parameters) {
      if (parameter.key === "duration" || parameter.key === "seed" || parameter.key === "simulationQuality" || parameter.key === "renderQuality") continue;
      properties.push({
        property: `generator.${parameter.key}`,
        label: parameter.label,
        group: "Generator",
        valueType: parameter.type === "range" ? "number" : "enum",
        min: parameter.min,
        max: parameter.max,
        step: parameter.step,
        defaultValue: readValue(layer.generator, parameter.key, parameter.type === "range" ? 0 : ""),
      });
    }
  }
  for (const effect of layer.effects) {
    const definition = getTemporalEffectDefinition(effect.id);
    for (const parameter of definition.parameters) {
      if (parameter.kind !== "number") continue;
      properties.push({
        property: `effects.${effect.instanceId}.${parameter.key}`,
        label: `${definition.name} · ${parameter.label}`,
        group: "Effects",
        valueType: "number",
        min: parameter.min,
        max: parameter.max,
        step: parameter.step,
        defaultValue: readValue(effect, parameter.key, 0),
      });
    }
  }
  return properties;
}

export function getPropertyDefinition(layer: BendLayer, property: string): AnimatablePropertyDefinition | undefined {
  return getAnimatableProperties(layer).find((candidate) => candidate.property === property);
}

export function getAnimationTrack(layer: BendLayer, property: string): AnimationTrack | undefined {
  return layer.animation?.tracks.find((track) => track.property === property);
}

export function getTargetValue(layer: BendLayer, property: string): AnimationValue {
  const parts = property.split(".");
  if (parts[0] === "transform" && parts[1]) return readValue(layer.transform, parts[1], getPropertyDefinition(layer, property)?.defaultValue ?? 0);
  if (parts[0] === "generator" && layer.kind === "procedural" && parts[1]) return readValue(layer.generator, parts[1], getPropertyDefinition(layer, property)?.defaultValue ?? 0);
  if (parts[0] === "wave" && layer.kind === "video" && parts[1]) return readValue(layer.wave, parts[1], getPropertyDefinition(layer, property)?.defaultValue ?? 0);
  if (parts[0] === "color" && parts[1]) return readValue(layer.color, parts[1], getPropertyDefinition(layer, property)?.defaultValue ?? 0);
  if (parts[0] === "mask" && parts[1]) return readValue(layer.mask, parts[1], getPropertyDefinition(layer, property)?.defaultValue ?? 0);
  if (parts[0] === "effects" && parts[1] && parts[2]) {
    const effect = layer.effects.find((candidate) => candidate.instanceId === parts[1]);
    if (effect) return readValue(effect, parts[2], getPropertyDefinition(layer, property)?.defaultValue ?? 0);
  }
  return getPropertyDefinition(layer, property)?.defaultValue ?? 0;
}

export function setTargetValue(layer: BendLayer, property: string, value: AnimationValue): BendLayer {
  const next = structuredClone(layer);
  const parts = property.split(".");
  if (parts[0] === "transform" && parts[1]) {
    (next.transform as unknown as Record<string, AnimationValue>)[parts[1]] = value;
  } else if (parts[0] === "generator" && next.kind === "procedural" && parts[1]) {
    (next.generator as unknown as Record<string, AnimationValue>)[parts[1]] = value;
  } else if (parts[0] === "wave" && next.kind === "video" && parts[1]) {
    (next.wave as unknown as Record<string, AnimationValue>)[parts[1]] = value;
  } else if (parts[0] === "color" && parts[1]) {
    (next.color as unknown as Record<string, AnimationValue>)[parts[1]] = value;
  } else if (parts[0] === "mask" && parts[1]) {
    (next.mask as unknown as Record<string, AnimationValue>)[parts[1]] = value;
  } else if (parts[0] === "effects" && parts[1] && parts[2]) {
    const effect = next.effects.find((candidate) => candidate.instanceId === parts[1]);
    if (effect) (effect as unknown as Record<string, AnimationValue>)[parts[2]] = value;
  }
  return next;
}

export function normalizeAnimation(value: unknown, layer: BendLayer): LayerAnimation {
  if (value === undefined || value === null) return createEmptyAnimation();
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tracks)) {
    throw new Error("This BEND layer contains an invalid animation document.");
  }
  const tracks: AnimationTrack[] = [];
  for (const rawTrack of value.tracks.slice(0, MAX_TRACKS)) {
    if (!isRecord(rawTrack) || typeof rawTrack.property !== "string") continue;
    const definition = getPropertyDefinition(layer, rawTrack.property);
    if (!definition) continue;
    const keyframes = Array.isArray(rawTrack.keyframes)
      ? rawTrack.keyframes.slice(0, MAX_KEYFRAMES).flatMap((rawKeyframe) => normalizeKeyframe(rawKeyframe, definition))
      : [];
    if (keyframes.length === 0 && !rawTrack.modulator) continue;
    const track: AnimationTrack = {
      id: stringOr(rawTrack.id, makeId("track")),
      property: definition.property,
      valueType: definition.valueType,
      enabled: rawTrack.enabled !== false,
      keyframes,
    };
    if (rawTrack.modulator !== undefined) track.modulator = normalizeModulator(rawTrack.modulator);
    tracks.push(track);
  }
  return { version: 1, tracks };
}

export function createAnimationTrack(layer: BendLayer, property: string, time: number, value?: AnimationValue): AnimationTrack | null {
  const definition = getPropertyDefinition(layer, property);
  if (!definition) return null;
  return {
    id: makeId("track"),
    property,
    valueType: definition.valueType,
    enabled: true,
    keyframes: [{ id: makeId("key"), time: clampTime(time, layer), value: clampValue(value ?? getTargetValue(layer, property), definition), easing: "ease-in-out" }],
  };
}

export function upsertKeyframe(layer: BendLayer, property: string, time: number, value: AnimationValue, easing?: AnimationEasing): LayerAnimation {
  const animation = normalizeAnimation(layer.animation, layer);
  const definition = getPropertyDefinition(layer, property);
  if (!definition) return animation;
  const tracks = animation.tracks.map((track) => ({ ...track, keyframes: [...track.keyframes] }));
  let track = tracks.find((candidate) => candidate.property === property);
  if (!track) {
    track = createAnimationTrack(layer, property, time, value) ?? undefined;
    if (track) tracks.push(track);
  }
  if (!track) return animation;
  const safeTime = clampTime(time, layer);
  const existing = track.keyframes.find((keyframe) => Math.abs(keyframe.time - safeTime) < EPSILON);
  if (existing) {
    existing.value = clampValue(value, definition);
    if (easing) existing.easing = easing;
  } else {
    track.keyframes.push({ id: makeId("key"), time: safeTime, value: clampValue(value, definition), easing: easing ?? "ease-in-out" });
  }
  track.keyframes.sort((a, b) => a.time - b.time);
  return { version: 1, tracks };
}

export function removeKeyframeAt(animation: LayerAnimation, property: string, time: number): LayerAnimation {
  return {
    version: 1,
    tracks: animation.tracks
      .map((track) => track.property === property ? { ...track, keyframes: track.keyframes.filter((keyframe) => Math.abs(keyframe.time - time) >= EPSILON) } : track)
      .filter((track) => track.keyframes.length > 0 || track.modulator),
  };
}

export function moveKeyframe(animation: LayerAnimation, property: string, keyframeId: string, time: number, layer: BendLayer): LayerAnimation {
  return {
    version: 1,
    tracks: animation.tracks.map((track) => track.property !== property
      ? track
      : { ...track, keyframes: track.keyframes.map((keyframe) => keyframe.id === keyframeId ? { ...keyframe, time: clampTime(time, layer) } : keyframe).sort((a, b) => a.time - b.time) }),
  };
}

export function evaluateAnimatedProperty(layer: BendLayer, property: string, projectTime: number): AnimationValue {
  const definition = getPropertyDefinition(layer, property);
  const base = getTargetValue(layer, property);
  const track = getAnimationTrack(layer, property);
  if (!definition || !track || track.enabled === false) return base;
  const localTime = clampTime(projectTime - layer.timeline.start, layer);
  const keyed = evaluateKeyframes(track, localTime, definition, base);
  if (!track.modulator || !track.modulator.enabled || definition.valueType !== "number" || typeof keyed !== "number") return clampValue(keyed, definition);
  const modulated = combineModulation(keyed, evaluateModulator(track.modulator, localTime), track.modulator.mode);
  return clampValue(modulated, definition);
}

export function evaluateAnimatedLayer(project: BendProject, layer: BendLayer, projectTime: number): BendLayer {
  let next = structuredClone(layer);
  for (const track of layer.animation?.tracks ?? []) {
    if (!track.enabled) continue;
    next = setTargetValue(next, track.property, evaluateAnimatedProperty(layer, track.property, projectTime));
  }
  void project;
  return next;
}

export function evaluateKeyframes(track: AnimationTrack, time: number, definition: AnimatablePropertyDefinition, fallback: AnimationValue): AnimationValue {
  if (track.keyframes.length === 0) return fallback;
  const keyframes = [...track.keyframes].sort((a, b) => a.time - b.time);
  let previous = keyframes[0];
  let next: AnimationKeyframe | undefined;
  for (const keyframe of keyframes) {
    if (keyframe.time <= time + EPSILON) previous = keyframe;
    else {
      next = keyframe;
      break;
    }
  }
  if (!next || next.time <= previous.time + EPSILON) return clampValue(previous.value, definition);
  if (definition.valueType !== "number" || typeof previous.value !== "number" || typeof next.value !== "number") return clampValue(previous.value, definition);
  const rawProgress = (time - previous.time) / (next.time - previous.time);
  const progress = evaluateEasingProgress(Math.min(1, Math.max(0, rawProgress)), previous.easing, previous.bezier);
  let endValue = next.value;
  let startValue = previous.value;
  if (definition.wrapRotation) {
    let delta = endValue - startValue;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    endValue = startValue + delta;
  }
  return clampValue(startValue + (endValue - startValue) * progress, definition);
}

export function createDefaultModulator(type: ModulatorType = "sine"): AnimationModulator {
  return {
    type,
    enabled: true,
    mode: "add",
    frequency: 1,
    amplitude: 0.15,
    offset: 0,
    phase: 0,
    dutyCycle: 0.5,
    intensity: 1,
    seed: "BEND-MOD-01",
    smoothness: 0.8,
    start: 0,
    end: 1,
    duration: 4,
    easing: "linear",
  };
}

export function normalizeModulator(value: unknown): AnimationModulator {
  const raw = isRecord(value) ? value : {};
  const type = choice<ModulatorType>(raw.type, ["sine", "triangle", "pulse", "smooth-noise", "ramp"], "sine");
  return {
    ...createDefaultModulator(type),
    enabled: raw.enabled !== false,
    mode: choice<ModulationMode>(raw.mode, ["add", "multiply", "replace"], "add"),
    frequency: number(raw.frequency, 1, 0, 30),
    amplitude: number(raw.amplitude, 0.15, -8, 8),
    offset: number(raw.offset, 0, -8, 8),
    phase: number(raw.phase, 0, -360, 360),
    dutyCycle: number(raw.dutyCycle, 0.5, 0.01, 0.99),
    intensity: number(raw.intensity, 1, 0, 1),
    seed: stringOr(raw.seed, "BEND-MOD-01"),
    smoothness: number(raw.smoothness, 0.8, 0, 1),
    start: number(raw.start, 0, -8, 8),
    end: number(raw.end, 1, -8, 8),
    duration: number(raw.duration, 4, 0.1, 600),
    easing: choice<AnimationEasing>(raw.easing, ["hold", "linear", "ease-in", "ease-out", "ease-in-out", "cubic-bezier"], "linear"),
  };
}

export function evaluateModulator(modulator: AnimationModulator, time: number): number {
  const normalized = normalizeModulator(modulator);
  const phase = normalized.phase / 360;
  const position = time * normalized.frequency + phase;
  let signal: number;
  switch (normalized.type) {
    case "triangle": {
      const cycle = fract(position);
      signal = 1 - 4 * Math.abs(Math.round(cycle) - cycle);
      break;
    }
    case "pulse":
      signal = fract(position) < normalized.dutyCycle ? 1 : -1;
      break;
    case "smooth-noise":
      signal = smoothNoise(position, normalized.seed, normalized.smoothness);
      break;
    case "ramp": {
      const progress = normalized.duration <= 0 ? 1 : clamp01(time / normalized.duration);
      signal = normalized.start + (normalized.end - normalized.start) * evaluateEasingProgress(progress, normalized.easing);
      return normalized.offset + signal * normalized.intensity;
    }
    case "sine":
    default:
      signal = Math.sin(position * Math.PI * 2);
      break;
  }
  return normalized.offset + signal * normalized.amplitude * normalized.intensity;
}

export function combineModulation(base: number, modulation: number, mode: ModulationMode): number {
  if (mode === "multiply") return base * (1 + modulation);
  if (mode === "replace") return modulation;
  return base + modulation;
}

export function getAnimationTrackLabel(layer: BendLayer, property: string): string {
  return getPropertyDefinition(layer, property)?.label ?? property;
}

export function animationSignature(layer: BendLayer): string {
  return JSON.stringify(layer.animation ?? createEmptyAnimation());
}

function normalizeKeyframe(value: unknown, definition: AnimatablePropertyDefinition): AnimationKeyframe[] {
  if (!isRecord(value) || !Number.isFinite(value.time)) return [];
  const rawValue = value.value;
  if (!isAnimationValue(rawValue)) return [];
  return [{
    id: stringOr(value.id, makeId("key")),
    time: Math.max(0, Number(value.time)),
    value: clampValue(rawValue, definition),
    easing: choice<AnimationEasing>(value.easing, ["hold", "linear", "ease-in", "ease-out", "ease-in-out", "cubic-bezier"], "ease-in-out"),
    ...(Array.isArray(value.bezier) && value.bezier.length === 4 ? { bezier: value.bezier.map((point) => number(point, 0.5, 0, 1)) as [number, number, number, number] } : {}),
  }];
}

/** Shared by evaluation and the inspector curve preview. */
export function evaluateEasingProgress(value: number, easing: AnimationEasing, bezier?: [number, number, number, number]): number {
  const progress = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  if (easing === "hold") return 0;
  if (easing === "linear") return progress;
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return 1 - (1 - progress) * (1 - progress);
  if (easing === "ease-in-out") return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  return cubicBezierY(progress, bezier ?? [0.25, 0.1, 0.25, 1]);
}

function cubicBezierY(x: number, bezier: [number, number, number, number]): number {
  const [x1, y1, x2, y2] = bezier;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 16; index += 1) {
    const t = (low + high) / 2;
    if (bezierCoordinate(t, x1, x2) < x) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return bezierCoordinate(t, y1, y2);
}

function bezierCoordinate(t: number, p1: number, p2: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
}

function smoothNoise(position: number, seed: string, smoothness: number): number {
  const floor = Math.floor(position);
  const fraction = position - floor;
  const eased = fraction * fraction * (3 - 2 * fraction) * smoothness + fraction * (1 - smoothness);
  return lerp(hashUnit(seed, floor), hashUnit(seed, floor + 1), eased) * 2 - 1;
}

function hashUnit(seed: string, index: number): number {
  let hash = 2166136261 ^ index;
  for (let character = 0; character < seed.length; character += 1) hash = Math.imul(hash ^ seed.charCodeAt(character), 16777619);
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return ((hash >>> 0) % 10_000) / 10_000;
}

function clampValue(value: AnimationValue, definition: AnimatablePropertyDefinition): AnimationValue {
  if (definition.valueType !== "number") return value;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : Number(definition.defaultValue) || 0;
  return Math.min(definition.max ?? Number.POSITIVE_INFINITY, Math.max(definition.min ?? Number.NEGATIVE_INFINITY, numeric));
}

function readValue(record: object, key: string, fallback: AnimationValue): AnimationValue {
  const value = (record as Record<string, unknown>)[key];
  return isAnimationValue(value) ? value : fallback;
}

function isAnimationValue(value: unknown): value is AnimationValue {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function clampTime(time: number, layer: BendLayer): number {
  const duration = Math.max(0, layer.timeline.duration);
  return Math.min(duration, Math.max(0, Number.isFinite(time) ? time : 0));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
