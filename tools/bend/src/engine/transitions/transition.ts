import { evaluateEasingProgress, getTargetValue, evaluateAnimatedProperty } from "../animation/engine";
import type { BendLayer, BendProject, ClipTransition, ClipTransitionDirection, ClipTransitionType, VideoLayer } from "../core/types";
import { getLayerDuration } from "../core/project";
import { layerEndAt, layerStartAt } from "../core/timeline";

export interface TransitionDefinition {
  id: ClipTransitionType;
  name: string;
  description: string;
  supportsDirection: boolean;
  defaultDuration: number;
}

export const TRANSITION_DEFINITIONS: readonly TransitionDefinition[] = [
  { id: "crossfade", name: "Dissolve", description: "Both shots contribute through an even crossfade.", supportsDirection: false, defaultDuration: 0.6 },
  { id: "dip-black", name: "Fade through black", description: "The outgoing shot falls to black, then the incoming shot rises.", supportsDirection: false, defaultDuration: 0.8 },
  { id: "wipe", name: "Directional wipe", description: "A feathered edge reveals the incoming shot.", supportsDirection: true, defaultDuration: 0.5 },
  { id: "zoom", name: "Zoom blend", description: "The incoming shot pushes in and dissolves over the outgoing frame.", supportsDirection: false, defaultDuration: 0.55 },
  { id: "glitch", name: "Signal split", description: "A restrained RGB split and scan disturbance carries the cut.", supportsDirection: false, defaultDuration: 0.35 },
  { id: "distortion", name: "Wave dissolve", description: "A BEND wave displacement carries the incoming shot over the cut.", supportsDirection: true, defaultDuration: 0.6 },
];

export function getTransitionDefinition(type: ClipTransitionType): TransitionDefinition {
  return TRANSITION_DEFINITIONS.find((definition) => definition.id === type) ?? TRANSITION_DEFINITIONS[0];
}

export function transitionDirectionLabel(direction: ClipTransitionDirection): string {
  return direction[0].toUpperCase() + direction.slice(1);
}

export interface ResolvedTransition {
  incoming: VideoLayer;
  outgoing: VideoLayer;
  transition: ClipTransition;
  start: number;
  end: number;
  duration: number;
  progress: number;
  easedProgress: number;
}

export function getVideoClips(project: BendProject, trackId = "V1"): VideoLayer[] {
  return project.layers
    .filter((layer): layer is VideoLayer => layer.kind === "video" && (layer.trackId || "V1") === trackId)
    .sort((left, right) => layerStartAt(left) - layerStartAt(right) || left.id.localeCompare(right.id));
}

/** Resolves a transition only when the two clips genuinely overlap. */
export function resolveTransition(project: BendProject, incoming: VideoLayer, time: number): ResolvedTransition | null {
  const transition = incoming.transitionIn;
  if (!transition) return null;
  const outgoing = project.layers.find((layer): layer is VideoLayer => layer.kind === "video" && layer.id === transition.fromLayerId);
  if (!outgoing || !outgoing.visible || !incoming.visible) return null;
  if ((outgoing.trackId || "V1") !== (incoming.trackId || "V1")) return null;
  const start = Math.max(layerStartAt(incoming), layerEndAt(outgoing) - transition.duration);
  const end = Math.min(layerStartAt(incoming) + transition.duration, layerEndAt(outgoing));
  if (end <= start + 0.001) return null;
  if (time < start - 0.0001 || time > end + 0.0001) return null;
  const progress = Math.min(1, Math.max(0, (time - start) / Math.max(0.0001, end - start)));
  return {
    incoming,
    outgoing,
    transition,
    start,
    end,
    duration: end - start,
    progress,
    easedProgress: evaluateEasingProgress(progress, transition.easing),
  };
}

