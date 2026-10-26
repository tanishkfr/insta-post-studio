export const motionTokens = {
  duration: {
    immediate: 0.12,
    quick: 0.2,
    standard: 0.28,
    deliberate: 0.38,
  },
  ease: {
    responsive: [0.22, 1, 0.36, 1] as [number, number, number, number],
    soft: [0.16, 1, 0.3, 1] as [number, number, number, number],
    precise: [0.33, 1, 0.68, 1] as [number, number, number, number],
  },
  transition: {
    immediate: { duration: 0.12, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    quick: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    standard: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    panel: { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.72 },
    spatial: { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.62 },
    precise: { duration: 0.16, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] },
  },
} as const;

export const inspectorSectionOrder = ["edit", "effects", "motion"] as const;

export function sectionDirection(from: string, to: string): -1 | 1 {
  return inspectorSectionOrder.indexOf(to as (typeof inspectorSectionOrder)[number]) >= inspectorSectionOrder.indexOf(from as (typeof inspectorSectionOrder)[number]) ? 1 : -1;
}
