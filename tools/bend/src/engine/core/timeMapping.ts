import type { BendLayer, ClipPlayback, SpeedRampPoint, VideoLayer } from "./types";

export const MIN_PLAYBACK_SPEED = 0.25;
export const MAX_PLAYBACK_SPEED = 4;
export const MIN_CLIP_DURATION = 0.1;

export function clampPlaybackSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, Number(value.toFixed(3))));
}

export function defaultClipPlayback(): ClipPlayback {
  return {
    speed: 1,
    reverse: false,
    rampEnabled: false,
    rampPoints: [
      { time: 0, speed: 1 },
      { time: 1, speed: 1 },
    ],
    freeze: null,
  };
}

export function normalizeSpeedRampPoints(value: unknown): SpeedRampPoint[] {
  const raw = Array.isArray(value) ? value : [];
  const points = raw
    .filter((point): point is Record<string, unknown> => Boolean(point && typeof point === "object" && !Array.isArray(point)))
    .map((point) => ({
      time: Math.min(1, Math.max(0, finite(point.time, 0))),
      speed: clampPlaybackSpeed(finite(point.speed, 1)),
    }))
    .sort((left, right) => left.time - right.time)
    .slice(0, 6);
  if (points.length < 2) {
    return [
      { time: 0, speed: 1 },
      { time: 1, speed: 1 },
    ];
  }
  if (points[0].time > 0.0001) points.unshift({ time: 0, speed: points[0].speed });
  if (points[points.length - 1].time < 0.9999) points.push({ time: 1, speed: points[points.length - 1].speed });
  const unique: SpeedRampPoint[] = [];
  for (const point of points) {
    const previous = unique[unique.length - 1];
    if (previous && Math.abs(previous.time - point.time) < 0.0001) {
      unique[unique.length - 1] = { time: point.time, speed: point.speed };
    } else {
      unique.push(point);
    }
  }
  if (unique.length < 2) {
    return [
      { time: 0, speed: unique[0]?.speed ?? 1 },
      { time: 1, speed: unique[0]?.speed ?? 1 },
    ];
  }
  return unique;
}

export function normalizeClipPlayback(value: unknown): ClipPlayback {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const freezeRaw = raw.freeze && typeof raw.freeze === "object" && !Array.isArray(raw.freeze)
    ? raw.freeze as Record<string, unknown>
    : null;
  const freeze = freezeRaw && freezeRaw.enabled !== false && finite(freezeRaw.duration, 0) >= MIN_CLIP_DURATION
    ? {
      sourceTime: Math.max(0, finite(freezeRaw.sourceTime, 0)),
      duration: Math.max(MIN_CLIP_DURATION, finite(freezeRaw.duration, 1)),
    }
    : null;
  const rampPoints = normalizeSpeedRampPoints(raw.rampPoints);
  return {
    speed: clampPlaybackSpeed(finite(raw.speed, 1)),
    reverse: raw.reverse === true,
    rampEnabled: raw.rampEnabled === true,
    rampPoints,
    freeze,
  };
}

export function speedAtProgress(playback: ClipPlayback, progress: number): number {
  if (!playback.rampEnabled) return clampPlaybackSpeed(playback.speed);
  const points = normalizeSpeedRampPoints(playback.rampPoints);
  const u = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    const left = points[index - 1];
    if (u <= right.time + 0.0000001) {
      if (right.time <= left.time + 0.0000001) return right.speed;
      const amount = (u - left.time) / (right.time - left.time);
      return clampPlaybackSpeed(left.speed + (right.speed - left.speed) * amount);
    }
  }
  return points[points.length - 1]?.speed ?? 1;
}

/**
 * Integral of the piecewise-linear speed curve from zero to `progress`.
 * The integral is the media-distance consumed; it is monotonically increasing
 * for forward playback because every speed is positive.
 */
export function integrateSpeed(playback: ClipPlayback, progress = 1): number {
  const u = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (!playback.rampEnabled) return clampPlaybackSpeed(playback.speed) * u;
  const points = normalizeSpeedRampPoints(playback.rampPoints);
  let area = 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    const from = Math.min(u, left.time);
    const to = Math.min(u, right.time);
    if (to > from && right.time > left.time) {
      const startSpeed = left.speed + (right.speed - left.speed) * ((from - left.time) / (right.time - left.time));
      const endSpeed = left.speed + (right.speed - left.speed) * ((to - left.time) / (right.time - left.time));
      area += (startSpeed + endSpeed) * 0.5 * (to - from);
    }
    if (u <= right.time) break;
  }
  return area;
}

export function averagePlaybackSpeed(playback: ClipPlayback): number {
  if (playback.freeze) return 0;
  return Math.max(MIN_PLAYBACK_SPEED, integrateSpeed(playback, 1));
}

