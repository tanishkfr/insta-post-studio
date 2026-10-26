import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from "mediabunny";
import type { WaveformPeaks } from "../../engine/audio/waveform";

export interface WaveformResult {
  peaks: WaveformPeaks | null;
  status: "ready" | "none" | "unsupported" | "error";
  message?: string;
}

interface WaveformJob {
  controller: AbortController;
  subscribers: number;
  promise: Promise<WaveformResult>;
  settled: boolean;
}

const cache = new Map<string, WaveformResult>();
const pending = new Map<string, WaveformJob>();
const MAX_CACHE_ENTRIES = 24;
const MAX_WAVEFORM_SECONDS = 900;
const TARGET_BUCKET_RATE = 32;
const MAX_BUCKETS = 4096;
let queue: Promise<unknown> = Promise.resolve();

/** Acquire a bounded, shared waveform analysis. Release it when the view unmounts. */
export function acquireWaveform(assetId: string, url: string): { promise: Promise<WaveformResult>; release: () => void } {
  const key = `${assetId}|${url}`;
  const cached = cache.get(key);
  if (cached) return { promise: Promise.resolve(cached), release: () => undefined };
  let job = pending.get(key);
  if (!job) {
    const controller = new AbortController();
    const created: WaveformJob = {
      controller,
      subscribers: 0,
      settled: false,
      promise: queue.then(() => generate(url, controller.signal)).then((result) => {
        created.settled = true;
        pending.delete(key);
        cache.set(key, result);
        while (cache.size > MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        return result;
      }).catch((error) => {
        created.settled = true;
        pending.delete(key);
        if (controller.signal.aborted) return { peaks: null, status: "none", message: "Waveform analysis was cancelled." } satisfies WaveformResult;
        const result: WaveformResult = { peaks: null, status: "error", message: error instanceof Error ? error.message : "Waveform analysis failed." };
        return result;
      }),
    };
    queue = created.promise.catch(() => undefined);
    pending.set(key, created);
    job = created;
  }
  job.subscribers += 1;
  let released = false;
  return {
    promise: job.promise,
    release: () => {
      if (released) return;
      released = true;
      job!.subscribers = Math.max(0, job!.subscribers - 1);
      if (job!.subscribers === 0 && !job!.settled) job!.controller.abort();
    },
  };
}

export function clearWaveformCache(): void {
  for (const job of pending.values()) job.controller.abort();
  pending.clear();
  cache.clear();
}

async function generate(url: string, signal: AbortSignal): Promise<WaveformResult> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return { peaks: null, status: "none", message: "This source has no audio track." };
    if (!await track.canDecode()) return { peaks: null, status: "unsupported", message: "This browser cannot decode the source audio." };
    const [firstTimestamp, duration, sampleRate] = await Promise.all([
      track.getFirstTimestamp(),
      track.computeDuration(),
      track.getSampleRate(),
    ]);
    const boundedDuration = Math.min(MAX_WAVEFORM_SECONDS, Math.max(0.05, duration));
    const bucketCount = Math.min(MAX_BUCKETS, Math.max(256, Math.ceil(boundedDuration * TARGET_BUCKET_RATE)));
    const buckets = new Float32Array(bucketCount);
    let peak = 0;
    const stride = Math.max(1, Math.floor(sampleRate / 2000));
    const sink = new AudioBufferSink(track);
    let chunks = 0;
    for await (const chunk of sink.buffers(firstTimestamp, firstTimestamp + boundedDuration)) {
      if (signal.aborted) throw new DOMException("Waveform analysis cancelled.", "AbortError");
      const buffer = chunk.buffer;
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
      const offsetSeconds = Math.max(0, chunk.timestamp - firstTimestamp);
      for (let index = 0; index < left.length; index += stride) {
        const seconds = offsetSeconds + index / Math.max(1, buffer.sampleRate);
        if (seconds >= boundedDuration) break;
        const value = Math.max(Math.abs(left[index] ?? 0), Math.abs(right[index] ?? 0));
        if (value <= 0) continue;
        if (value > peak) peak = value;
        const bucket = Math.min(bucketCount - 1, Math.floor((seconds / boundedDuration) * bucketCount));
        if (value > buckets[bucket]) buckets[bucket] = value;
      }
      chunks += 1;
      if (chunks % 3 === 0) await yieldToMain();
    }
    if (signal.aborted) throw new DOMException("Waveform analysis cancelled.", "AbortError");
    if (peak <= 0.000001) return { peaks: null, status: "none", message: "The source audio is silent." };
    return {
      peaks: { buckets, duration: boundedDuration, peak },
      status: "ready",
    };
  } finally {
    input.dispose();
  }
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback(() => resolve(), { timeout: 40 });
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}
