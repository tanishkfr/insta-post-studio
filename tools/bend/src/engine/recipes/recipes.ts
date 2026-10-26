import { createProceduralLayer, normalizeProject } from "../core/project";
import { createDefaultModulator } from "../animation/engine";
import { createGeneratorParams } from "../generators/registry";
import { createTemporalEffect } from "../temporal/registry";
import type {
  AnimationKeyframe,
  AnimationModulator,
  BendLayer,
  BendProject,
  GeneratorId,
  LayerAnimation,
  PaletteId,
  ProceduralGeneratorParams,
  TemporalEffectId,
  TemporalEffectInstance,
  WaveDisplacementParams,
} from "../core/types";

export type RecipeTarget = "any" | "video" | "procedural";
export type RecipeApplyMode = "replace" | "append";

export interface RecipeEffectSpec {
  id: TemporalEffectId;
  preset?: string;
}

export interface MotionRecipe {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  targetCompatibility: RecipeTarget;
  requiresFootage: boolean;
  requiredCapabilities: string[];
  effects: RecipeEffectSpec[];
  generator?: { id: GeneratorId; preset: string; palette?: PaletteId };
  wave?: Partial<WaveDisplacementParams>;
  animation: LayerAnimation;
  seed: string;
  timingPolicy: "absolute" | "relative";
  attribution?: string;
}

export interface RecipeApplyResult {
  project: BendProject;
  layerId: string;
}

const key = (id: string, time: number, value: number, easing: AnimationKeyframe["easing"] = "ease-in-out"): AnimationKeyframe => ({ id: `${id}-${time}`, time, value, easing });

function animation(tracks: LayerAnimation["tracks"]): LayerAnimation {
  return { version: 1, tracks };
}

function numericTrack(property: string, values: AnimationKeyframe[], modulator?: AnimationModulator): LayerAnimation["tracks"][number] {
  return { id: `recipe-${property.replace(/[^a-z0-9]+/gi, "-")}`, property, valueType: "number", enabled: true, keyframes: values, ...(modulator ? { modulator } : {}) };
}

function sineModulator(amplitude: number, frequency: number): AnimationModulator {
  return { ...createDefaultModulator("sine"), amplitude, frequency, seed: "BEND-RECIPE-MOD" };
}

