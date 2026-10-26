import type {
  BendLayer,
  ProceduralLayer,
} from "../core/types";
import { getGeneratorDefinition } from "../generators/registry";
import { getTemporalEffectDefinition } from "../temporal/registry";

export type VariationStrength = "subtle" | "moderate" | "wild";
export type VariationScope = "all" | "motion" | "structure" | "appearance";
export type VariationTarget = "generator" | "effects";
export type VariationResult =
  | { ok: true; layer: BendLayer; changedKeys: string[]; seed: string; message: string }
  | { ok: false; reason: string };

export interface VariationOptions {
  seed: string;
  strength: VariationStrength;
  target: VariationTarget;
  scope?: VariationScope;
  effectInstanceId?: string;
}

interface NumericRule {
  key: string;
  min: number;
  max: number;
  step: number;
  current: number;
}

const STRENGTH_CONFIG: Record<VariationStrength, { span: number; chance: number; selectChance: number }> = {
  subtle: { span: 0.1, chance: 0.45, selectChance: 0.12 },
  moderate: { span: 0.28, chance: 0.68, selectChance: 0.32 },
  wild: { span: 0.6, chance: 0.9, selectChance: 0.55 },
};

/**
 * Seeded, bounded parameter variation. IDs, durations, sources, presets,
 * quality and structural metadata are never touched. Values of an animated
 * property are scaled by the same amount so the variation is visible instead
 * of being masked by an existing track.
 */
export function randomizeLayerParameters(layer: BendLayer, options: VariationOptions): VariationResult {
  if (layer.locked) return { ok: false, reason: `${layer.name} is locked. Unlock the layer to create a variation.` };
  const seed = options.seed.trim();
  if (!seed) return { ok: false, reason: "Enter a variation seed." };
  const next = structuredClone(layer);
  const changedKeys: string[] = [];
  const originals = new Map<string, number>();
  const config = STRENGTH_CONFIG[options.strength] ?? STRENGTH_CONFIG.moderate;
  const scope = options.scope ?? "all";

  if (options.target === "generator") {
    if (next.kind !== "procedural") return { ok: false, reason: "Select a procedural layer to vary generator parameters." };
    varyGenerator(next, seed, config, scope, changedKeys, originals);
  } else {
    if (next.effects.length === 0) return { ok: false, reason: "Add a temporal effect before creating an effect variation." };
    varyEffects(next, seed, config, options.effectInstanceId, changedKeys, originals);
  }

  if (changedKeys.length === 0) {
    return { ok: false, reason: "No randomizable parameters matched that scope. Try a broader scope or Wild variation." };
  }
  applyAnimatedScaling(next, originals);
  return {
    ok: true,
    layer: next,
    changedKeys,
    seed,
    message: `Varied ${changedKeys.length} parameter${changedKeys.length === 1 ? "" : "s"} with seed ${seed}. Undo restores the previous settings.`,
  };
}

function varyGenerator(
  layer: ProceduralLayer,
  seed: string,
  config: (typeof STRENGTH_CONFIG)[VariationStrength],
  scope: VariationScope,
  changedKeys: string[],
  originals: Map<string, number>,
): void {
  const definition = getGeneratorDefinition(layer.generator.id);
  const rules: NumericRule[] = [];
  for (const parameter of definition.parameters) {
    if (parameter.type !== "range" || parameter.min === undefined || parameter.max === undefined) continue;
    if (["duration", "seed", "simulationQuality", "renderQuality"].includes(parameter.key)) continue;
    const group = parameter.group === "Motion" ? "motion" : parameter.group === "Appearance" ? "appearance" : "structure";
    if (scope !== "all" && scope !== group) continue;
    const current = readNumber(layer.generator, parameter.key);
    if (current === null) continue;
    rules.push({ key: parameter.key, min: parameter.min, max: parameter.max, step: parameter.step ?? 0.01, current });
  }
  let changed = 0;
  for (const rule of rules) {
    if (random(seed, `generator:${rule.key}:chance`) > config.chance) continue;
    const nextValue = jitter(rule, seed, config.span, "generator");
    if (Math.abs(nextValue - rule.current) < rule.step * 0.49) continue;
    originals.set(`generator.${rule.key}`, rule.current);
    (layer.generator as unknown as Record<string, unknown>)[rule.key] = nextValue;
    changedKeys.push(`generator.${rule.key}`);
    changed += 1;
  }
  if (rules.length > 0 && changed === 0) {
    const rule = rules[Math.floor(random(seed, "generator:fallback") * rules.length)];
    originals.set(`generator.${rule.key}`, rule.current);
    (layer.generator as unknown as Record<string, unknown>)[rule.key] = jitter(rule, seed, config.span, "generator-fallback");
    changedKeys.push(`generator.${rule.key}`);
  }

  const palette = definition.parameters.find((parameter) => parameter.key === "palette");
  if (palette?.options?.length && (scope === "all" || scope === "appearance") && random(seed, "generator:palette:chance") < config.selectChance) {
    const options = palette.options.filter((option) => option.value !== layer.generator.palette);
    if (options.length > 0) {
      const choice = options[Math.floor(random(seed, "generator:palette:value") * options.length)];
      layer.generator.palette = choice.value as ProceduralLayer["generator"]["palette"];
      changedKeys.push("generator.palette");
    }
  }
}

