import type { SoundtrackDuckingSettings } from "../core/types";

export interface DuckingEnvelope {
  /** Per-sample music gain multiplier. Never boosts. */
  gain: Float32Array;
  /** Largest reduction actually reached, in positive dB. */
  maxReductionDb: number;
  /** Fraction of samples ducked by at least 0.25 dB. */
  activeRatio: number;
}

const ANALYSIS_WINDOW_SECONDS = 0.02;

/**
 * Level-driven ducking over the audible clip mix. The sidechain is analyzed in
 * short RMS windows; attack/release smoothing is deterministic and independent
 * of decode order. Settings are clamped by project normalization.
 */
export function computeDuckingEnvelope(
  clipLeft: Float32Array,
  clipRight: Float32Array,
  sampleRate: number,
  settings: SoundtrackDuckingSettings,
  signal?: AbortSignal,
): DuckingEnvelope {
  const length = Math.min(clipLeft.length, clipRight.length);
  const gain = new Float32Array(length);
  if (!settings.enabled || length === 0) {
    gain.fill(1);
    return { gain, maxReductionDb: 0, activeRatio: 0 };
  }
  const blockSize = Math.max(1, Math.round(sampleRate * ANALYSIS_WINDOW_SECONDS));
  const blockCount = Math.ceil(length / blockSize);
  const target = new Float32Array(blockCount);
  const reduction = Math.pow(10, -Math.max(0, Math.min(24, settings.amountDb)) / 20);
  const threshold = Math.max(-60, Math.min(-6, settings.thresholdDb));
  for (let block = 0; block < blockCount; block += 1) {
    throwIfAborted(signal);
    const start = block * blockSize;
    const end = Math.min(length, start + blockSize);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const left = clipLeft[index] ?? 0;
      const right = clipRight[index] ?? 0;
      sum += left * left + right * right;
    }
    const count = Math.max(1, (end - start) * 2);
    const rms = Math.sqrt(sum / count);
    const db = 20 * Math.log10(Math.max(rms, 1e-8));
    if (db <= threshold) {
      target[block] = 1;
    } else {
      // Ramp into the full reduction over 12 dB above the threshold so a
      // quiet syllable does not slam the music down.
      const progress = Math.min(1, (db - threshold) / 12);
      target[block] = 1 - (1 - reduction) * progress;
    }
  }

  const attackSeconds = Math.max(0.01, Math.min(1, settings.attack));
  const releaseSeconds = Math.max(0.02, Math.min(3, settings.release));
  const attackCoefficient = 1 - Math.exp(-1 / (attackSeconds * sampleRate));
  const releaseCoefficient = 1 - Math.exp(-1 / (releaseSeconds * sampleRate));
  let current = 1;
  let minimum = 1;
  let activeSamples = 0;
  for (let index = 0; index < length; index += 1) {
    const desired = target[Math.min(blockCount - 1, Math.floor(index / blockSize))] ?? 1;
    const coefficient = desired < current ? attackCoefficient : releaseCoefficient;
    current += (desired - current) * coefficient;
    gain[index] = current;
    if (current < minimum) minimum = current;
    if (current < 0.972) activeSamples += 1;
  }
  return {
    gain,
    maxReductionDb: minimum < 0.9999 ? -20 * Math.log10(Math.max(1e-6, minimum)) : 0,
    activeRatio: length > 0 ? activeSamples / length : 0,
  };
}

export function describeDucking(envelope: Pick<DuckingEnvelope, "maxReductionDb" | "activeRatio">): string {
  if (envelope.maxReductionDb < 0.25 || envelope.activeRatio < 0.002) {
    return "Ducking is enabled, but the audible clip mix stayed below the threshold; music gain was not reduced.";
  }
  return `Ducking reduced the soundtrack by up to ${envelope.maxReductionDb.toFixed(1)} dB for ${Math.round(envelope.activeRatio * 100)}% of the mixed range.`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Audio analysis cancelled.", "AbortError");
}