export const BUILTIN_MOTION_RECIPES: readonly MotionRecipe[] = [
  {
    schemaVersion: 1,
    id: "analog-ghost",
    name: "Analog Ghost",
    description: "A restrained afterimage that opens, breathes, and settles back into the source.",
    targetCompatibility: "any",
    requiresFootage: false,
    requiredCapabilities: ["motion-echo"],
    effects: [{ id: "motion-echo", preset: "ghost-trail" }],
    animation: animation([numericTrack("effects.motion-echo.decay", [key("decay", 0, 0.82), key("decay", 1.8, 0.44), key("decay", 4.2, 0.68)])]),
    seed: "BEND-ANALOG-GHOST",
    timingPolicy: "relative",
    attribution: "BEND built-in recipe",
  },
  {
    schemaVersion: 1,
    id: "liquid-bloom",
    name: "Liquid Bloom",
    description: "A slow seeded bloom with a soft pull toward the centre of the frame.",
    targetCompatibility: "procedural",
    requiresFootage: false,
    requiredCapabilities: ["liquid"],
    effects: [],
    generator: { id: "liquid", preset: "nebula", palette: "soft" },
    animation: animation([
      numericTrack("generator.flowSpeed", [key("flow", 0, 0.22), key("flow", 3.2, 0.84), key("flow", 7, 0.36)]),
      numericTrack("generator.swirl", [key("swirl", 0, 0.18), key("swirl", 5, 0.72)], sineModulator(0.1, 0.22)),
    ]),
    seed: "BEND-LIQUID-BLOOM",
    timingPolicy: "relative",
    attribution: "BEND built-in recipe",
  },
  {
    schemaVersion: 1,
    id: "signal-breakdown",
    name: "Signal Breakdown",
    description: "A signal field that tightens its frequency while a channel split introduces a brittle edge.",
    targetCompatibility: "procedural",
    requiresFootage: false,
    requiredCapabilities: ["signal-field", "channel-delay"],
    effects: [{ id: "channel-delay", preset: "signal-drift" }],
    generator: { id: "signal-field", preset: "fracture", palette: "contrast" },
    animation: animation([
      numericTrack("generator.frequency", [key("frequency", 0, 2.4), key("frequency", 2.3, 8.6), key("frequency", 5.8, 4.1)]),
      numericTrack("effects.channel-delay.intensity", [key("intensity", 0, 0.18), key("intensity", 2.2, 0.76), key("intensity", 6, 0.28)]),
    ]),
    seed: "BEND-SIGNAL-BREAKDOWN",
    timingPolicy: "relative",
    attribution: "BEND built-in recipe",
  },
  {
    schemaVersion: 1,
    id: "chromatic-delay",
    name: "Chromatic Delay",
    description: "Small RGB offsets travel through the image like a misregistered print.",
    targetCompatibility: "any",
    requiresFootage: false,
    requiredCapabilities: ["channel-delay"],
    effects: [{ id: "channel-delay", preset: "chromatic-ghost" }],
    animation: animation([
      numericTrack("effects.channel-delay.redDelay", [key("red", 0, -0.04), key("red", 4, -0.22)]),
      numericTrack("effects.channel-delay.blueDelay", [key("blue", 0, 0.04), key("blue", 4, 0.22)]),
      numericTrack("effects.channel-delay.intensity", [key("intensity", 0, 0.32), key("intensity", 2, 0.84), key("intensity", 6, 0.4)]),
    ]),
    seed: "BEND-CHROMATIC-DELAY",
    timingPolicy: "relative",
    attribution: "BEND built-in recipe",
  },
  {
    schemaVersion: 1,
    id: "recursive-dream",
    name: "Recursive Dream",
    description: "A long feedback arc with a barely perceptible scale drift and colour residue.",
    targetCompatibility: "any",
    requiresFootage: false,
    requiredCapabilities: ["frame-feedback"],
    effects: [{ id: "frame-feedback", preset: "recursive-drift" }],
    animation: animation([
      numericTrack("effects.frame-feedback.scale", [key("scale", 0, 0.992), key("scale", 3.5, 1.035), key("scale", 7, 0.998)]),
      numericTrack("effects.frame-feedback.rotation", [key("rotation", 0, -0.3), key("rotation", 7, 0.62)]),
    ]),
    seed: "BEND-RECURSIVE-DREAM",
    timingPolicy: "relative",
    attribution: "BEND built-in recipe",
  },
  {
    schemaVersion: 1,
    id: "optical-tide",
    name: "Optical Tide",
    description: "A directional wave that turns a still layer into a slow optical swell.",
    targetCompatibility: "any",
    requiresFootage: false,
    requiredCapabilities: ["wave-displacement", "refraction"],
    effects: [],
    generator: { id: "refraction", preset: "pool", palette: "ice" },
    wave: { enabled: true, intensity: 0.42, frequency: 4.4, speed: 0.7, direction: 18, phase: 0 },
    animation: animation([
      numericTrack("wave.intensity", [key("intensity", 0, 0.12), key("intensity", 2.5, 0.58), key("intensity", 6, 0.28)]),
      numericTrack("generator.refraction", [key("refraction", 0, 0.22), key("refraction", 5.5, 0.72)]),
    ]),
    seed: "BEND-OPTICAL-TIDE",
    timingPolicy: "relative",
    attribution: "BEND built-in recipe",
  },
];

export function normalizeMotionRecipe(value: unknown): MotionRecipe {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.name !== "string") throw new Error("This motion recipe is not a supported BEND recipe.");
  if (!Array.isArray(value.animation?.tracks) || !Array.isArray(value.effects)) throw new Error("This motion recipe is missing its animation or effect data.");
  const targetCompatibility = choice<RecipeTarget>(value.targetCompatibility, ["any", "video", "procedural"], "any");
  const effects = value.effects.slice(0, 8).flatMap((effect) => isRecord(effect) && isTemporalEffectId(effect.id) ? [{ id: effect.id, ...(typeof effect.preset === "string" ? { preset: effect.preset.slice(0, 80) } : {}) }] : []);
  const tracks = value.animation.tracks.slice(0, 64).flatMap((track: unknown) => normalizeRecipeTrack(track));
  return {
    schemaVersion: 1,
    id: stringOr(value.id, "local-recipe"),
    name: stringOr(value.name, "Untitled recipe"),
    description: stringOr(value.description, "Local BEND motion recipe."),
    targetCompatibility,
    requiresFootage: value.requiresFootage === true,
    requiredCapabilities: Array.isArray(value.requiredCapabilities) ? value.requiredCapabilities.filter((capability): capability is string => typeof capability === "string").slice(0, 16) : [],
    effects,
    generator: isRecord(value.generator) && isGeneratorId(value.generator.id) ? { id: value.generator.id, preset: stringOr(value.generator.preset, "default"), ...(isPalette(value.generator.palette) ? { palette: value.generator.palette } : {}) } : undefined,
    wave: isRecord(value.wave) ? value.wave : undefined,
    animation: { version: 1, tracks },
    seed: stringOr(value.seed, "BEND-LOCAL-RECIPE"),
    timingPolicy: value.timingPolicy === "absolute" ? "absolute" : "relative",
    attribution: typeof value.attribution === "string" ? value.attribution.slice(0, 160) : undefined,
  };
}