export function sourceSpan(layer: Pick<VideoLayer, "trimStart" | "trimEnd">): number {
  return Math.max(0.01, layer.trimEnd - layer.trimStart);
}

/** Real output duration after speed/ramp/freeze rules. */
export function clipDurationForSource(sourceDuration: number, playback: ClipPlayback): number {
  if (playback.freeze) return Math.max(MIN_CLIP_DURATION, playback.freeze.duration);
  const speed = averagePlaybackSpeed(playback);
  return Math.max(MIN_CLIP_DURATION, sourceDuration / Math.max(MIN_PLAYBACK_SPEED, speed));
}

export function videoLayerDuration(layer: VideoLayer): number {
  return clipDurationForSource(sourceSpan(layer), normalizeClipPlayback(layer.playback));
}

/** Raw source progress in [0, 1] for a normalized output progress. */
export function sourceProgressAtOutputProgress(playback: ClipPlayback, outputProgress: number): number {
  if (playback.freeze) return 0;
  const total = integrateSpeed(playback, 1);
  if (total <= 0.0000001) return Math.min(1, Math.max(0, outputProgress));
  return Math.min(1, Math.max(0, integrateSpeed(playback, outputProgress) / total));
}

/**
 * Deterministic source-time mapping used by preview, temporal sampling, and
 * export. It never returns a frame outside the trimmed source interval.
 */
export function sourceTimeForVideoLayer(layer: VideoLayer, localTime: number): number {
  const playback = normalizeClipPlayback(layer.playback);
  const span = sourceSpan(layer);
  if (playback.freeze) {
    return Math.min(layer.trimEnd, Math.max(layer.trimStart, playback.freeze.sourceTime));
  }
  const duration = videoLayerDuration(layer);
  const progress = Math.min(1, Math.max(0, duration > 0 ? localTime / duration : 0));
  const sourceProgress = sourceProgressAtOutputProgress(playback, progress);
  const epsilon = Math.min(0.001, span * 0.5);
  return playback.reverse
    ? Math.max(layer.trimStart, Math.min(layer.trimEnd - epsilon, layer.trimEnd - sourceProgress * span))
    : Math.max(layer.trimStart, Math.min(layer.trimEnd - epsilon, layer.trimStart + sourceProgress * span));
}

export function sourceTimeAtProjectTime(layer: VideoLayer, projectTime: number): number {
  return sourceTimeForVideoLayer(layer, projectTime - layer.timeline.start);
}

export function localProgressAtProjectTime(layer: BendLayer, projectTime: number): number {
  if (layer.kind !== "video") {
    return Math.min(1, Math.max(0, (projectTime - layer.timeline.start) / Math.max(0.0001, layer.timeline.duration)));
  }
  return Math.min(1, Math.max(0, (projectTime - layer.timeline.start) / Math.max(0.0001, videoLayerDuration(layer))));
}

/** Split a ramp so both parts retain the same source-time speed curve. */
export function splitPlaybackAtProgress(playback: ClipPlayback, splitOutputProgress: number): { left: ClipPlayback; right: ClipPlayback } {
  if (playback.freeze) {
    const splitDuration = Math.max(MIN_CLIP_DURATION, playback.freeze.duration * splitOutputProgress);
    const rightDuration = Math.max(MIN_CLIP_DURATION, playback.freeze.duration - splitDuration);
    return {
      left: { ...playback, freeze: { ...playback.freeze, duration: splitDuration } },
      right: { ...playback, freeze: { ...playback.freeze, duration: rightDuration } },
    };
  }
  const progress = Math.min(0.9999, Math.max(0.0001, splitOutputProgress));
  if (!playback.rampEnabled) {
    return { left: structuredClone(playback), right: structuredClone(playback) };
  }
  const points = normalizeSpeedRampPoints(playback.rampPoints);
  const leftPoints = points
    .filter((point) => point.time <= progress + 0.0001)
    .map((point) => ({ time: Math.min(1, point.time / progress), speed: point.speed }));
  const rightPoints = points
    .filter((point) => point.time >= progress - 0.0001)
    .map((point) => ({ time: Math.max(0, (point.time - progress) / (1 - progress)), speed: point.speed }));
  const splitSpeed = speedAtProgress(playback, progress);
  leftPoints.push({ time: 1, speed: splitSpeed });
  rightPoints.unshift({ time: 0, speed: splitSpeed });
  return {
    left: { ...playback, rampPoints: normalizeSpeedRampPoints(leftPoints) },
    right: { ...playback, rampPoints: normalizeSpeedRampPoints(rightPoints) },
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
