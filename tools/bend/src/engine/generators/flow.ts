import type { FlowParams, FlowPresetId, PaletteId, ProceduralQuality } from "../core/types";
import { normalizeSeed, PALETTE_COLORS, seedToNumber } from "./signalField";

export interface FlowPreset {
  id: FlowPresetId;
  label: string;
  description: string;
  defaults: Omit<FlowParams, "id" | "version" | "preset" | "seed">;
}

export const FLOW_PRESETS: readonly FlowPreset[] = [
  {
    id: "threads",
    label: "Threads",
    description: "Fine, elegant strands with a long memory.",
    defaults: { particleDensity: 0.58, fieldScale: 1.3, flowSpeed: 0.62, curl: 0.82, trailLength: 0.78, lineWidth: 0.22, dispersion: 0.18, opacity: 0.82, palette: "soft", renderQuality: "standard", duration: 8 },
  },
  {
    id: "current",
    label: "Current",
    description: "Dense directional traffic with a stronger push.",
    defaults: { particleDensity: 0.92, fieldScale: 0.76, flowSpeed: 1.2, curl: 0.58, trailLength: 0.64, lineWidth: 0.38, dispersion: 0.28, opacity: 0.76, palette: "acid", renderQuality: "standard", duration: 8 },
  },
  {
    id: "orbit",
    label: "Orbit",
    description: "Circular paths that gather around an invisible centre.",
    defaults: { particleDensity: 0.7, fieldScale: 1.05, flowSpeed: 0.86, curl: 1.4, trailLength: 0.7, lineWidth: 0.3, dispersion: 0.12, opacity: 0.86, palette: "saturated", renderQuality: "standard", duration: 8 },
  },
  {
    id: "drift",
    label: "Drift",
    description: "Sparse atmospheric movement with a soft edge.",
    defaults: { particleDensity: 0.34, fieldScale: 0.52, flowSpeed: 0.3, curl: 0.38, trailLength: 0.42, lineWidth: 0.52, dispersion: 0.42, opacity: 0.54, palette: "ice", renderQuality: "standard", duration: 8 },
  },
] as const;

export function getFlowPreset(id: FlowPresetId): FlowPreset {
  return FLOW_PRESETS.find((preset) => preset.id === id) ?? FLOW_PRESETS[0];
}

export function createFlowParams(preset: FlowPresetId = "threads", seed = "BEND-FLOW"): FlowParams {
  return { id: "flow", version: 1, preset, seed: normalizeSeed(seed), ...getFlowPreset(preset).defaults };
}

export function normalizeFlowParams(value: Partial<FlowParams> & { seed?: string }): FlowParams {
  const preset = isFlowPreset(value.preset) ? value.preset : "threads";
  const defaults = createFlowParams(preset, typeof value.seed === "string" ? value.seed : "BEND-FLOW");
  return {
    ...defaults,
    seed: normalizeSeed(typeof value.seed === "string" ? value.seed : defaults.seed),
    particleDensity: clamp(value.particleDensity, 0.05, 1, defaults.particleDensity),
    fieldScale: clamp(value.fieldScale, 0.2, 3, defaults.fieldScale),
    flowSpeed: clamp(value.flowSpeed, -2, 2, defaults.flowSpeed),
    curl: clamp(value.curl, 0, 2, defaults.curl),
    trailLength: clamp(value.trailLength, 0, 1, defaults.trailLength),
    lineWidth: clamp(value.lineWidth, 0.05, 1, defaults.lineWidth),
    dispersion: clamp(value.dispersion, 0, 1, defaults.dispersion),
    opacity: clamp(value.opacity, 0, 1, defaults.opacity),
    palette: isPalette(value.palette) ? value.palette : defaults.palette,
    renderQuality: isQuality(value.renderQuality) ? value.renderQuality : defaults.renderQuality,
    duration: clamp(value.duration, 0.5, 120, defaults.duration),
  };
}

export function sampleFlowVector(x: number, y: number, time: number, params: FlowParams): { x: number; y: number } {
  const seed = seedToNumber(params.seed) * 19.7;
  const scale = params.fieldScale * 3.4;
  const phase = time * params.flowSpeed;
  const a = Math.sin((x * scale + seed) * 2.1 + phase * 0.9);
  const b = Math.cos((y * scale - seed * 0.6) * 1.7 - phase * 0.65);
  const c = Math.sin((x + y) * scale * 1.3 + phase * 0.4 + seed * 1.8);
  const fieldX = Math.cos((y * scale + c + phase) * 2.2) - a * 0.35;
  const fieldY = Math.sin((x * scale - c - phase * 0.72) * 1.9) + b * 0.35;
  const orbitX = 0.5 - y;
  const orbitY = x - 0.5;
  const length = Math.max(0.001, Math.hypot(fieldX, fieldY));
  const orbitWeight = Math.min(1, params.curl * 0.35);
  return {
    x: (fieldX / length) * (1 - orbitWeight) + orbitX * orbitWeight,
    y: (fieldY / length) * (1 - orbitWeight) + orbitY * orbitWeight,
  };
}

export function flowPalette(id: PaletteId): readonly [string, string, string] {
  return PALETTE_COLORS[id] ?? PALETTE_COLORS.soft;
}

function isFlowPreset(value: unknown): value is FlowPresetId {
  return ["threads", "current", "orbit", "drift"].includes(String(value));
}

function isQuality(value: unknown): value is ProceduralQuality {
  return ["draft", "standard", "high"].includes(String(value));
}

function isPalette(value: unknown): value is PaletteId {
  return ["acid", "ember", "ice", "mono", "contrast", "soft", "saturated"].includes(String(value));
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
}
