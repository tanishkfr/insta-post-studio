import type {
  ChannelDelayEffect,
  FrameFeedbackEffect,
  MotionEchoEffect,
  TemporalBlendMode,
  TemporalCurve,
  TemporalDirection,
  TemporalEffectId,
  TemporalEffectInstance,
  TemporalOrientation,
  TimeSliceEffect,
} from "../core/types";

export type TemporalParameterKind = "number" | "select";

export interface TemporalParameterDefinition {
  key: string;
  label: string;
  kind: TemporalParameterKind;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  advanced?: boolean;
}

export interface TemporalPreset {
  id: string;
  label: string;
  values: Record<string, unknown>;
}

export interface TemporalEffectDefinition {
  id: TemporalEffectId;
  name: string;
  category: "Time" | "Feedback";
  description: string;
  mode: "sampling" | "stateful";
  parameters: TemporalParameterDefinition[];
  presets: TemporalPreset[];
}

const motionEchoPresets: TemporalPreset[] = [
  { id: "ghost-trail", label: "Ghost Trail", values: { echoCount: 4, timeSpacing: 0.08, decay: 0.72, opacity: 0.78, direction: "backward", blendMode: "screen", offsetX: 0.01, offsetY: 0, tint: "#F5F3EF", temporalRange: 0.35 } },
  { id: "long-exposure", label: "Long Exposure", values: { echoCount: 7, timeSpacing: 0.035, decay: 0.84, opacity: 0.86, direction: "backward", blendMode: "lighter", offsetX: 0, offsetY: 0, tint: "#C7FF5B", temporalRange: 0.45 } },
  { id: "stutter", label: "Stutter", values: { echoCount: 3, timeSpacing: 0.18, decay: 0.88, opacity: 0.82, direction: "both", blendMode: "screen", offsetX: 0, offsetY: 0, tint: "#F5F3EF", temporalRange: 0.7 } },
  { id: "afterimage", label: "Afterimage", values: { echoCount: 2, timeSpacing: 0.12, decay: 0.46, opacity: 0.74, direction: "backward", blendMode: "lighten", offsetX: 0.02, offsetY: -0.01, tint: "#C7FF5B", temporalRange: 0.4 } },
];

const timeSlicePresets: TemporalPreset[] = [
  { id: "rolling-time", label: "Rolling Time", values: { sliceCount: 16, temporalOffset: 0.42, direction: "backward", orientation: "horizontal", sliceWidth: 1, offsetCurve: "linear", sliceJitter: 0, blend: 0.12, motionSpeed: 1, seed: "BEND-SLICE-01" } },
  { id: "time-stretch", label: "Time Stretch", values: { sliceCount: 10, temporalOffset: 0.8, direction: "backward", orientation: "vertical", sliceWidth: 0.9, offsetCurve: "ease-in-out", sliceJitter: 0.06, blend: 0.24, motionSpeed: 0.7, seed: "BEND-SLICE-02" } },
  { id: "temporal-fracture", label: "Temporal Fracture", values: { sliceCount: 24, temporalOffset: 0.62, direction: "forward", orientation: "vertical", sliceWidth: 0.78, offsetCurve: "wave", sliceJitter: 0.18, blend: 0.04, motionSpeed: 1.4, seed: "BEND-SLICE-03" } },
  { id: "wave-slice", label: "Wave Slice", values: { sliceCount: 18, temporalOffset: 0.3, direction: "backward", orientation: "horizontal", sliceWidth: 0.7, offsetCurve: "wave", sliceJitter: 0.08, blend: 0.34, motionSpeed: 1.8, seed: "BEND-SLICE-04" } },
];

