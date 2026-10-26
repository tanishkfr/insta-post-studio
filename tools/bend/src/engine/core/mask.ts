import type { LayerMask, LayerMaskType } from "./types";

export const MASK_TYPES: readonly LayerMaskType[] = ["none", "rectangle", "ellipse", "gradient"];

export const DEFAULT_MASK: LayerMask = {
  type: "none",
  x: 0.5,
  y: 0.5,
  width: 0.7,
  height: 0.7,
  rotation: 0,
  feather: 0.18,
  invert: false,
  angle: 90,
  falloff: 0.55,
};

export function createDefaultMask(): LayerMask {
  return { ...DEFAULT_MASK };
}

/**
 * Mask fields are optional at every persistence boundary. Invalid or missing
 * data resolves to the fully-visible default, so older projects never lose
 * content merely because the schema gained a mask.
 */
export function normalizeMask(value: unknown): LayerMask {
  if (!isRecord(value)) return createDefaultMask();
  const type = MASK_TYPES.includes(value.type as LayerMaskType) ? value.type as LayerMaskType : "none";
  return {
    type,
    x: number(value.x, DEFAULT_MASK.x, -1, 2),
    y: number(value.y, DEFAULT_MASK.y, -1, 2),
    width: number(value.width, DEFAULT_MASK.width, 0.01, 2),
    height: number(value.height, DEFAULT_MASK.height, 0.01, 2),
    rotation: number(value.rotation, DEFAULT_MASK.rotation, -360, 360),
    feather: number(value.feather, DEFAULT_MASK.feather, 0, 1),
    invert: value.invert === true,
    angle: number(value.angle, DEFAULT_MASK.angle, -360, 360),
    falloff: number(value.falloff, DEFAULT_MASK.falloff, 0.01, 1),
  };
}

export function maskSignature(mask: LayerMask | undefined): string {
  const normalized = normalizeMask(mask);
  return JSON.stringify([normalized.type, normalized.feather, normalized.invert, normalized.angle, normalized.falloff]);
}

export function maskIsActive(mask: LayerMask | undefined): boolean {
  const normalized = normalizeMask(mask);
  return normalized.type !== "none";
}

export function maskSummary(mask: LayerMask | undefined): string {
  const normalized = normalizeMask(mask);
  if (normalized.type === "none") return "Full layer visible";
  const label = normalized.type === "rectangle" ? "Rectangle" : normalized.type === "ellipse" ? "Ellipse" : "Linear gradient";
  return `${label} · ${Math.round(normalized.width * 100)}% × ${Math.round(normalized.height * 100)}%${normalized.invert ? " · inverted" : ""}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
}
