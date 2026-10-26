import { MAX_ANIMATION_TRACKS, MAX_KEYFRAMES_PER_TRACK } from "../animation/engine";
import { makeId } from "../core/project";
import type { AnimationTrack, BendLayer, TemporalEffectInstance } from "../core/types";
import { createEffectInstanceId, normalizeTemporalEffects } from "./registry";
import { isSupportedTemporalStack } from "./time";

export type EffectStackPasteMode = "replace" | "append";

export interface EffectStackClipboard {
  version: 1;
  sourceLayerId: string;
  sourceLayerName: string;
  copiedAt: number;
  effects: TemporalEffectInstance[];
  animation: AnimationTrack[];
}

export interface EffectStackPasteResult {
  ok: true;
  effects: TemporalEffectInstance[];
  animation: { version: 1; tracks: AnimationTrack[] };
  addedEffectIds: string[];
  addedTrackCount: number;
  skippedDuplicateCount: number;
  insertedBeforeFeedback: boolean;
  message: string;
}

export interface EffectStackPasteFailure {
  ok: false;
  reason: string;
}

export function createEffectStackClipboard(layer: BendLayer): EffectStackClipboard | null {
  if (layer.effects.length === 0) return null;
  const instanceIds = new Set(layer.effects.map((effect) => effect.instanceId));
  const animation = layer.animation.tracks
    .filter((track) => {
      const match = /^effects\.([^.]+)\./.exec(track.property);
      return Boolean(match && instanceIds.has(match[1]));
    })
    .map((track) => structuredClone(track));
  return {
    version: 1,
    sourceLayerId: layer.id,
    sourceLayerName: layer.name,
    copiedAt: Date.now(),
    effects: structuredClone(layer.effects),
    animation,
  };
}

export function clipboardAnimationCount(clipboard: EffectStackClipboard | null): number {
  return clipboard?.animation.length ?? 0;
}

export function describeEffectStackClipboard(clipboard: EffectStackClipboard | null): string {
  if (!clipboard) return "Nothing copied";
  const effectCount = clipboard.effects.length;
  const animationCount = clipboard.animation.length;
  return `${clipboard.sourceLayerName}: ${effectCount} effect${effectCount === 1 ? "" : "s"}${animationCount > 0 ? ` · ${animationCount} animated track${animationCount === 1 ? "" : "s"}` : " · no animation"}`;
}

/**
 * Pasted effects always receive fresh instance identities. Animation tracks are
 * remapped by instance id, never by effect type, so two layers can hold the same
 * stack without sharing automation.
 */
export function pasteEffectStack(layer: BendLayer, clipboard: EffectStackClipboard | null, mode: EffectStackPasteMode): EffectStackPasteResult | EffectStackPasteFailure {
  if (!clipboard || !Array.isArray(clipboard.effects) || clipboard.effects.length === 0) {
    return { ok: false, reason: "Copy an effect stack before pasting." };
  }
  if (layer.locked) return { ok: false, reason: `${layer.name} is locked. Unlock the layer to paste effects.` };
  let pastedEffects: TemporalEffectInstance[];
  try {
    pastedEffects = normalizeTemporalEffects(structuredClone(clipboard.effects));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "The copied effect stack is invalid." };
  }

  const targetIds = new Set(layer.effects.map((effect) => effect.id));
  const candidates = mode === "append" ? pastedEffects.filter((effect) => !targetIds.has(effect.id)) : pastedEffects;
  const skippedDuplicateCount = pastedEffects.length - candidates.length;
  if (candidates.length === 0) {
    return { ok: false, reason: "Every copied effect type already exists on this layer. Use Replace to swap the stack." };
  }

  const nextCount = mode === "replace" ? candidates.length : layer.effects.length + candidates.length;
  if (nextCount > 8) {
    return { ok: false, reason: `BEND supports up to 8 temporal effects per layer. This paste would create ${nextCount}.` };
  }

  const idMap = new Map<string, string>();
  const addedEffects = candidates.map((effect) => {
    const instanceId = createEffectInstanceId(effect.id);
    idMap.set(effect.instanceId, instanceId);
    return { ...structuredClone(effect), instanceId } satisfies TemporalEffectInstance;
  });

  let effects: TemporalEffectInstance[];
  let insertedBeforeFeedback = false;
  if (mode === "replace") {
    effects = addedEffects;
  } else {
    const feedbackIndex = layer.effects.findIndex((effect) => effect.id === "frame-feedback");
    if (feedbackIndex >= 0 && addedEffects.some((effect) => effect.id !== "frame-feedback")) {
      effects = [
        ...layer.effects.slice(0, feedbackIndex),
        ...addedEffects.filter((effect) => effect.id !== "frame-feedback"),
        ...layer.effects.slice(feedbackIndex),
        ...addedEffects.filter((effect) => effect.id === "frame-feedback"),
      ];
      insertedBeforeFeedback = true;
    } else {
      effects = [...layer.effects, ...addedEffects];
    }
  }

  const support = isSupportedTemporalStack(effects.filter((effect) => effect.enabled));
  if (!support.supported) return { ok: false, reason: support.reason ?? "The pasted effect stack is not renderable." };

  const remappedTracks = clipboard.animation.flatMap((track) => {
    const match = /^effects\.([^.]+)\.(.+)$/.exec(track.property);
    if (!match) return [];
    const nextInstance = idMap.get(match[1]);
    if (!nextInstance) return [];
    const keyframes = track.keyframes.slice(0, MAX_KEYFRAMES_PER_TRACK).map((keyframe) => ({ ...structuredClone(keyframe), id: makeId("key") }));
    return [{
      ...structuredClone(track),
      id: makeId("track"),
      property: `effects.${nextInstance}.${match[2]}`,
      keyframes,
    }];
  });

  const baseTracks = mode === "replace"
    ? layer.animation.tracks.filter((track) => !track.property.startsWith("effects."))
    : layer.animation.tracks;
  const existingProperties = new Set(baseTracks.map((track) => track.property));
  const uniqueTracks = remappedTracks.filter((track) => {
    if (existingProperties.has(track.property)) return false;
    existingProperties.add(track.property);
    return true;
  });
  if (baseTracks.length + uniqueTracks.length > MAX_ANIMATION_TRACKS) {
    return { ok: false, reason: `This paste would exceed BEND's ${MAX_ANIMATION_TRACKS}-track animation limit.` };
  }

  const animation = { version: 1 as const, tracks: [...baseTracks, ...uniqueTracks] };
  const animationNote = uniqueTracks.length > 0
    ? `${uniqueTracks.length} animated parameter track${uniqueTracks.length === 1 ? "" : "s"} remapped to fresh effect identities.`
    : "The copied effects had no animated parameters.";
  const duplicateNote = skippedDuplicateCount > 0 ? ` ${skippedDuplicateCount} duplicate effect type${skippedDuplicateCount === 1 ? "" : "s"} skipped.` : "";
  const orderNote = insertedBeforeFeedback ? " New effects were inserted before Frame Feedback to keep it as the final pass." : "";
  const actionNote = mode === "append" ? "Appended" : "Replaced the target stack with";
  return {
    ok: true,
    effects,
    animation,
    addedEffectIds: addedEffects.map((effect) => effect.instanceId),
    addedTrackCount: uniqueTracks.length,
    skippedDuplicateCount,
    insertedBeforeFeedback,
    message: `${actionNote} ${addedEffects.length} effect${addedEffects.length === 1 ? "" : "s"}. ${animationNote}${duplicateNote}${orderNote}`,
  };
}
