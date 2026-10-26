import type { BendProject, ProjectSoundtrack, VideoLayer } from "../core/types";
import { sourceTimeForVideoLayer } from "../core/timeMapping";
import { soundtrackSamplePointsAt } from "./soundtrack";

export interface WaveformPeaks {
  /** Peak magnitude per bucket, normalized to 0..1. */
  buckets: Float32Array;
  /** Source duration represented by the buckets. */
  duration: number;
  /** Highest absolute sample seen while analyzing. */
  peak: number;
}

export function peakAtSourceTime(peaks: WaveformPeaks, sourceTime: number): number {
  if (peaks.buckets.length === 0 || !(peaks.duration > 0)) return 0;
  const clamped = Math.min(Math.max(0, sourceTime), Math.max(0, peaks.duration - 0.000001));
  const index = Math.min(peaks.buckets.length - 1, Math.floor((clamped / peaks.duration) * peaks.buckets.length));
  return peaks.buckets[index] ?? 0;
}

/** Map clip output time to its trimmed, speed-adjusted source peaks. */
export function clipWaveformSamples(peaks: WaveformPeaks, layer: VideoLayer, pointCount: number): Float32Array {
  const count = Math.max(2, Math.floor(pointCount));
  const output = new Float32Array(count);
  const duration = Math.max(0.0001, layer.timeline.duration);
  for (let index = 0; index < count; index += 1) {
    const localTime = (index / (count - 1)) * duration;
    output[index] = peakAtSourceTime(peaks, sourceTimeForVideoLayer(layer, localTime));
  }
  return output;
}

/** Repeated music regions use the same loop mapping as export. */
export function soundtrackWaveformSamples(
  peaks: WaveformPeaks,
  project: BendProject,
  soundtrack: ProjectSoundtrack,
  pointCount: number,
  playbackEnd: number,
): Float32Array {
  const count = Math.max(2, Math.floor(pointCount));
  const output = new Float32Array(count);
  const start = soundtrack.timelineStart;
  const span = Math.max(0.0001, playbackEnd - start);
  for (let index = 0; index < count; index += 1) {
    const projectTime = start + (index / (count - 1)) * span;
    const points = soundtrackSamplePointsAt(soundtrack, projectTime, playbackEnd);
    let peak = 0;
    for (const point of points) peak = Math.max(peak, peakAtSourceTime(peaks, point.sourceTime) * point.gain);
    output[index] = peak;
  }
  return output;
}

export function waveformPeakDb(peak: number): string {
  if (!(peak > 0.000001)) return "-∞ dB";
  return `${(20 * Math.log10(Math.min(1, peak))).toFixed(1)} dB`;
}
