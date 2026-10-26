import type { AnimationEasing } from "../core/types";

export interface EasingOption {
  value: AnimationEasing;
  label: string;
  description: string;
  bezier?: [number, number, number, number];
}

export const EASING_OPTIONS: readonly EasingOption[] = [
  { value: "hold", label: "Hold", description: "Keep the value until the next keyframe." },
  { value: "linear", label: "Linear", description: "Move at a constant rate." },
  { value: "ease-in", label: "Ease in", description: "Start slowly and accelerate." },
  { value: "ease-out", label: "Ease out", description: "Start quickly and settle." },
  { value: "ease-in-out", label: "Ease in / out", description: "Slow at both ends." },
  { value: "cubic-bezier", label: "Custom Bézier", description: "Control the curve with four Bézier values.", bezier: [0.25, 0.1, 0.25, 1] },
];

export const EASING_PRESETS: readonly EasingOption[] = [
  ...EASING_OPTIONS.filter((option) => option.value !== "cubic-bezier"),
  { value: "cubic-bezier", label: "Snappy", description: "Fast response with a short settle.", bezier: [0.22, 1, 0.36, 1] },
  { value: "cubic-bezier", label: "Editorial", description: "A measured, confident acceleration.", bezier: [0.65, 0, 0.35, 1] },
  { value: "cubic-bezier", label: "Slow start", description: "A long, deliberate wind-up before moving.", bezier: [0.85, 0, 0.15, 1] },
];

export function easingLabel(easing: AnimationEasing, bezier?: [number, number, number, number]): string {
  const option = EASING_OPTIONS.find((candidate) => candidate.value === easing);
  if (easing === "cubic-bezier" && bezier) return `${option?.label ?? "Bézier"} (${bezier.map((value) => value.toFixed(2)).join(", ")})`;
  return option?.label ?? easing;
}

export function defaultBezier(): [number, number, number, number] {
  return [0.25, 0.1, 0.25, 1];
}
