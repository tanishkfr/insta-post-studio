import { getAnimationTrack, getPropertyDefinition, MAX_KEYFRAMES_PER_TRACK } from "./engine";
import { makeId } from "../core/project";
import type { AnimationEasing, AnimationKeyframe, BendLayer, LayerAnimation } from "../core/types";
import { defaultBezier } from "./easing";

const EPSILON = 0.0001;

export interface KeyframeRef {
  layerId: string;
  property: string;
  keyframeId: string;
}

export interface KeyframeClipboardEntry {
  property: string;
  /** Offset from the earliest copied keyframe. */
  offset: number;
  keyframe: AnimationKeyframe;
}

export interface KeyframeClipboard {
  version: 1;
  sourceLayerId: string;
  anchorTime: number;
  entries: KeyframeClipboardEntry[];
}

export type KeyframeOperationResult =
  | { ok: true; animation: LayerAnimation; selection: KeyframeRef[]; message: string }
  | { ok: false; reason: string };

export function copyKeyframeSelection(layer: BendLayer, selection: KeyframeRef[]): KeyframeClipboard | null {
  const selected = resolveSelected(layer, selection);
  if (selected.length === 0) return null;
  const anchorTime = Math.min(...selected.map((entry) => entry.keyframe.time));
  return {
    version: 1,
    sourceLayerId: layer.id,
    anchorTime,
    entries: selected.map((entry) => ({
      property: entry.track.property,
      offset: entry.keyframe.time - anchorTime,
      keyframe: structuredClone(entry.keyframe),
    })),
  };
}

export function pasteKeyframeClipboard(layer: BendLayer, clipboard: KeyframeClipboard | null, atLocalTime: number): KeyframeOperationResult {
  if (!clipboard || clipboard.entries.length === 0) return { ok: false, reason: "Copy keyframes before pasting." };
  if (layer.locked) return { ok: false, reason: `${layer.name} is locked. Unlock the layer to edit keyframes.` };
  const duration = Math.max(0, layer.timeline.duration);
  const span = Math.max(0, ...clipboard.entries.map((entry) => entry.offset));
  const groupStart = clamp(Number.isFinite(atLocalTime) ? atLocalTime : 0, 0, Math.max(0, duration - span));
  const animation: LayerAnimation = structuredClone(layer.animation);
  const newRefs: KeyframeRef[] = [];
  let pasted = 0;
  let skipped = 0;
  for (const entry of clipboard.entries) {
    const track = animation.tracks.find((candidate) => candidate.property === entry.property);
    const definition = getPropertyDefinition(layer, entry.property);
    if (!track || !definition) {
      skipped += 1;
      continue;
    }
    const time = clamp(groupStart + entry.offset, 0, duration);
    track.keyframes = track.keyframes.filter((keyframe) => Math.abs(keyframe.time - time) >= EPSILON);
    if (track.keyframes.length >= MAX_KEYFRAMES_PER_TRACK) {
      return { ok: false, reason: `${definition.label} already has the maximum ${MAX_KEYFRAMES_PER_TRACK} keyframes.` };
    }
    const keyframe: AnimationKeyframe = {
      ...structuredClone(entry.keyframe),
      id: makeId("key"),
      time,
      value: clampKeyframeValue(entry.keyframe.value, definition),
    };
    track.keyframes.push(keyframe);
    track.keyframes.sort((a, b) => a.time - b.time);
    newRefs.push({ layerId: layer.id, property: track.property, keyframeId: keyframe.id });
    pasted += 1;
  }
  if (pasted === 0) {
    return { ok: false, reason: "No compatible animation tracks were available at the paste position." };
  }
  return {
    ok: true,
    animation,
    selection: newRefs,
    message: `Pasted ${pasted} keyframe${pasted === 1 ? "" : "s"}${skipped ? ` and skipped ${skipped} incompatible track${skipped === 1 ? "" : "s"}` : ""}. Relative timing preserved.`,
  };
}