export function activeTransitionForClip(project: BendProject, layer: VideoLayer, time: number): {
  asIncoming: ResolvedTransition | null;
  asOutgoing: ResolvedTransition | null;
} {
  const asIncoming = resolveTransition(project, layer, time);
  let asOutgoing: ResolvedTransition | null = null;
  for (const candidate of project.layers) {
    if (candidate.kind !== "video") continue;
    if (!candidate.transitionIn || candidate.transitionIn.fromLayerId !== layer.id) continue;
    const resolved = resolveTransition(project, candidate, time);
    if (resolved) {
      asOutgoing = resolved;
      break;
    }
  }
  return { asIncoming, asOutgoing };
}

export interface TransitionRenderStyle {
  alphaFactor: number;
  scaleFactor: number;
  filter: {
    type: "wipe" | "glitch" | "distortion";
    progress: number;
    direction: ClipTransitionDirection;
    intensity: number;
  } | null;
  audioGain: number;
}

/**
 * Visual and audio contribution of a clip inside a transition. Crossfades
 * multiply the user's animated opacity; wipe/glitch/distortion use one shared
 * compositor filter rather than introducing another renderer.
 */
export function transitionStyleForClip(project: BendProject, layer: VideoLayer, time: number): TransitionRenderStyle {
  const style: TransitionRenderStyle = { alphaFactor: 1, scaleFactor: 1, filter: null, audioGain: 1 };
  const { asIncoming, asOutgoing } = activeTransitionForClip(project, layer, time);
  if (asOutgoing) {
    const p = asOutgoing.easedProgress;
    const type = asOutgoing.transition.type;
    if (type === "dip-black") {
      style.alphaFactor *= 1 - Math.min(1, p * 2);
    }
    // The outgoing shot stays opaque beneath the incoming layer. The incoming
    // layer's alpha (or wipe mask) performs the source-over crossfade; fading
    // both layers independently would double-darken the background.
    style.audioGain *= 1 - p;
    if (type === "zoom") style.scaleFactor *= 1 + p * 0.06 * asOutgoing.transition.intensity;
  }
  if (asIncoming) {
    const p = asIncoming.easedProgress;
    const type = asIncoming.transition.type;
    if (type === "crossfade" || type === "wipe" || type === "glitch" || type === "distortion") {
      style.alphaFactor *= p;
    } else if (type === "dip-black") {
      style.alphaFactor *= Math.max(0, (p - 0.5) * 2);
    } else if (type === "zoom") {
      style.alphaFactor *= p;
      style.scaleFactor *= 1 + (1 - p) * 0.16 * asIncoming.transition.intensity;
    }
    style.audioGain *= p;
    if (type === "wipe" || type === "glitch" || type === "distortion") {
      style.filter = {
        type,
        progress: p,
        direction: asIncoming.transition.direction,
        intensity: asIncoming.transition.intensity,
      };
      // The wipe shader supplies its own edge mask. Other filters still use
      // the ordinary dissolve alpha so both shots contribute throughout.
      if (type === "wipe") style.alphaFactor = 1;
    }
  }
  return style;
}

export function transitionAudioGainAt(project: BendProject, layer: VideoLayer, projectTime: number): number {
  return transitionStyleForClip(project, layer, projectTime).audioGain;
}

/** The overlap an incoming clip currently shares with its transition source. */
export function transitionOverlap(layer: VideoLayer, outgoing: VideoLayer): number {
  return Math.max(0, Math.min(layerStartAt(layer) + getLayerDuration(layer), layerEndAt(outgoing)) - Math.max(layerStartAt(layer), layerStartAt(outgoing)));
}

export function transitionEasingFromLayer(layer: VideoLayer): string {
  return layer.transitionIn?.easing ?? "ease-in-out";
}

export function animatedLayerColorValue(layer: BendLayer, property: string, projectTime: number): number {
  const value = evaluateAnimatedProperty(layer, property, projectTime);
  return typeof value === "number" ? value : Number(getTargetValue(layer, property)) || 0;
}
