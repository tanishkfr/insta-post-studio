import type { GeneratorId, ProceduralGeneratorParams, ProceduralQuality } from "../core/types";
import { createFlowParams, FLOW_PRESETS, normalizeFlowParams } from "./flow";
import { createLiquidParams, LIQUID_PRESETS, normalizeLiquidParams } from "./liquid";
import { createRefractionParams, normalizeRefractionParams, REFRACTION_PRESETS } from "./refraction";
import { createSignalFieldParams, normalizeSignalFieldParams, SIGNAL_PRESETS } from "./signalField";

export type GeneratorRenderMode = "analytic" | "stateful";
export type GeneratorParameterGroup = "Motion" | "Structure" | "Appearance" | "Simulation";

export interface GeneratorParameterDefinition {
  key: string;
  label: string;
  group: GeneratorParameterGroup;
  type: "range" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: readonly { value: string; label: string }[];
  description?: string;
}

export interface GeneratorPresetDefinition {
  id: string;
  label: string;
  description: string;
}

export interface GeneratorCapabilities {
  renderMode: GeneratorRenderMode;
  loop: "supported" | "approximate" | "none";
  pointerInput: boolean;
}

export interface GeneratorDefinition {
  id: GeneratorId;
  name: string;
  description: string;
  presets: readonly GeneratorPresetDefinition[];
  parameters: readonly GeneratorParameterDefinition[];
  capabilities: GeneratorCapabilities;
  createParams: (preset?: string, seed?: string) => ProceduralGeneratorParams;
  normalize: (value: Record<string, unknown>) => ProceduralGeneratorParams;
}

const PALETTE_OPTIONS = [
  { value: "mono", label: "Monochrome" },
  { value: "acid", label: "Acid / chartreuse" },
  { value: "ember", label: "Warm / ember" },
  { value: "ice", label: "Cool / ice" },
  { value: "contrast", label: "High contrast" },
  { value: "soft", label: "Soft atmospheric" },
  { value: "saturated", label: "Saturated experimental" },
] as const;

const QUALITY_OPTIONS: readonly { value: ProceduralQuality; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
];

export const GENERATOR_REGISTRY: readonly GeneratorDefinition[] = [
  {
    id: "signal-field",
    name: "Signal Field",
    description: "A seeded field of noise, ribbons, and light.",
    presets: SIGNAL_PRESETS,
    parameters: [
      range("speed", "Speed", "Motion", -2, 2, 0.01),
      range("intensity", "Intensity", "Motion", 0, 1, 0.01),
      range("scale", "Scale", "Structure", 0.1, 4, 0.01),
      range("frequency", "Complexity", "Structure", 0.2, 12, 0.1),
      select("palette", "Palette", "Appearance", PALETTE_OPTIONS),
      range("duration", "Duration", "Simulation", 0.5, 120, 0.5),
    ],
    capabilities: { renderMode: "analytic", loop: "supported", pointerInput: false },
    createParams: (preset, seed) => createSignalFieldParams(isSignalPreset(preset) ? preset : "pulse", seed),
    normalize: (value) => normalizeSignalFieldParams(value as never),
  },
  {
    id: "liquid",
    name: "Liquid",
    description: "A living pool of ink and color that swirls over time.",
    presets: LIQUID_PRESETS,
    parameters: [
      range("flowSpeed", "Flow speed", "Motion", 0, 3, 0.01),
      range("forceStrength", "Force", "Motion", 0, 3, 0.01),
      range("swirl", "Swirl", "Motion", 0, 2, 0.01),
      range("turbulence", "Turbulence", "Structure", 0, 1, 0.01),
      range("dyeAmount", "Dye amount", "Appearance", 0, 1.5, 0.01),
      range("dyeDissipation", "Dye fade", "Appearance", 0, 1, 0.01),
      select("palette", "Palette", "Appearance", PALETTE_OPTIONS),
      range("viscosity", "Viscosity", "Simulation", 0, 1, 0.01, "Higher values soften velocity changes."),
      select("simulationQuality", "Quality", "Simulation", QUALITY_OPTIONS),
      range("duration", "Duration", "Simulation", 0.5, 120, 0.5),
    ],
    capabilities: { renderMode: "stateful", loop: "none", pointerInput: false },
    createParams: (preset, seed) => createLiquidParams(isLiquidPreset(preset) ? preset : "ink-spill", seed),
    normalize: (value) => normalizeLiquidParams(value as never),
  },
  {
    id: "flow",
    name: "Flow",
    description: "Particles that drift, stream, and orbit through the frame.",
    presets: FLOW_PRESETS,
    parameters: [
      range("flowSpeed", "Flow speed", "Motion", -2, 2, 0.01),
      range("curl", "Curl", "Motion", 0, 2, 0.01),
      range("fieldScale", "Field scale", "Structure", 0.2, 3, 0.01),
      range("particleDensity", "Density", "Structure", 0.05, 1, 0.01),
      range("trailLength", "Trail length", "Structure", 0, 1, 0.01),
      range("dispersion", "Dispersion", "Structure", 0, 1, 0.01),
      range("lineWidth", "Line width", "Appearance", 0.05, 1, 0.01),
      range("opacity", "Opacity", "Appearance", 0, 1, 0.01),
      select("palette", "Palette", "Appearance", PALETTE_OPTIONS),
      select("renderQuality", "Quality", "Simulation", QUALITY_OPTIONS),
      range("duration", "Duration", "Simulation", 0.5, 120, 0.5),
    ],
    capabilities: { renderMode: "analytic", loop: "supported", pointerInput: false },
    createParams: (preset, seed) => createFlowParams(isFlowPreset(preset) ? preset : "threads", seed),
    normalize: (value) => normalizeFlowParams(value as never),
  },
  {
    id: "refraction",
    name: "Refraction",
    description: "Moving glass, light, and distortion with a watery shimmer.",
    presets: REFRACTION_PRESETS,
    parameters: [
      range("speed", "Speed", "Motion", -2, 2, 0.01),
      range("direction", "Direction", "Motion", 0, 360, 1),
      range("refraction", "Refraction", "Structure", 0, 1, 0.01),
      range("waveScale", "Wave scale", "Structure", 0.2, 4, 0.01),
      range("distortion", "Distortion", "Structure", 0, 1.5, 0.01),
      range("lightIntensity", "Light intensity", "Appearance", 0, 1.5, 0.01),
      range("contrast", "Contrast", "Appearance", 0, 1.5, 0.01),
      range("softness", "Softness", "Appearance", 0, 1, 0.01),
      select("palette", "Palette", "Appearance", PALETTE_OPTIONS),
      range("duration", "Duration", "Simulation", 0.5, 120, 0.5),
    ],
    capabilities: { renderMode: "analytic", loop: "supported", pointerInput: false },
    createParams: (preset, seed) => createRefractionParams(isRefractionPreset(preset) ? preset : "pool", seed),
    normalize: (value) => normalizeRefractionParams(value as never),
  },
] as const;