export function duplicateKeyframeSelection(layer: BendLayer, selection: KeyframeRef[], fps: number): KeyframeOperationResult {
  if (layer.locked) return { ok: false, reason: `${layer.name} is locked. Unlock the layer to edit keyframes.` };
  const selected = resolveSelected(layer, selection);
  if (selected.length === 0) return { ok: false, reason: "Select keyframes to duplicate." };
  const duration = Math.max(0, layer.timeline.duration);
  const minTime = Math.min(...selected.map((entry) => entry.keyframe.time));
  const maxTime = Math.max(...selected.map((entry) => entry.keyframe.time));
  const frame = 1 / Math.max(1, fps);
  const desiredShift = maxTime - minTime + frame;
  const available = duration - maxTime;
  const shift = Math.min(desiredShift, Math.max(0, available));
  if (shift < frame * 0.5) {
    return { ok: false, reason: "There is no room after these keyframes. Move them earlier or extend the layer." };
  }
  const animation: LayerAnimation = structuredClone(layer.animation);
  const newRefs: KeyframeRef[] = [];
  const destinations = new Map<string, Set<number>>();
  for (const entry of selected) {
    const destination = roundTime(entry.keyframe.time + shift);
    if (destination > duration + EPSILON) {
      return { ok: false, reason: "The duplicate would exceed the layer duration. Move the selection earlier first." };
    }
    const track = animation.tracks.find((candidate) => candidate.property === entry.track.property);
    if (!track) return { ok: false, reason: "An animation track disappeared during duplication." };
    const current = destinations.get(track.property) ?? new Set<number>();
    if (current.has(destination)) return { ok: false, reason: "Two selected keyframes would land at the same time." };
    current.add(destination);
    destinations.set(track.property, current);
    if (track.keyframes.some((keyframe) => Math.abs(keyframe.time - destination) < EPSILON)) {
      return { ok: false, reason: "The duplicate would overlap existing keyframes. Move the selection earlier or extend the layer." };
    }
    if (track.keyframes.length >= MAX_KEYFRAMES_PER_TRACK) {
      return { ok: false, reason: `A track already has the maximum ${MAX_KEYFRAMES_PER_TRACK} keyframes.` };
    }
    const duplicate: AnimationKeyframe = { ...structuredClone(entry.keyframe), id: makeId("key"), time: destination };
    track.keyframes.push(duplicate);
    track.keyframes.sort((a, b) => a.time - b.time);
    newRefs.push({ layerId: layer.id, property: track.property, keyframeId: duplicate.id });
  }
  return {
    ok: true,
    animation,
    selection: newRefs,
    message: `Duplicated ${newRefs.length} keyframe${newRefs.length === 1 ? "" : "s"} ${shift.toFixed(2)}s later.`,
  };
}

export function deleteKeyframeSelection(layer: BendLayer, selection: KeyframeRef[]): KeyframeOperationResult {
  if (layer.locked) return { ok: false, reason: `${layer.name} is locked. Unlock the layer to edit keyframes.` };
  const selected = resolveSelected(layer, selection);
  if (selected.length === 0) return { ok: false, reason: "Select keyframes to delete." };
  const ids = new Set(selected.map((entry) => entry.keyframe.id));
  const animation: LayerAnimation = {
    version: 1,
    tracks: layer.animation.tracks
      .map((track) => ({ ...track, keyframes: track.keyframes.filter((keyframe) => !ids.has(keyframe.id)) }))
      .filter((track) => track.keyframes.length > 0 || track.modulator),
  };
  return {
    ok: true,
    animation,
    selection: [],
    message: `Deleted ${ids.size} keyframe${ids.size === 1 ? "" : "s"}.`,
  };
}

export function moveKeyframeSelection(layer: BendLayer, selection: KeyframeRef[], delta: number, fps: number): KeyframeOperationResult {
  if (layer.locked) return { ok: false, reason: `${layer.name} is locked. Unlock the layer to move keyframes.` };
  const selected = resolveSelected(layer, selection);
  if (selected.length === 0) return { ok: false, reason: "Select keyframes to move." };
  const duration = Math.max(0, layer.timeline.duration);
  const minTime = Math.min(...selected.map((entry) => entry.keyframe.time));
  const maxTime = Math.max(...selected.map((entry) => entry.keyframe.time));
  const shift = clamp(delta, -minTime, duration - maxTime);
  if (Math.abs(shift) < 1e-7) {
    return { ok: false, reason: shift === 0 ? "Those keyframes are already at the edge of the layer." : "The group could not move further." };
  }
  const frame = 1 / Math.max(1, fps);
  const snappedShift = fps > 0 && Math.abs(shift) < frame * 0.5 ? Math.sign(shift) * Math.min(frame, Math.abs(shift)) : shift;
  const movingIds = new Set(selected.map((entry) => entry.keyframe.id));
  const animation: LayerAnimation = structuredClone(layer.animation);
  const selectionAfter: KeyframeRef[] = [];
  for (const track of animation.tracks) {
    const trackEntries = selected.filter((entry) => entry.track.property === track.property);
    if (trackEntries.length === 0) continue;
    const destinations = new Set(trackEntries.map((entry) => roundTime(entry.keyframe.time + shift)));
    track.keyframes = track.keyframes
      .filter((keyframe) => {
        if (movingIds.has(keyframe.id)) return true;
        return ![...destinations].some((destination) => Math.abs(keyframe.time - destination) < EPSILON);
      })
      .map((keyframe) => movingIds.has(keyframe.id)
        ? { ...keyframe, time: roundTime(keyframe.time + shift) }
        : keyframe)
      .sort((a, b) => a.time - b.time);
    for (const entry of trackEntries) {
      const keyframe = track.keyframes.find((candidate) => candidate.id === entry.keyframe.id);
      if (keyframe) selectionAfter.push({ layerId: layer.id, property: track.property, keyframeId: keyframe.id });
    }
  }
  return {
    ok: true,
    animation,
    selection: selectionAfter,
    message: `Moved ${selectionAfter.length} keyframe${selectionAfter.length === 1 ? "" : "s"} ${snappedShift > 0 ? "later" : "earlier"} by ${Math.abs(snappedShift).toFixed(2)}s.`,
  };
}