const frameFeedbackPresets: TemporalPreset[] = [
  { id: "infinite-tunnel", label: "Infinite Tunnel", values: { feedbackAmount: 0.7, decay: 0.86, scale: 1.018, rotation: 0.35, translationX: 0, translationY: 0, blendMode: "screen", colorShift: 0.04, noise: 0 } },
  { id: "residue", label: "Residue", values: { feedbackAmount: 0.58, decay: 0.66, scale: 1.002, rotation: -0.15, translationX: 0.004, translationY: 0, blendMode: "lighter", colorShift: 0.18, noise: 0.02 } },
  { id: "smear", label: "Smear", values: { feedbackAmount: 0.76, decay: 0.78, scale: 1, rotation: 0, translationX: 0.025, translationY: -0.008, blendMode: "screen", colorShift: 0.1, noise: 0.03 } },
  { id: "recursive-drift", label: "Recursive Drift", values: { feedbackAmount: 0.64, decay: 0.9, scale: 0.988, rotation: 0.5, translationX: -0.006, translationY: 0.009, blendMode: "lighten", colorShift: 0.22, noise: 0.06 } },
];

const channelDelayPresets: TemporalPreset[] = [
  { id: "chromatic-ghost", label: "Chromatic Ghost", values: { redDelay: -0.1, greenDelay: 0, blueDelay: 0.1, intensity: 0.82, spatialOffset: 0.006, edgeBehavior: "clamp", temporalClamp: "clip" } },
  { id: "rgb-stutter", label: "RGB Stutter", values: { redDelay: -0.22, greenDelay: 0.08, blueDelay: 0.24, intensity: 0.9, spatialOffset: 0.012, edgeBehavior: "transparent", temporalClamp: "clip" } },
  { id: "signal-drift", label: "Signal Drift", values: { redDelay: 0.05, greenDelay: -0.02, blueDelay: 0.13, intensity: 0.66, spatialOffset: 0.004, edgeBehavior: "clamp", temporalClamp: "loop" } },
  { id: "temporal-split", label: "Temporal Split", values: { redDelay: -0.16, greenDelay: 0, blueDelay: 0.16, intensity: 0.74, spatialOffset: 0.02, edgeBehavior: "transparent", temporalClamp: "clip" } },
];

