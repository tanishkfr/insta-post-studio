import { evaluateAnimatedProperty, evaluateAnimatedLayer } from "../animation/engine";
import { makeId } from "../core/project";
import { layerEndAt, layerStartAt } from "../core/timeline";
import {
  MIN_CLIP_DURATION,
  splitPlaybackAtProgress,
  sourceTimeForVideoLayer,
  videoLayerDuration,
} from "../core/timeMapping";
import type {
  BendProject,
  ClipTransition,
  ClipTransitionDirection,
  ClipTransitionType,
  LayerAnimation,
  VideoLayer,
} from "../core/types";
import { getVideoClips, resolveTransition } from "../transitions/transition";

export interface SplitResult {
  project: BendProject;
  leftId: string;
  rightId: string;
}

export function splitVideoClip(project: BendProject, layerId: string, atTime: number): SplitResult {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) throw new Error("Select a video clip to split.");
  if (layer.locked) throw new Error("Unlock this clip before splitting it.");
  const local = atTime - layerStartAt(layer);
  const duration = videoLayerDuration(layer);
  const minimum = Math.min(0.15, duration * 0.2);
  if (local < minimum || local > duration - minimum) {
    throw new Error("The playhead must be inside the clip, away from either edge, to split it.");
  }
  const activeTransition = resolveTransition(project, layer, atTime);
  if (activeTransition) throw new Error("Move the playhead outside the incoming transition before splitting this clip.");
  const outputProgress = local / duration;
  const splitSource = sourceTimeForVideoLayer(layer, local);
  const { left: leftPlayback, right: rightPlayback } = splitPlaybackAtProgress(layer.playback, outputProgress);
  const leftTrimStart = layer.playback.freeze ? layer.trimStart : layer.playback.reverse ? splitSource : layer.trimStart;
  const leftTrimEnd = layer.playback.freeze ? layer.trimEnd : layer.playback.reverse ? layer.trimEnd : splitSource;
  const rightTrimStart = layer.playback.freeze ? layer.trimStart : layer.playback.reverse ? layer.trimStart : splitSource;
  const rightTrimEnd = layer.playback.freeze ? layer.trimEnd : layer.playback.reverse ? splitSource : layer.trimEnd;
  const left: VideoLayer = {
    ...structuredClone(layer),
    trimStart: leftTrimStart,
    trimEnd: Math.max(leftTrimStart + 0.01, leftTrimEnd),
    playback: leftPlayback,
    timeline: { ...layer.timeline, duration: local },
    audio: { ...layer.audio, fadeOut: 0 },
  };
  const right: VideoLayer = {
    ...structuredClone(layer),
    id: makeId("layer"),
    name: `${layer.name} B`,
    trimStart: rightTrimStart,
    trimEnd: Math.max(rightTrimStart + 0.01, rightTrimEnd),
    playback: rightPlayback,
    timeline: { start: atTime, duration: Math.max(MIN_CLIP_DURATION, duration - local) },
    audio: { ...layer.audio, fadeIn: 0 },
    transitionIn: null,
  };
  left.animation = splitAnimation(layer, left, atTime, "left");
  right.animation = splitAnimation(layer, right, atTime, "right");
  const layers = project.layers.map((candidate) => {
    if (candidate.id === layer.id) return left;
    if (candidate.kind === "video" && candidate.transitionIn?.fromLayerId === layer.id) {
      return { ...candidate, transitionIn: { ...candidate.transitionIn, fromLayerId: right.id } };
    }
    return candidate;
  });
  const index = layers.findIndex((candidate) => candidate.id === layer.id);
  layers.splice(index + 1, 0, right);
  // The normalized project pass recalculates exact durations from the split
  // source intervals and speed curves.
  return {
    project: { ...project, layers },
    leftId: left.id,
    rightId: right.id,
  };
}

