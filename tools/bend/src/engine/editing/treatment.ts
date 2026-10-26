import type { AnimationTrack, BendLayer, LayerBlendMode, LayerColorAdjustments, LayerMask, TemporalEffectInstance, VideoLayer, WaveDisplacementParams } from "../core/types";
import { makeId } from "../core/project";

export interface LayerTreatmentClipboard {
  sourceLayerId: string;
  sourceLayerName: string;
  effects: TemporalEffectInstance[];
  color: LayerColorAdjustments;
  mask: LayerMask;
  blendMode: LayerBlendMode;
  wave: WaveDisplacementParams | null;
  animationTracks: AnimationTrack[];
  copiedAt: number;
}

export interface TreatmentPasteResult {
  layer: BendLayer;
  pastedEffects: number;
  pastedTracks: number;
  droppedTracks: number;
}

const TREATMENT_PROPERTIES = ["color.", "effects.", "mask.", "wave.", "blendMode"];

export function copyLayerTreatment(layer: BendLayer): LayerTreatmentClipboard {
  const effects = structuredClone(layer.effects);
  const effectIds = new Set(effects.map((effect) => effect.instanceId));
  const animationTracks = structuredClone(layer.animation.tracks.filter((track) => {
    if (track.property.startsWith("effects.")) {
      const instanceId = track.property.split(".")[1];
      return Boolean(instanceId && effectIds.has(instanceId));
    }
    return TREATMENT_PROPERTIES.some((prefix) => track.property === prefix || track.property.startsWith(prefix));
  }));
  return {
    sourceLayerId: layer.id,
    sourceLayerName: layer.name,
    effects,
    color: structuredClone(layer.color),
    mask: structuredClone(layer.mask),
    blendMode: layer.blendMode,
    wave: layer.kind === "video" ? structuredClone(layer.wave) : null,
    animationTracks,
    copiedAt: Date.now(),
  };
}

/**
 * Replaces the look/treatment of a layer without changing source, trim, timing,
 * transform, or transform animation. Effect instances and their animation
 * tracks are remapped to new identities so pasting the same treatment into
 * several clips cannot alias effect-instance state.
 */
export function pasteLayerTreatment(layer: BendLayer, clipboard: LayerTreatmentClipboard): TreatmentPasteResult {
  const effectIdMap = new Map<string, string>();
  const effects = clipboard.effects.map((effect) => {
    const instanceId = makeId("effect");
    effectIdMap.set(effect.instanceId, instanceId);
    return { ...structuredClone(effect), instanceId };
  });
  const remappedTracks: AnimationTrack[] = [];
  let droppedTracks = 0;
  for (const track of clipboard.animationTracks) {
    let property = track.property;
    if (property.startsWith("effects.")) {
      const pieces = property.split(".");
      const mapped = effectIdMap.get(pieces[1] ?? "");
      if (!mapped) {
        droppedTracks += 1;
        continue;
      }
      pieces[1] = mapped;
      property = pieces.join(".");
    }
    if (property.startsWith("wave.") && layer.kind !== "video") {
      droppedTracks += 1;
      continue;
    }
    remappedTracks.push({
      ...structuredClone(track),
      id: makeId("track"),
      property,
      keyframes: track.keyframes.map((keyframe) => ({ ...structuredClone(keyframe), id: makeId("key") })),
    });
  }
  const retainedTracks = layer.animation.tracks.filter((track) => {
    if (track.property.startsWith("effects.")) return false;
    return !TREATMENT_PROPERTIES.some((prefix) => track.property === prefix || track.property.startsWith(prefix));
  });
  const next: BendLayer = {
    ...layer,
    effects,
    color: structuredClone(clipboard.color),
    mask: structuredClone(clipboard.mask),
    blendMode: clipboard.blendMode,
    animation: { version: 1, tracks: [...retainedTracks, ...remappedTracks] },
  };
  if (next.kind === "video" && clipboard.wave) {
    (next as VideoLayer).wave = structuredClone(clipboard.wave);
  }
  return {
    layer: next,
    pastedEffects: effects.length,
    pastedTracks: remappedTracks.length,
    droppedTracks,
  };
}

export function describeTreatmentClipboard(clipboard: LayerTreatmentClipboard | null): string {
  if (!clipboard) return "No treatment copied";
  return `${clipboard.sourceLayerName}: ${clipboard.effects.length} effect${clipboard.effects.length === 1 ? "" : "s"}, color, mask, blend${clipboard.wave ? ", wave" : ""}`;
}