export function applyEasingToKeyframeSelection(
  layer: BendLayer,
  selection: KeyframeRef[],
  easing: AnimationEasing,
  bezier?: [number, number, number, number],
): KeyframeOperationResult {
  if (layer.locked) return { ok: false, reason: `${layer.name} is locked. Unlock the layer to edit easing.` };
  const selected = resolveSelected(layer, selection);
  if (selected.length === 0) return { ok: false, reason: "Select keyframes to change easing." };
  const ids = new Set(selected.map((entry) => entry.keyframe.id));
  const animation: LayerAnimation = {
    version: 1,
    tracks: layer.animation.tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map((keyframe) => {
        if (!ids.has(keyframe.id)) return keyframe;
        if (easing === "cubic-bezier") {
          return { ...keyframe, easing, bezier: sanitizeBezier(bezier ?? keyframe.bezier) };
        }
        const { bezier: _bezier, ...rest } = keyframe;
        void _bezier;
        return { ...rest, easing };
      }),
    })),
  };
  return {
    ok: true,
    animation,
    selection: selected.map((entry) => ({ layerId: layer.id, property: entry.track.property, keyframeId: entry.keyframe.id })),
    message: `Changed easing for ${ids.size} keyframe${ids.size === 1 ? "" : "s"}.`,
  };
}

export function pruneKeyframeSelection(layer: BendLayer | undefined, selection: KeyframeRef[]): KeyframeRef[] {
  if (!layer || selection.length === 0) return [];
  return selection.filter((ref) => {
    if (ref.layerId !== layer.id) return false;
    const track = getAnimationTrack(layer, ref.property);
    return Boolean(track?.keyframes.some((keyframe) => keyframe.id === ref.keyframeId));
  });
}

export function getSelectedKeyframes(layer: BendLayer, selection: KeyframeRef[]): Array<{ property: string; keyframe: AnimationKeyframe }> {
  return resolveSelected(layer, selection).map((entry) => ({ property: entry.track.property, keyframe: entry.keyframe }));
}

function resolveSelected(layer: BendLayer, selection: KeyframeRef[]): Array<{ track: LayerAnimation["tracks"][number]; keyframe: AnimationKeyframe }> {
  const result: Array<{ track: LayerAnimation["tracks"][number]; keyframe: AnimationKeyframe }> = [];
  for (const ref of selection) {
    if (ref.layerId !== layer.id) continue;
    const track = layer.animation.tracks.find((candidate) => candidate.property === ref.property);
    const keyframe = track?.keyframes.find((candidate) => candidate.id === ref.keyframeId);
    if (track && keyframe) result.push({ track, keyframe });
  }
  return result;
}

function clampKeyframeValue(value: AnimationKeyframe["value"], definition: { valueType: string; min?: number; max?: number }): AnimationKeyframe["value"] {
  if (definition.valueType !== "number" || typeof value !== "number") return value;
  return clamp(value, definition.min ?? Number.NEGATIVE_INFINITY, definition.max ?? Number.POSITIVE_INFINITY);
}

function sanitizeBezier(value: [number, number, number, number] | undefined): [number, number, number, number] {
  const source = value ?? defaultBezier();
  return source.map((point) => clamp(Number.isFinite(point) ? point : 0.5, 0, 1)) as [number, number, number, number];
}

function roundTime(value: number): number {
  return Number(value.toFixed(5));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