function splitAnimation(original: VideoLayer, segment: VideoLayer, atTime: number, side: "left" | "right"): LayerAnimation {
  const localSplit = atTime - original.timeline.start;
  const tracks = original.animation.tracks.map((track) => {
    const splitValue = evaluateAnimatedProperty(original, track.property, original.timeline.start + localSplit);
    const withSplit = [...track.keyframes];
    if (!withSplit.some((keyframe) => Math.abs(keyframe.time - localSplit) < 0.0001)) {
      withSplit.push({
        id: makeId("key"),
        time: localSplit,
        value: splitValue,
        easing: yieldEasingAt(original, track.property, localSplit),
      });
      withSplit.sort((left, right) => left.time - right.time);
    }
    const keyframes = side === "left"
      ? withSplit.filter((keyframe) => keyframe.time <= localSplit + 0.0001)
      : withSplit
        .filter((keyframe) => keyframe.time >= localSplit - 0.0001)
        .map((keyframe) => ({ ...keyframe, time: Math.max(0, keyframe.time - localSplit) }));
    if (keyframes.length === 0) {
      keyframes.push({ id: makeId("key"), time: 0, value: splitValue, easing: "ease-in-out" });
    }
    return {
      ...track,
      id: makeId("track"),
      keyframes: keyframes.map((keyframe) => ({
        ...keyframe,
        time: Math.min(segment.timeline.duration, Math.max(0, keyframe.time)),
      })),
    };
  });
  return { version: 1, tracks };
}

function yieldEasingAt(layer: VideoLayer, property: string, localTime: number) {
  const track = layer.animation.tracks.find((candidate) => candidate.property === property);
  if (!track) return "ease-in-out" as const;
  let easing: typeof track.keyframes[number]["easing"] = "ease-in-out";
  for (const keyframe of track.keyframes) {
    if (keyframe.time <= localTime + 0.0001) easing = keyframe.easing;
  }
  return easing;
}

export function removeVideoClip(project: BendProject, layerId: string, ripple = false): BendProject {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) throw new Error("Select a video clip to remove.");
  if (layer.locked) throw new Error("Unlock this clip before removing it.");
  const trackId = layer.trackId || "V1";
  const start = layerStartAt(layer);
  const following = getVideoClips(project, trackId)
    .filter((candidate) => candidate.id !== layerId && layerStartAt(candidate) >= start - 0.0001);
  const rippleShift = following.length > 0 ? Math.max(0, layerStartAt(following[0]) - start) : 0;
  const layers = project.layers
    .filter((candidate) => candidate.id !== layerId)
    .map((candidate) => {
      if (candidate.kind !== "video") return candidate;
      let next = candidate;
      if (next.transitionIn?.fromLayerId === layerId) next = { ...next, transitionIn: null };
      if (ripple && (next.trackId || "V1") === trackId && layerStartAt(candidate) >= start - 0.0001) {
        next = { ...next, timeline: { ...next.timeline, start: Math.max(0, layerStartAt(candidate) - rippleShift) } };
      }
      return next;
    });
  return { ...project, layers };
}

export function closeSequenceGap(project: BendProject, layerId: string): BendProject {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) throw new Error("Select a video clip whose gap should close.");
  const clips = getVideoClips(project, layer.trackId || "V1");
  const index = clips.findIndex((candidate) => candidate.id === layerId);
  const previous = clips[index - 1];
  if (!previous) throw new Error("This is the first clip on the track, so there is no gap before it.");
  if (layer.transitionIn) throw new Error("Remove this clip's transition before closing the gap.");
  const gap = layerStartAt(layer) - layerEndAt(previous);
  if (gap <= 0.001) throw new Error("There is no gap before this clip.");
  const shift = Math.min(gap, layerStartAt(layer));
  return {
    ...project,
    layers: project.layers.map((candidate) => {
      if (candidate.kind !== "video" || (candidate.trackId || "V1") !== (layer.trackId || "V1")) return candidate;
      if (layerStartAt(candidate) < layerStartAt(layer) - 0.0001) return candidate;
      return { ...candidate, timeline: { ...candidate.timeline, start: Math.max(0, layerStartAt(candidate) - shift) } };
    }),
  };
}

export function duplicateVideoClip(project: BendProject, layerId: string): { project: BendProject; layerId: string } {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) throw new Error("Select a video clip to duplicate.");
  if (layer.locked) throw new Error("Unlock this clip before duplicating it.");
  const clips = getVideoClips(project, layer.trackId || "V1");
  const end = clips.reduce((maximum, clip) => Math.max(maximum, layerEndAt(clip)), 0);
  const duplicate: VideoLayer = {
    ...structuredClone(layer),
    id: makeId("layer"),
    name: `${layer.name} copy`,
    timeline: { ...layer.timeline, start: end },
    transitionIn: null,
  };
  return { project: { ...project, layers: [...project.layers, duplicate] }, layerId: duplicate.id };
}