export function getGeneratorDefinition(id: GeneratorId): GeneratorDefinition {
  const definition = GENERATOR_REGISTRY.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown BEND generator: ${id}`);
  return definition;
}

export function isGeneratorId(value: unknown): value is GeneratorId {
  return ["signal-field", "liquid", "flow", "refraction"].includes(String(value));
}

export function createGeneratorParams(id: GeneratorId, preset?: string, seed?: string): ProceduralGeneratorParams {
  return getGeneratorDefinition(id).createParams(preset, seed);
}

export function normalizeGeneratorParams(value: unknown): ProceduralGeneratorParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("This BEND procedural layer has invalid generator data.");
  const record = value as Record<string, unknown>;
  const id = record.id === undefined ? "signal-field" : record.id;
  if (!isGeneratorId(id)) throw new Error(`This BEND document contains an unknown generator: ${String(id)}.`);
  if (record.version !== undefined && record.version !== 1) throw new Error(`This BEND document contains an unsupported ${id} generator version.`);
  return getGeneratorDefinition(id).normalize(record);
}

function range(key: string, label: string, group: GeneratorParameterGroup, min: number, max: number, step: number, description?: string): GeneratorParameterDefinition {
  return { key, label, group, type: "range", min, max, step, description };
}

function select(key: string, label: string, group: GeneratorParameterGroup, options: readonly { value: string; label: string }[]): GeneratorParameterDefinition {
  return { key, label, group, type: "select", options };
}

function isSignalPreset(value: unknown): value is "pulse" | "drift" | "current" | "fracture" {
  return ["pulse", "drift", "current", "fracture"].includes(String(value));
}

function isLiquidPreset(value: unknown): value is "ink-spill" | "vortex" | "tidal" | "nebula" {
  return ["ink-spill", "vortex", "tidal", "nebula"].includes(String(value));
}

function isFlowPreset(value: unknown): value is "threads" | "current" | "orbit" | "drift" {
  return ["threads", "current", "orbit", "drift"].includes(String(value));
}

function isRefractionPreset(value: unknown): value is "pool" | "glass" | "prism" | "mirage" {
  return ["pool", "glass", "prism", "mirage"].includes(String(value));
}
