import type { PaletteId, RefractionParams, RefractionPresetId } from "../core/types";
import { normalizeSeed, PALETTE_COLORS, seedToNumber } from "./signalField";

export interface RefractionPreset {
  id: RefractionPresetId;
  label: string;
  description: string;
  defaults: Omit<RefractionParams, "id" | "version" | "preset" | "seed">;
}

export const REFRACTION_PRESETS: readonly RefractionPreset[] = [
  {
    id: "pool",
    label: "Pool",
    description: "Soft caustics that move like light through shallow water.",
    defaults: { refraction: 0.42, lightIntensity: 0.68, waveScale: 1.15, distortion: 0.4, speed: 0.54, direction: 22, contrast: 0.62, softness: 0.72, palette: "ice", duration: 8 },
  },
  {
    id: "glass",
    label: "Glass",
    description: "Sharper bends with hard, transparent-looking edges.",
    defaults: { refraction: 0.86, lightIntensity: 0.82, waveScale: 2.2, distortion: 0.72, speed: 0.76, direction: 94, contrast: 0.9, softness: 0.22, palette: "mono", duration: 8 },
  },
  {
    id: "prism",
    label: "Prism",
    description: "Layered interference with a chromatic split.",
    defaults: { refraction: 0.7, lightIntensity: 0.9, waveScale: 1.65, distortion: 0.62, speed: 0.68, direction: 138, contrast: 0.78, softness: 0.38, palette: "saturated", duration: 8 },
  },
  {
    id: "mirage",
    label: "Mirage",
    description: "Heat-haze shimmer with a broad atmospheric falloff.",
    defaults: { refraction: 0.56, lightIntensity: 0.58, waveScale: 0.68, distortion: 0.82, speed: 0.42, direction: 6, contrast: 0.48, softness: 0.86, palette: "ember", duration: 8 },
  },
] as const;

export function getRefractionPreset(id: RefractionPresetId): RefractionPreset {
  return REFRACTION_PRESETS.find((preset) => preset.id === id) ?? REFRACTION_PRESETS[0];
}

export function createRefractionParams(preset: RefractionPresetId = "pool", seed = "BEND-REFRACTION"): RefractionParams {
  return { id: "refraction", version: 1, preset, seed: normalizeSeed(seed), ...getRefractionPreset(preset).defaults };
}

export function normalizeRefractionParams(value: Partial<RefractionParams> & { seed?: string }): RefractionParams {
  const preset = isRefractionPreset(value.preset) ? value.preset : "pool";
  const defaults = createRefractionParams(preset, typeof value.seed === "string" ? value.seed : "BEND-REFRACTION");
  return {
    ...defaults,
    seed: normalizeSeed(typeof value.seed === "string" ? value.seed : defaults.seed),
    refraction: clamp(value.refraction, 0, 1, defaults.refraction),
    lightIntensity: clamp(value.lightIntensity, 0, 1.5, defaults.lightIntensity),
    waveScale: clamp(value.waveScale, 0.2, 4, defaults.waveScale),
    distortion: clamp(value.distortion, 0, 1.5, defaults.distortion),
    speed: clamp(value.speed, -2, 2, defaults.speed),
    direction: wrapDegrees(value.direction, defaults.direction),
    contrast: clamp(value.contrast, 0, 1.5, defaults.contrast),
    softness: clamp(value.softness, 0, 1, defaults.softness),
    palette: isPalette(value.palette) ? value.palette : defaults.palette,
    duration: clamp(value.duration, 0.5, 120, defaults.duration),
  };
}

export function sampleRefraction(x: number, y: number, time: number, params: RefractionParams): { height: number; caustic: number; direction: number } {
  const seed = seedToNumber(params.seed) * 11.4;
  const angle = (params.direction * Math.PI) / 180;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const phase = time * params.speed;
  const waveA = Math.sin((x * directionX + y * directionY) * params.waveScale * 12 + phase + seed);
  const waveB = Math.cos((x * -directionY + y * directionX) * params.waveScale * 8 - phase * 1.4 - seed * 0.7);
  const height = waveA * 0.62 + waveB * 0.38;
  return { height, caustic: Math.pow(Math.max(0, height * 0.5 + 0.5), 1.5), direction: angle };
}

export function refractionPalette(id: PaletteId): readonly [string, string, string] {
  return PALETTE_COLORS[id] ?? PALETTE_COLORS.ice;
}

function isRefractionPreset(value: unknown): value is RefractionPresetId {
  return ["pool", "glass", "prism", "mirage"].includes(String(value));
}

function isPalette(value: unknown): value is PaletteId {
  return ["acid", "ember", "ice", "mono", "contrast", "soft", "saturated"].includes(String(value));
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
}

function wrapDegrees(value: number | undefined, fallback: number): number {
  const safe = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return ((safe % 360) + 360) % 360;
}
