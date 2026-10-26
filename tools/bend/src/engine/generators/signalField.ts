import type { PaletteId, SignalFieldParams, SignalPresetId } from "../core/types";

export interface SignalPreset {
  id: SignalPresetId;
  label: string;
  description: string;
  defaults: Omit<SignalFieldParams, "id" | "version" | "preset" | "seed">;
}

export const SIGNAL_PRESETS: readonly SignalPreset[] = [
  {
    id: "pulse",
    label: "Pulse",
    description: "A tight field that breathes in rhythmic bands.",
    defaults: { speed: 0.9, intensity: 0.82, scale: 1.1, frequency: 3.7, palette: "acid", duration: 8 },
  },
  {
    id: "drift",
    label: "Drift",
    description: "Slow currents crossing a warm, grainy horizon.",
    defaults: { speed: 0.42, intensity: 0.66, scale: 1.35, frequency: 2.1, palette: "ember", duration: 8 },
  },
  {
    id: "current",
    label: "Current",
    description: "A cool stream with a little electric tension.",
    defaults: { speed: 1.2, intensity: 0.74, scale: 0.82, frequency: 4.9, palette: "ice", duration: 8 },
  },
  {
    id: "fracture",
    label: "Fracture",
    description: "Hard seams, broken light, and a sharper edge.",
    defaults: { speed: 0.68, intensity: 0.94, scale: 0.64, frequency: 7.2, palette: "mono", duration: 8 },
  },
] as const;

export const PALETTE_COLORS: Record<PaletteId, readonly [string, string, string]> = {
  acid: ["#141416", "#C7FF5B", "#E9FFB3"],
  ember: ["#170F12", "#F16B78", "#FFC08A"],
  ice: ["#0A1822", "#8DE4FF", "#E6FBFF"],
  mono: ["#101014", "#F5F3EF", "#77777F"],
  contrast: ["#050506", "#F5F3EF", "#C7FF5B"],
  soft: ["#121A1D", "#B7DCD4", "#F1D3A4"],
  saturated: ["#160720", "#FF4FD8", "#FFE65B"],
};

export function getSignalPreset(id: SignalPresetId): SignalPreset {
  return SIGNAL_PRESETS.find((preset) => preset.id === id) ?? SIGNAL_PRESETS[0];
}

export function createSignalFieldParams(
  preset: SignalPresetId = "pulse",
  seed = "BEND-01",
): SignalFieldParams {
  const definition = getSignalPreset(preset);
  return { id: "signal-field", version: 1, preset, seed: normalizeSeed(seed), ...definition.defaults };
}

export function normalizeSignalFieldParams(value: Partial<SignalFieldParams> & { seed?: string }): SignalFieldParams {
  const requestedPreset = value.preset && SIGNAL_PRESETS.some((preset) => preset.id === value.preset) ? value.preset : "pulse";
  const defaults = createSignalFieldParams(requestedPreset, typeof value.seed === "string" ? value.seed : "BEND-01");
  return {
    ...defaults,
    speed: clampNumber(value.speed, -3, 3, defaults.speed),
    intensity: clampNumber(value.intensity, 0, 1, defaults.intensity),
    scale: clampNumber(value.scale, 0.1, 4, defaults.scale),
    frequency: clampNumber(value.frequency, 0.2, 12, defaults.frequency),
    palette: isPalette(value.palette) ? value.palette : defaults.palette,
    duration: clampNumber(value.duration, 0.5, 120, defaults.duration),
    seed: normalizeSeed(typeof value.seed === "string" ? value.seed : defaults.seed),
  };
}

export function normalizeSeed(seed: string): string {
  const normalized = seed.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return normalized || "BEND-01";
}

export function randomSeed(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `BEND-${values[0].toString(36).toUpperCase()}${values[1].toString(36).toUpperCase()}`;
  }
  return `BEND-${Math.floor(Math.random() * 0xffffff).toString(36).toUpperCase()}`;
}

export function seedToNumber(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function isPalette(value: unknown): value is PaletteId {
  return ["acid", "ember", "ice", "mono", "contrast", "soft", "saturated"].includes(String(value));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
}

/**
 * A small deterministic CPU reference for tests and non-GPU fallbacks. The
 * preview uses the equivalent GLSL field in `pixiRenderer.ts`.
 */
export function sampleSignalField(
  x: number,
  y: number,
  time: number,
  params: SignalFieldParams,
): { x: number; y: number; energy: number; hue: number } {
  const seed = seedToNumber(params.seed) * 9.0;
  const scale = Math.max(0.1, params.scale);
  const frequency = Math.max(0.1, params.frequency);
  const flow = time * params.speed;
  const a = Math.sin((x * scale + flow + seed) * frequency * 2.3);
  const b = Math.cos((y * scale - flow * 0.7 + seed * 1.7) * frequency * 1.7);
  const c = Math.sin((x + y + seed) * frequency * 1.1 + flow * 2.0);
  const energy = Math.min(1, Math.max(0, (a * 0.35 + b * 0.25 + c * 0.2 + 0.6) * params.intensity));
  return {
    x: a,
    y: b,
    energy,
    hue: (c + 1) * 0.5,
  };
}