export function moveClipToSequencePosition(
  project: BendProject,
  layerId: string,
  targetIndex: number,
): BendProject {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) throw new Error("Select a video clip to move.");
  if (layer.locked) throw new Error("Unlock this clip before moving it.");
  const trackId = layer.trackId || "V1";
  const clips = getVideoClips(project, trackId);
  const fromIndex = clips.findIndex((candidate) => candidate.id === layerId);
  if (fromIndex < 0) throw new Error("The clip is no longer on its sequence track.");
  const orderedIds = clips.map((clip) => clip.id);
  const [moved] = orderedIds.splice(fromIndex, 1);
  orderedIds.splice(Math.max(0, Math.min(orderedIds.length, targetIndex)), 0, moved);
  return layoutSequence(project, trackId, orderedIds);
}

/** Deterministic magnetic layout for the primary sequence track. */
export function layoutSequence(project: BendProject, trackId: string, orderedIds: string[]): BendProject {
  const clips = getVideoClips(project, trackId);
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  let cursor = 0;
  let previous: VideoLayer | null = null;
  const updates = new Map<string, { start: number; transitionIn: ClipTransition | null }>();
  for (const id of orderedIds) {
    const clip = byId.get(id);
    if (!clip) continue;
    let transitionIn = clip.transitionIn;
    if (transitionIn && (!previous || transitionIn.fromLayerId !== previous.id)) transitionIn = null;
    const overlap = transitionIn && previous
      ? Math.min(transitionIn.duration, previous.timeline.duration * 0.5, clip.timeline.duration * 0.5)
      : 0;
    const start = Math.max(0, cursor - overlap);
    if (transitionIn && overlap < transitionIn.duration - 0.0001) {
      transitionIn = { ...transitionIn, duration: Math.max(0.1, overlap) };
    }
    updates.set(id, { start, transitionIn });
    cursor = start + clip.timeline.duration;
    previous = clip;
  }
  const updated = project.layers.map((layer) => {
    if (layer.kind !== "video" || (layer.trackId || "V1") !== trackId) return layer;
    const update = updates.get(layer.id);
    return update ? { ...layer, timeline: { ...layer.timeline, start: update.start }, transitionIn: update.transitionIn } : layer;
  });
  // Keep z-order aligned with sequence order for the primary track so an
  // incoming clip's transition always composites above its outgoing partner.
  const positions = updated
    .map((layer, index) => layer.kind === "video" && (layer.trackId || "V1") === trackId ? index : -1)
    .filter((index) => index >= 0);
  const byOrderedId = new Map(updated.map((layer) => [layer.id, layer]));
  const sequenceLayers = orderedIds.flatMap((id) => {
    const layer = byOrderedId.get(id);
    return layer ? [layer] : [];
  });
  positions.forEach((position, index) => {
    const layer = sequenceLayers[index];
    if (layer) updated[position] = layer;
  });
  return { ...project, layers: updated };
}

export function orderVideoClips(project: BendProject, layerId: string, offset: -1 | 1): BendProject {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) throw new Error("Select a video clip to reorder.");
  const clips = getVideoClips(project, layer.trackId || "V1");
  const index = clips.findIndex((clip) => clip.id === layerId);
  const target = Math.max(0, Math.min(clips.length - 1, index + offset));
  if (target === index) return project;
  const orderedIds = clips.map((clip) => clip.id);
  orderedIds.splice(index, 1);
  orderedIds.splice(target, 0, layerId);
  return layoutSequence(project, layer.trackId || "V1", orderedIds);
}

export interface TransitionPatch {
  type: ClipTransitionType;
  duration: number;
  direction?: ClipTransitionDirection;
  intensity?: number;
  easing?: ClipTransition["easing"];
}

