import { createDefaultMask } from "../core/mask";
import { defaultCrop, defaultLayerColor } from "../core/project";
import type { BendProject } from "../core/types";

/**
 * Transient preview-only variant: source + transform/timing without the
 * layer's treatment. It is never normalized into the project, never enters
 * history, and never reaches export.
 */
export function buildComparisonProject(project: BendProject, layerId: string): BendProject {
  const index = project.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return project;
  const comparison = structuredClone(project);
  const layer = comparison.layers[index];
  if (!layer) return project;
  layer.effects = [];
  layer.mask = createDefaultMask();
  layer.crop = defaultCrop();
  layer.color = defaultLayerColor();
  layer.blendMode = "normal";
  if (layer.kind === "video") layer.wave = { ...layer.wave, enabled: false };
  layer.animation = {
    version: 1,
    tracks: layer.animation.tracks.filter((track) => !track.property.startsWith("effects.") && !track.property.startsWith("mask.") && !track.property.startsWith("color.") && !track.property.startsWith("wave.")),
  };
  return comparison;
}