function varyEffects(
  layer: BendLayer,
  seed: string,
  config: (typeof STRENGTH_CONFIG)[VariationStrength],
  effectInstanceId: string | undefined,
  changedKeys: string[],
  originals: Map<string, number>,
): void {
  const targets = effectInstanceId
    ? layer.effects.filter((effect) => effect.instanceId === effectInstanceId)
    : layer.effects;
  if (targets.length === 0) return;
  let changedNumeric = 0;
  let totalEligible = 0;
  for (const effect of targets) {
    const definition = getTemporalEffectDefinition(effect.id);
    const rules: NumericRule[] = [];
    for (const parameter of definition.parameters) {
      if (parameter.kind !== "number" || parameter.min === undefined || parameter.max === undefined) continue;
      const current = readNumber(effect, parameter.key);
      if (current === null) continue;
      rules.push({ key: parameter.key, min: parameter.min, max: parameter.max, step: parameter.step ?? 0.01, current });
    }
    totalEligible += rules.length;
    for (const rule of rules) {
      if (random(seed, `effect:${effect.instanceId}:${rule.key}:chance`) > config.chance) continue;
      const nextValue = jitter(rule, seed, config.span, `effect:${effect.instanceId}`);
      if (Math.abs(nextValue - rule.current) < rule.step * 0.49) continue;
      originals.set(`effects.${effect.instanceId}.${rule.key}`, rule.current);
      (effect as unknown as Record<string, unknown>)[rule.key] = nextValue;
      const property = `effects.${effect.instanceId}.${rule.key}`;
      changedKeys.push(property);
      changedNumeric += 1;
    }
    for (const parameter of definition.parameters) {
      if (parameter.kind !== "select" || !parameter.options?.length) continue;
      if (parameter.key === "seed") continue;
      if (random(seed, `effect:${effect.instanceId}:${parameter.key}:select`) >= config.selectChance * 0.55) continue;
      const current = (effect as unknown as Record<string, unknown>)[parameter.key];
      const options = parameter.options.filter((option) => option !== current);
      if (options.length === 0) continue;
      const choice = options[Math.floor(random(seed, `effect:${effect.instanceId}:${parameter.key}:select-value`) * options.length)];
      (effect as unknown as Record<string, unknown>)[parameter.key] = choice;
      changedKeys.push(`effects.${effect.instanceId}.${parameter.key}`);
    }
  }
  if (totalEligible > 0 && changedNumeric === 0) {
    const first = targets[0];
    const definition = getTemporalEffectDefinition(first.id);
    const parameter = definition.parameters.find((candidate) => {
      if (candidate.kind !== "number" || candidate.min === undefined || candidate.max === undefined) return false;
      return readNumber(first, candidate.key) !== null;
    });
    if (parameter && parameter.min !== undefined && parameter.max !== undefined) {
      const rule: NumericRule = {
        key: parameter.key,
        min: parameter.min,
        max: parameter.max,
        step: parameter.step ?? 0.01,
        current: readNumber(first, parameter.key) ?? parameter.min,
      };
      originals.set(`effects.${first.instanceId}.${rule.key}`, rule.current);
      (first as unknown as Record<string, unknown>)[rule.key] = jitter(rule, seed, config.span, `effect:${first.instanceId}`);
      changedKeys.push(`effects.${first.instanceId}.${rule.key}`);
    }
  }
}