export function applyTransition(project: BendProject, incomingId: string, patch: TransitionPatch): BendProject {
  const incoming = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === incomingId);
  if (!incoming) throw new Error("Select a video clip to receive a transition.");
  if (incoming.locked) throw new Error("Unlock this clip before adding a transition.");
  const trackId = incoming.trackId || "V1";
  const clips = getVideoClips(project, trackId);
  const index = clips.findIndex((clip) => clip.id === incomingId);
  const outgoing = clips[index - 1];
  if (!outgoing) throw new Error("Add or move a clip before this one to create an incoming transition.");
  const maximum = Math.min(3, outgoing.timeline.duration * 0.8, incoming.timeline.duration * 0.8);
  const duration = Math.min(maximum, Math.max(0.1, Number.isFinite(patch.duration) ? patch.duration : 0.6));
  if (maximum < 0.1) throw new Error("These clips are too short for a transition.");
  const targetStart = layerEndAt(outgoing) - duration;
  const delta = targetStart - incoming.timeline.start;
  const layers = project.layers.map((layer) => {
    if (layer.kind !== "video" || (layer.trackId || "V1") !== trackId) return layer;
    if (layerStartAt(layer) < incoming.timeline.start - 0.0001) return layer;
    return { ...layer, timeline: { ...layer.timeline, start: Math.max(0, layerStartAt(layer) + delta) } };
  }).map((layer) => {
    if (layer.id !== incomingId || layer.kind !== "video") return layer;
    return {
      ...layer,
      transitionIn: {
        id: layer.transitionIn?.id ?? makeId("transition"),
        type: patch.type,
        fromLayerId: outgoing.id,
        duration,
        direction: patch.direction ?? layer.transitionIn?.direction ?? "left",
        intensity: Math.min(1, Math.max(0, patch.intensity ?? layer.transitionIn?.intensity ?? 0.55)),
        easing: patch.easing ?? layer.transitionIn?.easing ?? "ease-in-out",
      } satisfies ClipTransition,
    };
  });
  const reordered = [...layers];
  const positions = reordered
    .map((layer, index) => layer.kind === "video" && (layer.trackId || "V1") === trackId ? index : -1)
    .filter((index) => index >= 0);
  const sorted = reordered
    .filter((layer): layer is VideoLayer => layer.kind === "video" && (layer.trackId || "V1") === trackId)
    .sort((left, right) => layerStartAt(left) - layerStartAt(right));
  positions.forEach((position, index) => {
    if (sorted[index]) reordered[position] = sorted[index];
  });
  return { ...project, layers: reordered };
}

export function removeTransition(project: BendProject, incomingId: string): BendProject {
  const incoming = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === incomingId);
  if (!incoming?.transitionIn) throw new Error("This clip has no incoming transition.");
  const outgoing = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === incoming.transitionIn?.fromLayerId);
  const overlap = outgoing ? Math.max(0, Math.min(incoming.transitionIn.duration, layerEndAt(outgoing) - layerStartAt(incoming))) : 0;
  return {
    ...project,
    layers: project.layers.map((layer) => {
      if (layer.kind !== "video" || (layer.trackId || "V1") !== (incoming.trackId || "V1")) return layer;
      if (layerStartAt(layer) < layerStartAt(incoming) - 0.0001) return layer;
      const next = layer.id === incomingId ? { ...layer, transitionIn: null } : layer;
      return { ...next, timeline: { ...next.timeline, start: Math.max(0, layerStartAt(next) + overlap) } };
    }),
  };
}

export function shiftClipsAfter(project: BendProject, layerId: string, delta: number): BendProject {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.000001) return project;
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) return project;
  const trackId = layer.trackId || "V1";
  return {
    ...project,
    layers: project.layers.map((candidate) => {
      if (candidate.kind !== "video" || (candidate.trackId || "V1") !== trackId) return candidate;
      if (candidate.id === layerId || layerStartAt(candidate) < layerStartAt(layer) - 0.0001) return candidate;
      return { ...candidate, timeline: { ...candidate.timeline, start: Math.max(0, layerStartAt(candidate) + delta) } };
    }),
  };
}

export function previousClipFor(project: BendProject, layerId: string): VideoLayer | null {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) return null;
  const clips = getVideoClips(project, layer.trackId || "V1");
  const index = clips.findIndex((clip) => clip.id === layerId);
  return index > 0 ? clips[index - 1] : null;
}

export function nextClipFor(project: BendProject, layerId: string): VideoLayer | null {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  if (!layer) return null;
  const clips = getVideoClips(project, layer.trackId || "V1");
  const index = clips.findIndex((clip) => clip.id === layerId);
  return index >= 0 ? clips[index + 1] ?? null : null;
}

export function sequenceEnd(project: BendProject, trackId = "V1"): number {
  return getVideoClips(project, trackId).reduce((end, clip) => Math.max(end, layerEndAt(clip)), 0);
}

export function sequenceDuration(project: BendProject, trackId = "V1"): number {
  return getVideoClips(project, trackId).reduce((total, clip) => total + clip.timeline.duration, 0);
}

/** Used by the drag UI when a full magnetic reorder is requested. */
export function sequenceOrder(project: BendProject, trackId = "V1"): string[] {
  return getVideoClips(project, trackId).map((clip) => clip.id);
}

export function clipEvaluationAt(project: BendProject, layerId: string, time: number): VideoLayer | null {
  const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layerId);
  return layer ? evaluateAnimatedLayer(project, layer, time) as VideoLayer : null;
}