export const TEMPORAL_EFFECT_REGISTRY: Record<TemporalEffectId, TemporalEffectDefinition> = {
  "motion-echo": {
    id: "motion-echo",
    name: "Motion Echo",
    category: "Time",
    description: "Layer nearby moments into a controlled multi-exposure trail.",
    mode: "sampling",
    parameters: [
      { key: "echoCount", label: "Echo Count", kind: "number", min: 0, max: 8, step: 1 },
      { key: "timeSpacing", label: "Time Spacing", kind: "number", min: 0.01, max: 0.6, step: 0.01 },
      { key: "decay", label: "Decay", kind: "number", min: 0, max: 1, step: 0.01 },
      { key: "opacity", label: "Opacity", kind: "number", min: 0, max: 1, step: 0.01 },
      { key: "direction", label: "Direction", kind: "select", options: ["backward", "forward", "both"], advanced: true },
      { key: "blendMode", label: "Blend Mode", kind: "select", options: ["normal", "screen", "lighter", "lighten", "multiply"], advanced: true },
      { key: "offsetX", label: "Offset X", kind: "number", min: -0.2, max: 0.2, step: 0.01, advanced: true },
      { key: "offsetY", label: "Offset Y", kind: "number", min: -0.2, max: 0.2, step: 0.01, advanced: true },
      { key: "temporalRange", label: "Temporal Range", kind: "number", min: 0.01, max: 2, step: 0.01, advanced: true },
    ],
    presets: motionEchoPresets,
  },
  "time-slice": {
    id: "time-slice",
    name: "Time Slice",
    category: "Time",
    description: "Give each spatial band its own moment from the source.",
    mode: "sampling",
    parameters: [
      { key: "sliceCount", label: "Slice Count", kind: "number", min: 2, max: 48, step: 1 },
      { key: "temporalOffset", label: "Temporal Offset", kind: "number", min: 0, max: 2, step: 0.01 },
      { key: "orientation", label: "Orientation", kind: "select", options: ["horizontal", "vertical"] },
      { key: "direction", label: "Direction", kind: "select", options: ["backward", "forward"], advanced: true },
      { key: "offsetCurve", label: "Offset Curve", kind: "select", options: ["linear", "ease-in", "ease-out", "ease-in-out", "wave"], advanced: true },
      { key: "sliceWidth", label: "Slice Width", kind: "number", min: 0.2, max: 1, step: 0.01, advanced: true },
      { key: "sliceJitter", label: "Slice Jitter", kind: "number", min: 0, max: 0.5, step: 0.01, advanced: true },
      { key: "blend", label: "Blend / Feather", kind: "number", min: 0, max: 1, step: 0.01, advanced: true },
      { key: "motionSpeed", label: "Motion Speed", kind: "number", min: 0.1, max: 3, step: 0.01, advanced: true },
      { key: "seed", label: "Seed", kind: "select", options: [], advanced: true },
    ],
    presets: timeSlicePresets,
  },
  "frame-feedback": {
    id: "frame-feedback",
    name: "Frame Feedback",
    category: "Feedback",
    description: "Feed transformed processed frames back into the next frame.",
    mode: "stateful",
    parameters: [
      { key: "feedbackAmount", label: "Feedback Amount", kind: "number", min: 0, max: 1, step: 0.01 },
      { key: "decay", label: "Decay", kind: "number", min: 0, max: 1, step: 0.01 },
      { key: "scale", label: "Scale", kind: "number", min: 0.92, max: 1.08, step: 0.001 },
      { key: "rotation", label: "Rotation", kind: "number", min: -5, max: 5, step: 0.05, advanced: true },
      { key: "translationX", label: "Translation X", kind: "number", min: -0.08, max: 0.08, step: 0.001, advanced: true },
      { key: "translationY", label: "Translation Y", kind: "number", min: -0.08, max: 0.08, step: 0.001, advanced: true },
      { key: "blendMode", label: "Blend Mode", kind: "select", options: ["normal", "screen", "lighter", "lighten", "multiply"], advanced: true },
      { key: "colorShift", label: "Color Shift", kind: "number", min: 0, max: 1, step: 0.01, advanced: true },
      { key: "noise", label: "Noise / Disturbance", kind: "number", min: 0, max: 1, step: 0.01, advanced: true },
    ],
    presets: frameFeedbackPresets,
  },
  "channel-delay": {
    id: "channel-delay",
    name: "Channel Delay",
    category: "Time",
    mode: "sampling",
    description: "Recombine red, green, and blue from different moments.",
    parameters: [
      { key: "redDelay", label: "Red Delay", kind: "number", min: -0.6, max: 0.6, step: 0.01 },
      { key: "greenDelay", label: "Green Delay", kind: "number", min: -0.6, max: 0.6, step: 0.01 },
      { key: "blueDelay", label: "Blue Delay", kind: "number", min: -0.6, max: 0.6, step: 0.01 },
      { key: "intensity", label: "Intensity", kind: "number", min: 0, max: 1, step: 0.01 },
      { key: "spatialOffset", label: "Spatial Offset", kind: "number", min: 0, max: 0.08, step: 0.001, advanced: true },
      { key: "edgeBehavior", label: "Edge Behavior", kind: "select", options: ["clamp", "transparent"], advanced: true },
      { key: "temporalClamp", label: "Temporal Clamp Mode", kind: "select", options: ["clip", "loop"], advanced: true },
    ],
    presets: channelDelayPresets,
  },
};

export const TEMPORAL_EFFECTS = Object.values(TEMPORAL_EFFECT_REGISTRY);

export function getTemporalEffectDefinition(id: TemporalEffectId): TemporalEffectDefinition {
  return TEMPORAL_EFFECT_REGISTRY[id];
}

export function createTemporalEffect(id: TemporalEffectId, presetId?: string): TemporalEffectInstance {
  const definition = getTemporalEffectDefinition(id);
  const preset = definition.presets.find((candidate) => candidate.id === presetId) ?? definition.presets[0];
  return normalizeTemporalEffect({ id, instanceId: makeInstanceId(id), version: 1, enabled: true, preset: preset?.id ?? "custom", ...(preset?.values ?? {}) });
}

export function normalizeTemporalEffects(value: unknown): TemporalEffectInstance[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("This BEND layer contains an invalid temporal-effect stack.");
  if (value.length > 8) throw new Error("This BEND layer contains too many temporal effects.");
  return value.map((effect) => normalizeTemporalEffect(effect));
}