function applyAnimatedScaling(layer: BendLayer, originals: Map<string, number>): void {
  if (originals.size === 0) return;
  const changes = new Map<string, { oldValue: number; newValue: number }>();
  for (const [property, oldValue] of originals) {
    const effectMatch = /^effects\.([^.]+)\.(.+)$/.exec(property);
    const generatorMatch = /^generator\.(.+)$/.exec(property);
    const key = effectMatch ? effectMatch[2] : generatorMatch ? generatorMatch[1] : property;
    const target = effectMatch
      ? layer.effects.find((effect) => effect.instanceId === effectMatch[1])
      : generatorMatch && layer.kind === "procedural"
        ? layer.generator
        : layer;
    const newValue = readNumber(target, key);
    if (newValue !== null && Math.abs(newValue - oldValue) > 1e-9) changes.set(property, { oldValue, newValue });
  }
  if (changes.size === 0) return;
  layer.animation = {
    version: 1,
    tracks: layer.animation.tracks.map((track) => {
      const change = changes.get(track.property);
      if (!change) return track;
      const range = resolveTrackRange(layer, track.property);
      return {
        ...track,
        keyframes: track.keyframes.map((keyframe) => {
          if (typeof keyframe.value !== "number") return keyframe;
          const scaled = change.oldValue === 0
            ? keyframe.value + (change.newValue - change.oldValue)
            : keyframe.value * (change.newValue / change.oldValue);
          return { ...keyframe, value: clamp(scaled, range.min, range.max) };
        }),
      };
    }),
  };
}

function resolveTrackRange(layer: BendLayer, property: string): { min: number; max: number } {
  const effectMatch = /^effects\.([^.]+)\.(.+)$/.exec(property);
  if (effectMatch) {
    const effect = layer.effects.find((candidate) => candidate.instanceId === effectMatch[1]);
    const definition = effect ? getTemporalEffectDefinition(effect.id) : null;
    const parameter = definition?.parameters.find((candidate) => candidate.key === effectMatch[2]);
    if (parameter?.min !== undefined && parameter.max !== undefined) return { min: parameter.min, max: parameter.max };
  }
  if (property.startsWith("generator.") && layer.kind === "procedural") {
    const key = property.slice("generator.".length);
    const parameter = getGeneratorDefinition(layer.generator.id).parameters.find((candidate) => candidate.key === key);
    if (parameter?.min !== undefined && parameter.max !== undefined) return { min: parameter.min, max: parameter.max };
  }
  return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };
}

function jitter(rule: NumericRule, seed: string, span: number, scope: string): number {
  const range = rule.max - rule.min;
  const direction = random(seed, `${scope}:${rule.key}:direction`) * 2 - 1;
  const localSpan = Math.max(rule.step, range * span * (0.35 + random(seed, `${scope}:${rule.key}:magnitude`) * 0.65));
  const candidate = clamp(rule.current + direction * localSpan, rule.min, rule.max);
  return snap(candidate, rule.step, rule.min, rule.max);
}

export function snapVariationValue(value: number, step: number, min: number, max: number): number {
  return snap(value, step, min, max);
}

function snap(value: number, step: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const safeStep = step > 0 ? step : 0.01;
  const snapped = Math.round(value / safeStep) * safeStep;
  const fixed = Number(snapped.toFixed(decimalsFor(safeStep)));
  return clamp(fixed, min, max);
}

function decimalsFor(step: number): number {
  if (step >= 1) return 0;
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 2;
}

function readNumber(record: unknown, key: string): number | null {
  if (!record || typeof record !== "object") return null;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function random(seed: string, path: string): number {
  let hash = 2166136261;
  const text = `${seed}|${path}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return ((hash >>> 0) % 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
