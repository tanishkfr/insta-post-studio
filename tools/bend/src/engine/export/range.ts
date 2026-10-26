import type { BendLayer, BendProject } from "../core/types";
import { getGeneratorDefinition } from "../generators/registry";

export interface ExportRange {
  start: number;
  end: number;
}

export interface ResolvedExportRange extends ExportRange {
  duration: number;
  frameCount: number;
  fps: number;
  full: boolean;
}

export interface SeamlessLoopSupport {
  supported: boolean;
  reasons: string[];
  visibleProceduralLayers: number;
}

export function resolveExportRange(project: BendProject, requested?: ExportRange | null): ResolvedExportRange {
  const duration = Math.max(0.1, project.canvas.duration);
  const start = requested?.start ?? 0;
  const end = requested?.end ?? duration;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("The export range must contain finite start and end times.");
  if (start < 0 || end > duration + 0.0001) throw new Error(`The export range must stay inside 0–${duration.toFixed(2)}s.`);
  if (end <= start + 0.0001) throw new Error("The export range is empty. Choose an end time after the start time.");
  const roundedStart = Number(start.toFixed(6));
  const roundedEnd = Number(Math.min(duration, end).toFixed(6));
  const rangeDuration = Math.max(0.000001, roundedEnd - roundedStart);
  return {
    start: roundedStart,
    end: roundedEnd,
    duration: rangeDuration,
    frameCount: Math.max(1, Math.ceil(rangeDuration * Math.max(1, project.canvas.fps) - 1e-9)),
    fps: project.canvas.fps,
    full: roundedStart < 0.0001 && Math.abs(roundedEnd - duration) < 0.0001,
  };
}

export function exportProjectTime(range: ExportRange, frame: number, fps: number): number {
  return Math.min(range.end - 0.000001, range.start + frame / Math.max(1, fps));
}

export function outputTimeForFrame(frame: number, fps: number): number {
  return frame / Math.max(1, fps);
}

/**
 * Seamless export uses a mirrored (ping-pong) time map over the chosen range.
 * The rendered value at the end of the range approaches the value at its start,
 * so repeat playback is frame-continuous without inventing a second renderer.
 * The mode is only offered for analytic procedural layers without temporal
 * effects, where every visible source is deterministic and seekable.
 */
export function seamlessLoopProjectTime(range: ExportRange, outputTime: number): number {
  const span = Math.max(0, range.end - range.start);
  if (span <= 0) return range.start;
  const phase = Math.min(1, Math.max(0, outputTime / span));
  const mirrored = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  return range.start + mirrored * span;
}

export function analyzeSeamlessLoopSupport(project: BendProject, range: ExportRange): SeamlessLoopSupport {
  const reasons: string[] = [];
  const visibleLayers = project.layers.filter((layer) => layer.visible && layer.timeline.start < range.end && layer.timeline.start + layer.timeline.duration > range.start);
  const procedural = visibleLayers.filter((layer): layer is Extract<BendLayer, { kind: "procedural" }> => layer.kind === "procedural");
  if (procedural.length === 0) reasons.push("Seamless repeat needs at least one visible procedural generator.");
  for (const layer of visibleLayers) {
    if (layer.kind === "video") {
      reasons.push(`${layer.name} is imported footage. Seamless repeat is limited to procedural generators.`);
      continue;
    }
    const definition = getGeneratorDefinition(layer.generator.id);
    if (definition.capabilities.loop === "none") {
      reasons.push(`${definition.name} is stateful and has no periodic cycle.`);
    }
    const effects = layer.effects.filter((effect) => effect.enabled);
    if (effects.length > 0) {
      reasons.push(`${layer.name} has temporal effects. Their sampled history would not repeat with the source.`);
    }
  }
  return { supported: reasons.length === 0, reasons: Array.from(new Set(reasons)), visibleProceduralLayers: procedural.length };
}