export function normalizeTemporalEffect(value: unknown): TemporalEffectInstance {
  if (!isRecord(value) || typeof value.id !== "string") throw new Error("This BEND document contains an invalid temporal effect.");
  if (value.version !== 1) throw new Error(`Temporal effect ${value.id} uses an unsupported version.`);
  const base = { instanceId: stringOr(value.instanceId, `effect-${value.id}`), version: 1 as const, enabled: value.enabled !== false, preset: stringOr(value.preset, "custom") };
  switch (value.id) {
    case "motion-echo":
      return { ...base, id: "motion-echo", echoCount: int(value.echoCount, 4, 0, 8), timeSpacing: number(value.timeSpacing, 0.08, 0.01, 0.6), decay: number(value.decay, 0.72, 0, 1), opacity: number(value.opacity, 0.78, 0, 1), direction: choice<TemporalDirection>(value.direction, ["backward", "forward", "both"], "backward"), blendMode: choice<TemporalBlendMode>(value.blendMode, ["normal", "screen", "lighter", "lighten", "multiply"], "screen"), offsetX: number(value.offsetX, 0, -0.2, 0.2), offsetY: number(value.offsetY, 0, -0.2, 0.2), tint: color(value.tint, "#F5F3EF"), temporalRange: number(value.temporalRange, 0.35, 0.01, 2) } satisfies MotionEchoEffect;
    case "time-slice":
      return { ...base, id: "time-slice", sliceCount: int(value.sliceCount, 16, 2, 48), temporalOffset: number(value.temporalOffset, 0.42, 0, 2), direction: choice<"backward" | "forward">(value.direction, ["backward", "forward"], "backward"), orientation: choice<TemporalOrientation>(value.orientation, ["horizontal", "vertical"], "horizontal"), sliceWidth: number(value.sliceWidth, 1, 0.2, 1), offsetCurve: choice<TemporalCurve>(value.offsetCurve, ["linear", "ease-in", "ease-out", "ease-in-out", "wave"], "linear"), sliceJitter: number(value.sliceJitter, 0, 0, 0.5), blend: number(value.blend, 0.12, 0, 1), motionSpeed: number(value.motionSpeed, 1, 0.1, 3), seed: stringOr(value.seed, "BEND-SLICE") } satisfies TimeSliceEffect;
    case "frame-feedback":
      return { ...base, id: "frame-feedback", feedbackAmount: number(value.feedbackAmount, 0.7, 0, 1), decay: number(value.decay, 0.86, 0, 1), scale: number(value.scale, 1.018, 0.92, 1.08), rotation: number(value.rotation, 0.35, -5, 5), translationX: number(value.translationX, 0, -0.08, 0.08), translationY: number(value.translationY, 0, -0.08, 0.08), blendMode: choice<TemporalBlendMode>(value.blendMode, ["normal", "screen", "lighter", "lighten", "multiply"], "screen"), colorShift: number(value.colorShift, 0.04, 0, 1), noise: number(value.noise, 0, 0, 1) } satisfies FrameFeedbackEffect;
    case "channel-delay":
      return { ...base, id: "channel-delay", redDelay: number(value.redDelay, -0.1, -0.6, 0.6), greenDelay: number(value.greenDelay, 0, -0.6, 0.6), blueDelay: number(value.blueDelay, 0.1, -0.6, 0.6), intensity: number(value.intensity, 0.82, 0, 1), spatialOffset: number(value.spatialOffset, 0.006, 0, 0.08), edgeBehavior: choice<"clamp" | "transparent">(value.edgeBehavior, ["clamp", "transparent"], "clamp"), temporalClamp: choice<"clip" | "loop">(value.temporalClamp, ["clip", "loop"], "clip") } satisfies ChannelDelayEffect;
    default:
      throw new Error(`This BEND document contains unsupported temporal effect ${value.id}.`);
  }
}

export function isTemporalEffectId(value: unknown): value is TemporalEffectId {
  return typeof value === "string" && value in TEMPORAL_EFFECT_REGISTRY;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(number(value, fallback, min, max));
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

export function createEffectInstanceId(id: TemporalEffectId): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `effect-${id}-${crypto.randomUUID()}`;
  return `effect-${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeInstanceId(id: TemporalEffectId): string {
  return createEffectInstanceId(id);
}
