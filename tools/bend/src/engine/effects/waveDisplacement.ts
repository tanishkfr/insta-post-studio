import type { WaveDisplacementParams } from "../core/types";

export const DEFAULT_WAVE_DISPLACEMENT: WaveDisplacementParams = {
  enabled: false,
  intensity: 0.32,
  frequency: 3.4,
  speed: 0.7,
  direction: 18,
  phase: 0,
};

export function clampWaveDisplacement(
  params: Partial<WaveDisplacementParams>,
): WaveDisplacementParams {
  return {
    enabled: params.enabled ?? DEFAULT_WAVE_DISPLACEMENT.enabled,
    intensity: clamp(params.intensity ?? DEFAULT_WAVE_DISPLACEMENT.intensity, 0, 1),
    frequency: clamp(params.frequency ?? DEFAULT_WAVE_DISPLACEMENT.frequency, 0.2, 12),
    speed: clamp(params.speed ?? DEFAULT_WAVE_DISPLACEMENT.speed, -3, 3),
    direction: wrapDegrees(params.direction ?? DEFAULT_WAVE_DISPLACEMENT.direction),
    phase: wrapDegrees(params.phase ?? DEFAULT_WAVE_DISPLACEMENT.phase),
  };
}

export function directionVector(degrees: number): { x: number; y: number } {
  const radians = (wrapDegrees(degrees) * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

export function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