export function applyMotionRecipe(project: BendProject, recipeValue: MotionRecipe, activeLayerId: string | null, mode: RecipeApplyMode): RecipeApplyResult {
  const recipe = normalizeMotionRecipe(recipeValue);
  const draft = structuredClone(project);
  let target = draft.layers.find((layer) => layer.id === activeLayerId) ?? draft.layers[0];
  if (recipe.requiresFootage && !draft.layers.some((layer) => layer.kind === "video")) throw new Error(`${recipe.name} requires a video layer.`);
  if (recipe.targetCompatibility === "video" && target && target.kind !== "video") throw new Error(`${recipe.name} is for video layers.`);
  if (recipe.targetCompatibility === "procedural" && target?.kind === "video" && !recipe.generator) throw new Error(`${recipe.name} is for procedural layers.`);
  const canApplyWaveToVideo = Boolean(recipe.wave && target?.kind === "video" && mode === "replace");
  if (recipe.generator && (!target || mode === "append" || (target.kind !== "procedural" && !canApplyWaveToVideo))) {
    const generated = createProceduralLayer(recipe.generator.id, recipe.seed, recipe.name);
    generated.generator = withRecipeGenerator(recipe.generator, recipe.seed);
    generated.timeline.duration = draft.canvas.duration;
    generated.generator.duration = draft.canvas.duration;
    target = generated;
    draft.layers = [generated, ...draft.layers];
  } else if (!target) {
    const generated = createProceduralLayer("signal-field", recipe.seed, recipe.name);
    generated.timeline.duration = draft.canvas.duration;
    generated.generator.duration = draft.canvas.duration;
    target = generated;
    draft.layers = [generated];
  }
  if (!target) throw new Error("BEND could not find a layer for this recipe.");
  if (recipe.generator && target.kind === "procedural" && mode === "replace") {
    target.generator = withRecipeGenerator(recipe.generator, recipe.seed);
    target.timeline.duration = target.generator.duration;
  }
  const incomingEffects = recipe.effects.map((effect) => createTemporalEffect(effect.id, effect.preset));
  const uniqueIncoming = incomingEffects.filter((effect, index) => incomingEffects.findIndex((candidate) => candidate.id === effect.id) === index);
  let appliedEffects: TemporalEffectInstance[];
  if (mode === "append") {
    const existingTypes = new Set(target.effects.map((effect) => effect.id));
    const additions = uniqueIncoming.filter((effect) => !existingTypes.has(effect.id));
    if (target.effects.length + additions.length > 8) {
      throw new Error(`${recipe.name} would exceed the 8-effect stack limit. Remove an effect and try again.`);
    }
    const existingTerminal = target.effects.find((effect) => effect.id === "frame-feedback");
    const remaining = target.effects.filter((effect) => effect.id !== "frame-feedback");
    appliedEffects = [
      ...remaining,
      ...additions.filter((effect) => effect.id !== "frame-feedback"),
      ...(existingTerminal ? [existingTerminal] : []),
      ...additions.filter((effect) => effect.id === "frame-feedback"),
    ];
  } else {
    appliedEffects = [
      ...uniqueIncoming.filter((effect) => effect.id !== "frame-feedback"),
      ...uniqueIncoming.filter((effect) => effect.id === "frame-feedback"),
    ];
  }
  target.effects = appliedEffects;
  const effectIds = new Map<string, string>();
  for (const effect of appliedEffects) {
    if (recipe.effects.some((recipeEffect) => recipeEffect.id === effect.id)) effectIds.set(`effects.${effect.id}`, effect.instanceId);
  }
  if (target.kind === "video" && recipe.wave) target.wave = { ...target.wave, ...recipe.wave };
  const mappedAnimation = mapRecipeAnimation(recipe.animation, effectIds, recipe.timingPolicy, target);
  target.animation = mode === "append" ? mergeAnimations(target.animation, mappedAnimation) : mappedAnimation;
  return { project: normalizeProject(draft), layerId: target.id };
}

