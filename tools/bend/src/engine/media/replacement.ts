import type { BendLayer, MediaAssetRecord, VideoLayer } from "../core/types";
import { getLayerDuration } from "../core/project";

export type SourceDurationPolicy = "preserve-timing" | "fit-source";

export interface SourceReplacementPlan {
  trimStart: number;
  trimEnd: number;
  timelineDuration: number;
  animationBeyondEnd: number;
  policy: SourceDurationPolicy;
}

export function planSourceReplacement(layer: VideoLayer, nextAsset: Pick<MediaAssetRecord, "duration">, policy: SourceDurationPolicy): SourceReplacementPlan {
  const sourceDuration = Math.max(0.1, Number.isFinite(nextAsset.duration) ? nextAsset.duration : 0.1);
  const previousDuration = Math.max(0.1, getLayerDuration(layer));
  const preserve = policy === "preserve-timing";
  const duration = preserve && previousDuration <= sourceDuration + 0.0001
    ? Math.min(sourceDuration, previousDuration)
    : sourceDuration;
  const trimStart = 0;
  const trimEnd = Math.max(trimStart + 0.1, Math.min(sourceDuration, duration));
  const timelineDuration = Math.max(0.1, trimEnd - trimStart);
  return {
    trimStart,
    trimEnd,
    timelineDuration,
    animationBeyondEnd: countAnimationBeyond(layer, timelineDuration),
    policy: preserve && previousDuration <= sourceDuration + 0.0001 ? "preserve-timing" : "fit-source",
  };
}

export function canPreserveTiming(layer: VideoLayer, nextAsset: Pick<MediaAssetRecord, "duration">): boolean {
  return nextAsset.duration + 0.0001 >= getLayerDuration(layer);
}

export function applySourceReplacement(layer: VideoLayer, assetId: string, plan: SourceReplacementPlan): VideoLayer {
  return {
    ...layer,
    assetId,
    trimStart: plan.trimStart,
    trimEnd: plan.trimEnd,
    timeline: { ...layer.timeline, duration: plan.timelineDuration },
  };
}

export function countAnimationBeyond(layer: BendLayer, duration: number): number {
  let count = 0;
  for (const track of layer.animation.tracks) {
    for (const keyframe of track.keyframes) if (keyframe.time > duration + 0.0001) count += 1;
  }
  return count;
}
