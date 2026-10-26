import type { BendProject, ProjectSoundtrack } from "../core/types";

export interface SoundtrackSamplePoint {
  sourceTime: number;
  gain: number;
  /** Zero-based repetition index. */
  iteration: number;
}

export interface SoundtrackLoopSummary {
  sourceDuration: number;
  playbackDuration: number;
  playbackEnd: number;
  repetitions: number;
  loop: boolean;
  crossfade: number;
}

export function soundtrackSourceDuration(soundtrack: Pick<ProjectSoundtrack, "sourceIn" | "sourceOut">): number {
  return Math.max(0.0001, soundtrack.sourceOut - soundtrack.sourceIn);
}

/** The audible region of the music lane, capped by the composition end. */
export function soundtrackPlaybackEnd(project: BendProject): number {
  const soundtrack = project.soundtrack;
  if (!soundtrack) return 0;
  const compositionEnd = Math.max(0.1, project.canvas.duration);
  const sourceDuration = soundtrackSourceDuration(soundtrack);
  const naturalEnd = soundtrack.timelineStart + sourceDuration;
  return Math.min(compositionEnd, soundtrack.loop ? compositionEnd : naturalEnd);
}

export function soundtrackLoopSummary(project: BendProject): SoundtrackLoopSummary | null {
  const soundtrack = project.soundtrack;
  if (!soundtrack) return null;
  const sourceDuration = soundtrackSourceDuration(soundtrack);
  const playbackEnd = soundtrackPlaybackEnd(project);
  const playbackDuration = Math.max(0, playbackEnd - soundtrack.timelineStart);
  return {
    sourceDuration,
    playbackDuration,
    playbackEnd,
    repetitions: soundtrack.loop ? Math.max(0, Math.ceil(playbackDuration / sourceDuration)) : Math.min(1, playbackDuration > 0 ? 1 : 0),
    loop: soundtrack.loop,
    crossfade: soundtrack.loop ? Math.min(soundtrack.loopCrossfade, sourceDuration * 0.5) : 0,
  };
}

/**
 * Deterministic soundtrack sampling shared by export and preview timing.
 * Looping is a timing behavior over one decoded source; no repeated blobs are
 * created. At a loop boundary, the previous tail and the next head overlap for
 * a short equal-power crossfade so the join does not click.
 */
export function soundtrackSamplePointsAt(
  soundtrack: ProjectSoundtrack,
  projectTime: number,
  playbackEnd: number,
): SoundtrackSamplePoint[] {
  if (projectTime < soundtrack.timelineStart - 0.000001) return [];
  if (projectTime >= playbackEnd - 0.000001) return [];
  const sourceDuration = soundtrackSourceDuration(soundtrack);
  const local = Math.max(0, projectTime - soundtrack.timelineStart);
  if (!soundtrack.loop) {
    if (local >= sourceDuration) return [];
    return [{ sourceTime: soundtrack.sourceIn + local, gain: 1, iteration: 0 }];
  }
  const iteration = Math.max(0, Math.floor(local / sourceDuration + 1e-9));
  const loopLocal = Math.min(sourceDuration - 0.000001, Math.max(0, local - iteration * sourceDuration));
  const crossfade = Math.min(soundtrack.loopCrossfade, sourceDuration * 0.5);
  const points: SoundtrackSamplePoint[] = [];
  if (iteration > 0 && crossfade > 0.0001 && loopLocal < crossfade) {
    const progress = Math.min(1, Math.max(0, loopLocal / crossfade));
    const incomingGain = Math.sin(progress * Math.PI * 0.5);
    const outgoingGain = Math.cos(progress * Math.PI * 0.5);
    points.push({
      sourceTime: soundtrack.sourceIn + Math.max(0, sourceDuration - crossfade + loopLocal),
      gain: outgoingGain,
      iteration: iteration - 1,
    });
    points.push({
      sourceTime: soundtrack.sourceIn + loopLocal,
      gain: incomingGain,
      iteration,
    });
    return points;
  }
  points.push({ sourceTime: soundtrack.sourceIn + loopLocal, gain: 1, iteration });
  return points;
}

/** Music gain after its own gain, fades, and optional ducking envelope. */
export function soundtrackGainAt(
  soundtrack: ProjectSoundtrack,
  projectTime: number,
  playbackEnd: number,
  duckGain = 1,
): number {
  const playbackDuration = Math.max(0.0001, playbackEnd - soundtrack.timelineStart);
  const local = Math.max(0, projectTime - soundtrack.timelineStart);
  const fadeIn = Math.min(soundtrack.fadeIn, playbackDuration);
  const fadeOut = Math.min(soundtrack.fadeOut, playbackDuration);
  const inGain = fadeIn > 0.0001 ? Math.min(1, local / fadeIn) : 1;
  const outGain = fadeOut > 0.0001 ? Math.min(1, Math.max(0, (playbackDuration - local) / fadeOut)) : 1;
  return Math.min(1, Math.max(0, Math.pow(10, soundtrack.gainDb / 20) * inGain * outGain * duckGain));
}