export function recipeFromLayer(layer: BendLayer, name = `${layer.name} motion`): MotionRecipe {
  return normalizeMotionRecipe({
    schemaVersion: 1,
    id: `local-${layer.id}`,
    name,
    description: "Saved from a BEND layer.",
    targetCompatibility: layer.kind,
    requiresFootage: layer.kind === "video",
    requiredCapabilities: layer.effects.map((effect) => effect.id),
    effects: layer.effects.map((effect) => ({ id: effect.id, preset: effect.preset })),
    generator: layer.kind === "procedural" ? { id: layer.generator.id, preset: layer.generator.preset, palette: layer.generator.palette } : undefined,
    wave: layer.kind === "video" ? layer.wave : undefined,
    animation: recipeAnimationFromLayer(layer.animation, layer.effects),
    seed: layer.kind === "procedural" ? layer.generator.seed : "BEND-SAVED-RECIPE",
    timingPolicy: "absolute",
    attribution: "Saved locally from BEND",
  });
}

function mapRecipeAnimation(animationValue: LayerAnimation, effectIds: Map<string, string>, timingPolicy: MotionRecipe["timingPolicy"], layer: BendLayer): LayerAnimation {
  const duration = Math.max(0.1, layer.timeline.duration);
  return {
    version: 1,
    tracks: animationValue.tracks.map((track) => {
      let property = track.property;
      for (const [placeholder, instanceId] of effectIds) if (property.startsWith(`${placeholder}.`)) property = `effects.${instanceId}.${property.slice(placeholder.length + 1)}`;
      const keyframes = track.keyframes.map((keyframe) => ({ ...keyframe, time: timingPolicy === "relative" ? Math.min(duration, keyframe.time) : Math.min(duration, Math.max(0, keyframe.time)) }));
      return { ...track, property, keyframes };
    }),
  };
}

function recipeAnimationFromLayer(animationValue: LayerAnimation, effects: TemporalEffectInstance[]): LayerAnimation {
  return {
    version: 1,
    tracks: animationValue.tracks.map((track) => {
      const match = /^effects\.([^\.]+)\.(.+)$/.exec(track.property);
      if (!match) return track;
      const effect = effects.find((candidate) => candidate.instanceId === match[1]);
      return effect ? { ...track, property: `effects.${effect.id}.${match[2]}` } : track;
    }),
  };
}

function mergeAnimations(first: LayerAnimation, second: LayerAnimation): LayerAnimation {
  const byProperty = new Map(first.tracks.map((track) => [track.property, track]));
  for (const track of second.tracks) byProperty.set(track.property, track);
  return { version: 1, tracks: [...byProperty.values()].slice(0, 64) };
}

function withRecipeGenerator(generator: NonNullable<MotionRecipe["generator"]>, seed: string): ProceduralGeneratorParams {
  const params = createGeneratorParams(generator.id, generator.preset, seed);
  return getGeneratorParamsWithPalette(params, generator.palette);
}

function getGeneratorParamsWithPalette(params: ProceduralGeneratorParams, palette?: PaletteId): ProceduralGeneratorParams {
  return palette ? { ...params, palette } : params;
}

function normalizeRecipeTrack(value: unknown): LayerAnimation["tracks"] {
  if (!isRecord(value) || typeof value.property !== "string" || !Array.isArray(value.keyframes)) return [];
  const keyframes = value.keyframes.slice(0, 128).flatMap((keyframe) => {
    if (!isRecord(keyframe) || !Number.isFinite(keyframe.time) || !isAnimationValue(keyframe.value)) return [];
    return [{ id: stringOr(keyframe.id, `key-${keyframe.time}`), time: Math.max(0, Number(keyframe.time)), value: keyframe.value, easing: choice<AnimationKeyframe["easing"]>(keyframe.easing, ["hold", "linear", "ease-in", "ease-out", "ease-in-out", "cubic-bezier"], "ease-in-out") } satisfies AnimationKeyframe];
  });
  return keyframes.length > 0 ? [{ id: stringOr(value.id, `track-${value.property}`), property: value.property.slice(0, 160), valueType: value.valueType === "number" ? "number" : "enum", enabled: value.enabled !== false, keyframes, ...(isRecord(value.modulator) ? { modulator: value.modulator as unknown as AnimationModulator } : {}) }] : [];
}

function isTemporalEffectId(value: unknown): value is TemporalEffectId {
  return ["motion-echo", "time-slice", "frame-feedback", "channel-delay"].includes(String(value));
}

function isGeneratorId(value: unknown): value is GeneratorId {
  return ["signal-field", "liquid", "flow", "refraction"].includes(String(value));
}

function isPalette(value: unknown): value is PaletteId {
  return ["acid", "ember", "ice", "mono", "contrast", "soft", "saturated"].includes(String(value));
}

function isAnimationValue(value: unknown): value is number | string | boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
}

function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
