import type { BendProject, ProjectLoopRegion } from "./types";

export const DEFAULT_LOOP: ProjectLoopRegion = { enabled: false, start: 0, end: 8 };

export function createDefaultLoop(duration: number): ProjectLoopRegion {
  return { enabled: false, start: 0, end: Math.max(0.1, duration) };
}

/**
 * A loop is a playback/export window, not a separate composition duration.
 * Persisted loops are clamped into the current composition instead of being
 * silently discarded when a layer edit shortens the composition. Only
 * genuinely unusable documents (non-numeric or empty ranges) fall back to the
 * full composition.
 */
export function normalizeLoopRegion(value: unknown, duration: number): ProjectLoopRegion {
  const safeDuration = Math.max(0.1, Number.isFinite(duration) ? duration : 0.1);
  if (!value || typeof value !== "object" || Array.isArray(value)) return createDefaultLoop(safeDuration);
  const record = value as Record<string, unknown>;
  const rawStart = finite(record.start, NaN);
  const rawEnd = finite(record.end, NaN);
  const enabled = record.enabled === true;
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawStart < 0 || !(rawEnd > rawStart + 0.0001)) {
    return createDefaultLoop(safeDuration);
  }
  const end = clamp(rawEnd, 0.05, safeDuration);
  const start = clamp(rawStart, 0, Math.max(0, end - 0.05));
  if (!(end > start + 0.0001)) return createDefaultLoop(safeDuration);
  return {
    enabled,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
  };
}

export function isLoopUsable(loop: ProjectLoopRegion | undefined, duration: number): boolean {
  if (!loop?.enabled) return false;
  return loop.end > loop.start + 0.0001 && loop.start >= 0 && loop.end <= duration + 0.0001;
}

export function loopDuration(loop: ProjectLoopRegion): number {
  return Math.max(0, loop.end - loop.start);
}

/**
 * Wraps a playhead that has advanced past the loop end. The first frame after
 * wrapping continues from the loop start; no layer timing or composition
 * duration is changed.
 */
export function advanceLoopTime(time: number, loop: ProjectLoopRegion): number {
  const span = loopDuration(loop);
  if (span <= 0) return loop.start;
  if (time < loop.end) return time;
  return loop.start + ((time - loop.start) % span);
}

export function isTimeInsideLoop(time: number, loop: ProjectLoopRegion): boolean {
  return time >= loop.start && time < loop.end;
}

export function loopForProject(project: BendProject): ProjectLoopRegion {
  return project.loop ?? createDefaultLoop(project.canvas.duration);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
