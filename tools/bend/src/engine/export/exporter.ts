import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  UrlSource,
  WebMOutputFormat,
} from "mediabunny";
import { createVideoElement, releaseVideoElement, seekVideo, waitForVideoReady } from "../media/media";
import { getProjectDuration } from "../core/project";
import { getRenderableLayers, sourceTimeAt, sourceTimestampAt } from "../core/timeline";
import { sourceTimeForVideoLayer } from "../core/timeMapping";
import { transitionAudioGainAt } from "../transitions/transition";
import { computeDuckingEnvelope, describeDucking } from "../audio/ducking";
import { soundtrackPlaybackEnd, soundtrackSamplePointsAt, soundtrackSourceDuration, soundtrackGainAt } from "../audio/soundtrack";
import type { BendLayer, BendProject, VideoLayer } from "../core/types";
import { PixiBendRenderer } from "../render/pixiRenderer";
import { TemporalEngine } from "../temporal/engine";
import { analyzeSeamlessLoopSupport, exportProjectTime, outputTimeForFrame, resolveExportRange, seamlessLoopProjectTime, type ExportRange, type ResolvedExportRange } from "./range";

export type ExportFormat = "png" | "video";
export type ExportQuality = "preview" | "high";
export type AudioExportStatus = "included" | "not-requested" | "unavailable";

export interface ExportProgress {
  completed: number;
  total: number;
  label: string;
}

export interface ExportValidation {
  width: number;
  height: number;
  duration: number;
  fps: number;
  frameCount: number;
  firstTimestamp: number;
  container: string;
  audioPresent: boolean;
  audioCodec: string | null;
  audioDuration: number | null;
  audioChannels: number | null;
  audioSampleRate: number | null;
  matchesRequest: boolean;
  videoCodec?: string | null;
}

export interface VideoExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  encoder: "mediabunny";
  width: number;
  height: number;
  fps: number;
  duration: number;
  codec?: string | null;
  audioStatus?: AudioExportStatus;
  audioMessage?: string;
  verification?: ExportValidation;
  verified?: boolean;
}

export interface StillExportResult {
  blob: Blob;
  filename: string;
  mimeType: "image/png";
  width: number;
  height: number;
  timestamp: number;
  verified: boolean;
}

interface VideoRenderSource {
  assetId: string;
  url: string;
  video: HTMLVideoElement;
  input: Input | null;
  sink: CanvasSink | null;
}

interface DecodedAudio {
  sampleRate: number;
  channels: Float32Array[];
  origin: number;
  length: number;
}

interface AudioMixResult {
  buffer: AudioBuffer | null;
  sampleCount: number;
  peak: number;
  sources: number;
  messages: string[];
  gainTrim: number;
}

/**
 * Visible video layers are the only ones the renderer can draw. Hidden layers
 * with missing media must not block an otherwise valid export; visible layers
 * still fail with an actionable relink message.
 */
export function getRequiredVideoAssetIds(project: BendProject): string[] {
  return Array.from(new Set(
    project.layers
      .filter((layer): layer is VideoLayer => layer.kind === "video" && layer.visible)
      .map((layer) => layer.assetId),
  ));
}

export async function exportCurrentFrame(renderer: PixiBendRenderer): Promise<Blob> {
  return renderer.toBlob("image/png");
}

export async function exportStillFrame(options: {
  project: BendProject;
  assetUrls: Record<string, string>;
  time: number;
  signal?: AbortSignal;
}): Promise<StillExportResult> {
  throwIfAborted(options.signal);
  const canvas = document.createElement("canvas");
  canvas.width = options.project.canvas.width;
  canvas.height = options.project.canvas.height;
  const renderer = new PixiBendRenderer({ canvas, width: canvas.width, height: canvas.height });
  const temporalEngine = new TemporalEngine();
  const sources: VideoRenderSource[] = [];
  try {
    sources.push(...await prepareVideoSources(options.project, options.assetUrls, options.signal));
    renderer.setVideoElements(Object.fromEntries(sources.map((source) => [source.assetId, source.video])));
    await renderer.init();
    const timestamp = Math.max(0, Math.min(options.time, getProjectDuration(options.project)));
    await renderExportFrame(options.project, timestamp, renderer, temporalEngine, sources, options.signal);
    throwIfAborted(options.signal);
    const blob = await exportCurrentFrame(renderer);
    const dimensions = await decodeImageDimensions(blob);
    const verified = dimensions.width === options.project.canvas.width && dimensions.height === options.project.canvas.height;
    if (!verified) throw new Error(`BEND rejected this still because the PNG is ${dimensions.width}×${dimensions.height} instead of ${options.project.canvas.width}×${options.project.canvas.height}.`);
    return {
      blob,
      filename: `bend-${options.project.id}-frame.png`,
      mimeType: "image/png",
      width: dimensions.width,
      height: dimensions.height,
      timestamp,
      verified,
    };
  } finally {
    for (const source of sources) {
      source.input?.dispose();
      releaseVideoElement(source.video);
    }
    renderer.destroy();
    temporalEngine.dispose();
  }
}

export async function exportVideoComposition(options: {
  project: BendProject;
  assetUrls: Record<string, string>;
  quality: ExportQuality;
  range?: ExportRange | null;
  seamless?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}): Promise<VideoExportResult> {
  throwIfAborted(options.signal);
  const range = resolveExportRange(options.project, options.range);
  if (options.seamless) {
    const support = analyzeSeamlessLoopSupport(options.project, range);
    if (!support.supported) throw new Error(`Seamless repeat is not available for this composition. ${support.reasons.join(" ")}`);
  }
  const dimensions = getExportDimensions(options.project, options.quality);
  const project = {
    ...structuredClone(options.project),
    canvas: { ...options.project.canvas, width: dimensions.width, height: dimensions.height },
  };
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const renderer = new PixiBendRenderer({ canvas, width: dimensions.width, height: dimensions.height });
  const temporalEngine = new TemporalEngine();
  const sources: VideoRenderSource[] = [];
  try {
    sources.push(...await prepareVideoSources(project, options.assetUrls, options.signal));
    throwIfAborted(options.signal);
    renderer.setVideoElements(Object.fromEntries(sources.map((source) => [source.assetId, source.video])));
    const audioMix = options.seamless
      ? null
      : await mixProjectAudio(project, options.assetUrls, range, options.signal);
    const audioPolicyMessage = options.seamless
      ? "Seamless repeat uses mirrored time, so timeline audio is omitted from this export."
      : audioMix?.messages.join(" ") || undefined;
    await renderer.init();
    const common = { project, renderer, temporalEngine, sources, assetUrls: options.assetUrls, quality: options.quality, range, seamless: Boolean(options.seamless), signal: options.signal, onProgress: options.onProgress, audioMix, audioPolicyMessage };
    const mp4 = await tryMediabunnyExport({ ...common, format: new Mp4OutputFormat() });
    if (mp4) return mp4;
    const webm = await tryMediabunnyExport({ ...common, format: new WebMOutputFormat() });
    if (webm) return webm;
    throw new Error("This browser cannot encode BEND video with an interoperable audio track. Use a current Chrome or Edge build for MP4/AAC delivery, or a browser with WebCodecs and WebM support. Safari/WebKit on this platform does not expose a supported local video encoder.");
  } finally {
    for (const source of sources) {
      source.input?.dispose();
      releaseVideoElement(source.video);
    }
    renderer.destroy();
    temporalEngine.dispose();
  }
}

function getExportDimensions(project: BendProject, quality: ExportQuality): { width: number; height: number } {
  if (quality === "high") return { width: project.canvas.width, height: project.canvas.height };
  const width = Math.min(720, project.canvas.width);
  return { width, height: Math.max(1, Math.round(width * project.canvas.height / project.canvas.width)) };
}

async function prepareVideoSources(project: BendProject, assetUrls: Record<string, string>, signal?: AbortSignal): Promise<VideoRenderSource[]> {
  const assetIds = getRequiredVideoAssetIds(project);
  const sources: VideoRenderSource[] = [];
  for (const assetId of assetIds) {
    throwIfAborted(signal);
    const url = assetUrls[assetId];
    if (!url) {
      const layer = project.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.assetId === assetId);
      throw new Error(`The imported footage for ${layer?.name ?? "a video layer"} is missing from local storage. Relink the source, or hide the layer to export the rest of the composition.`);
    }
    const video = createVideoElement(url);
    let input: Input | null = null;
    let sink: CanvasSink | null = null;
    let committed = false;
    try {
      input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (track && await track.canDecode()) sink = new CanvasSink(track, { poolSize: 2, decoderOptions: { optimizeForLatency: false } });
      if (!sink) {
        input.dispose();
        input = null;
      }
    } catch {
      input?.dispose();
      input = null;
      sink = null;
    }
    try {
      if (!sink) await waitForVideoReady(video);
      sources.push({ assetId, url, video, input, sink });
      committed = true;
    } finally {
      if (!committed) {
        input?.dispose();
        releaseVideoElement(video);
      }
    }
  }
  return sources;
}

async function tryMediabunnyExport(options: {
  project: BendProject;
  renderer: PixiBendRenderer;
  temporalEngine: TemporalEngine;
  sources: VideoRenderSource[];
  assetUrls: Record<string, string>;
  quality: ExportQuality;
  range: ResolvedExportRange;
  seamless: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  format: Mp4OutputFormat | WebMOutputFormat;
  audioMix: AudioMixResult | null;
  audioPolicyMessage?: string;
}): Promise<VideoExportResult | null> {
  const { project, renderer, temporalEngine, sources, range, seamless, signal, onProgress, format, audioPolicyMessage } = options;
  const total = range.frameCount;
  const quality = new Quality(options.quality === "high" ? "high" : "medium");
  const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
    width: project.canvas.width,
    height: project.canvas.height,
    frameRate: project.canvas.fps,
    quality,
  });
  if (!codec) return null;
  const audioMix = options.audioMix;
  const audioRequested = Boolean(audioMix?.buffer && audioMix.sampleCount > 0);
  let audioCodec = null;
  if (audioRequested) {
    const supportedAudio = format.getSupportedAudioCodecs();
    // MP4 deliverables target broad social playback: AAC is the interoperable
    // audio codec. Without AAC, fall back to WebM rather than emitting an
    // unusual H.264/Opus MP4.
    const audioCandidates = format instanceof Mp4OutputFormat
      ? supportedAudio.filter((candidate) => candidate === "aac")
      : supportedAudio.filter((candidate) => candidate === "opus" || candidate === "vorbis");
    if (audioCandidates.length === 0) return null;
    audioCodec = await getFirstEncodableAudioCodec(audioCandidates, {
      numberOfChannels: 2,
      sampleRate: audioMix!.buffer!.sampleRate,
      quality,
    });
    if (!audioCodec) return null;
  }

  const target = new BufferTarget();
  const output = new Output({ target, format });
  const source = new CanvasSource(renderer.getSurface(), { codec, quality });
  output.addVideoTrack(source);
  let audioSource: AudioBufferSource | null = null;
  let audioStatus: AudioExportStatus = audioRequested ? "unavailable" : "not-requested";
  let audioMessage = audioPolicyMessage || undefined;
  try {
    if (audioRequested) {
      audioSource = new AudioBufferSource({ codec: audioCodec!, quality }, { startTimestamp: 0 });
      output.addAudioTrack(audioSource, { name: "BEND mixed timeline audio" });
    }
    await output.start();
    if (audioSource && audioMix?.buffer) {
      await audioSource.add(audioMix.buffer);
      audioSource.close();
      audioStatus = "included";
    }
    for (let frame = 0; frame < total; frame += 1) {
      throwIfAborted(signal);
      const outputTime = outputTimeForFrame(frame, project.canvas.fps);
      const time = seamless
        ? seamlessLoopProjectTime(range, outputTime)
        : exportProjectTime(range, frame, project.canvas.fps);
      const frameDuration = Math.max(0.000001, Math.min(1 / project.canvas.fps, range.duration - outputTime));
      await renderExportFrame(project, time, renderer, temporalEngine, sources, signal);
      await source.add(outputTime, frameDuration);
      onProgress?.({ completed: frame + 1, total, label: `Rendering frame ${frame + 1} / ${total}` });
    }
    source.close();
    await output.finalize();
    if (!target.buffer) throw new Error("The browser returned an empty encoded file.");
    if (target.buffer.byteLength < 128) throw new Error("The browser returned an empty encoded file. Try again with a shorter range.");
    const mimeType = await output.getMimeType();
    const blob = new Blob([target.buffer], { type: mimeType });
    const verification = await validateEncodedVideo(blob, project, range, audioStatus === "included");
    if (!verification.matchesRequest) {
      throw new Error(`BEND rejected this export during validation: ${describeValidationMismatch(verification, project, range, audioStatus === "included")}`);
    }
    return {
      blob,
      filename: exportFilename(project, range, format.fileExtension.replace(".", "")),
      mimeType,
      encoder: "mediabunny",
      width: verification.width,
      height: verification.height,
      fps: verification.fps,
      duration: verification.duration,
      codec,
      audioStatus,
      audioMessage,
      verification,
    };
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
}

async function validateEncodedVideo(
  blob: Blob,
  project: BendProject,
  range: ResolvedExportRange,
  audioExpected: boolean,
): Promise<ExportValidation> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("The encoded file has no video track.");
    if (!await videoTrack.canDecode()) throw new Error("The encoded video track cannot be decoded for validation.");
    const [width, height, duration, firstTimestamp, stats, audioTrack] = await Promise.all([
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.computeDuration(),
      videoTrack.getFirstTimestamp(),
      videoTrack.computePacketStats(Infinity),
      input.getPrimaryAudioTrack(),
    ]);
    const [audioCodec, audioDuration, audioChannels, audioSampleRate] = audioTrack
      ? await Promise.all([audioTrack.getCodec(), audioTrack.computeDuration(), audioTrack.getNumberOfChannels(), audioTrack.getSampleRate()])
      : [null, null, null, null];
    const expectedDuration = range.duration;
    const frameTolerance = 2;
    const expectedFrames = range.frameCount;
    const fps = stats.averagePacketRate > 0 ? stats.averagePacketRate : project.canvas.fps;
    const matchesRequest = width === project.canvas.width
      && height === project.canvas.height
      && Math.abs(duration - expectedDuration) <= Math.max(0.12, 2.5 / project.canvas.fps)
      && Math.abs(stats.packetCount - expectedFrames) <= frameTolerance
      && Math.abs(firstTimestamp) <= 0.05
      && (!audioExpected || Boolean(audioTrack))
      && (!audioExpected || (audioDuration !== null && Math.abs(audioDuration - expectedDuration) <= 0.3));
    return {
      width,
      height,
      duration,
      fps,
      frameCount: stats.packetCount,
      firstTimestamp,
      container: await input.getFormat().then((format) => format.name).catch(() => "unknown"),
      audioPresent: Boolean(audioTrack),
      audioCodec: audioCodec ? String(audioCodec) : null,
      audioDuration,
      audioChannels,
      audioSampleRate,
      matchesRequest,
    };
  } finally {
    input.dispose();
  }
}

function describeValidationMismatch(
  validation: ExportValidation,
  project: BendProject,
  range: ResolvedExportRange,
  audioExpected: boolean,
): string {
  const issues: string[] = [];
  if (validation.width !== project.canvas.width || validation.height !== project.canvas.height) issues.push(`expected ${project.canvas.width}×${project.canvas.height}, received ${validation.width}×${validation.height}`);
  if (Math.abs(validation.duration - range.duration) > Math.max(0.12, 2.5 / project.canvas.fps)) issues.push(`expected ${range.duration.toFixed(2)}s, received ${validation.duration.toFixed(2)}s`);
  if (Math.abs(validation.frameCount - range.frameCount) > 2) issues.push(`expected ${range.frameCount} frames, received ${validation.frameCount}`);
  if (Math.abs(validation.firstTimestamp) > 0.05) issues.push(`video starts at ${validation.firstTimestamp.toFixed(3)}s instead of zero`);
  if (audioExpected && !validation.audioPresent) issues.push("the requested audio stream is missing");
  if (audioExpected && validation.audioDuration !== null && Math.abs(validation.audioDuration - range.duration) > 0.3) issues.push(`audio lasts ${validation.audioDuration.toFixed(2)}s instead of ${range.duration.toFixed(2)}s`);
  return issues.join("; ");
}

const MIX_SAMPLE_RATE = 48_000;
const MAX_AUDIO_DECODE_SECONDS = 900;

export async function mixProjectAudio(
  project: BendProject,
  assetUrls: Record<string, string>,
  range: ResolvedExportRange,
  signal?: AbortSignal,
): Promise<AudioMixResult | null> {
  throwIfAborted(signal);
  const messages: string[] = [];
  const clipSources = project.layers.filter((layer): layer is VideoLayer =>
    layer.kind === "video" && layer.visible && !layer.muted && layer.audio.enabled
    && Math.min(layer.timeline.start + layer.timeline.duration, range.end) > Math.max(layer.timeline.start, range.start),
  );
  const soundtrack = project.soundtrack && !project.soundtrack.muted ? project.soundtrack : null;
  if (clipSources.length === 0 && !soundtrack) {
    return {
      buffer: null,
      sampleCount: 0,
      peak: 0,
      sources: 0,
      messages: project.layers.some((layer) => layer.kind === "video") || project.soundtrack
        ? ["All clip audio and the soundtrack are muted; this export has no audio track."]
        : [],
      gainTrim: 1,
    };
  }
  if (clipSources.some((layer) => layer.playback.freeze)) {
    messages.push("Freeze-frame clips are silent for the held portion because BEND does not invent held audio.");
  }
  if (clipSources.some((layer) => layer.playback.reverse)) {
    messages.push("Reverse clips use reversed source audio with the picture.");
  }
  if (clipSources.some((layer) => layer.playback.speed !== 1 || layer.playback.rampEnabled)) {
    messages.push("Speed changes resample clip audio; pitch is not preserved.");
  }
  if (soundtrack && !assetUrls[soundtrack.assetId]) {
    throw new Error("The selected soundtrack is missing from local storage. Relink or remove it before exporting audio.");
  }
  const musicPlaybackEnd = soundtrackPlaybackEnd(project);
  const musicSourceDuration = soundtrack ? soundtrackSourceDuration(soundtrack) : 0;
  const musicPlaybackDuration = soundtrack ? Math.max(0, musicPlaybackEnd - soundtrack.timelineStart) : 0;
  const musicLoopCount = soundtrack?.loop ? Math.max(0, Math.ceil(musicPlaybackDuration / musicSourceDuration)) : soundtrack && musicPlaybackDuration > 0 ? 1 : 0;

  const decodePlans = new Map<string, { assetId: string; start: number; end: number }>();
  for (const layer of clipSources) {
    const plan = decodePlans.get(layer.assetId) ?? { assetId: layer.assetId, start: Number.POSITIVE_INFINITY, end: 0 };
    plan.start = Math.min(plan.start, layer.trimStart);
    plan.end = Math.max(plan.end, layer.trimEnd);
    decodePlans.set(layer.assetId, plan);
  }
  if (soundtrack) {
    const plan = decodePlans.get(soundtrack.assetId) ?? { assetId: soundtrack.assetId, start: Number.POSITIVE_INFINITY, end: 0 };
    plan.start = Math.min(plan.start, soundtrack.sourceIn);
    plan.end = Math.max(plan.end, soundtrack.sourceOut);
    decodePlans.set(soundtrack.assetId, plan);
  }

  const decoded = new Map<string, DecodedAudio>();
  for (const plan of decodePlans.values()) {
    throwIfAborted(signal);
    const url = assetUrls[plan.assetId];
    if (!url) {
      const asset = project.assets[plan.assetId];
      messages.push(`${asset?.name ?? "A source"} is missing from local storage, so its audio was not mixed.`);
      continue;
    }
    try {
      const source = await decodeAudioSource(url, plan.start, plan.end, signal);
      if (source) decoded.set(plan.assetId, source);
      else messages.push(`${project.assets[plan.assetId]?.name ?? "A source"} has no decodable audio track.`);
    } catch (error) {
      if (isAbortError(error)) throw error;
      messages.push(`${project.assets[plan.assetId]?.name ?? "A source"} audio could not be decoded (${error instanceof Error ? error.message : "unknown error"}).`);
    }
  }

  const length = Math.max(1, Math.ceil(range.duration * MIX_SAMPLE_RATE));
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  let sourceContributions = 0;
  let peak = 0;

  for (const layer of clipSources) {
    throwIfAborted(signal);
    if (layer.playback.freeze) continue;
    const source = decoded.get(layer.assetId);
    if (!source) continue;
    const asset = project.assets[layer.assetId];
    const audioStart = asset?.audio?.startTime ?? 0;
    const first = Math.max(layer.timeline.start, range.start);
    const last = Math.min(layer.timeline.start + layer.timeline.duration, range.end);
    if (last <= first) continue;
    const firstSample = Math.max(0, Math.ceil((first - range.start) * MIX_SAMPLE_RATE));
    const lastSample = Math.min(length, Math.ceil((last - range.start) * MIX_SAMPLE_RATE));
    const fadeIn = Math.min(layer.audio.fadeIn, layer.timeline.duration);
    const fadeOut = Math.min(layer.audio.fadeOut, layer.timeline.duration);
    let contributed = false;
    for (let index = firstSample; index < lastSample; index += 1) {
      const projectTime = range.start + index / MIX_SAMPLE_RATE;
      const local = projectTime - layer.timeline.start;
      const sourceTime = sourceTimeForVideoLayer(layer, local);
      const gain = dbToLinear(layer.audio.gainDb)
        * fadeEnvelope(local, layer.timeline.duration, fadeIn, fadeOut)
        * transitionAudioGainAt(project, layer, projectTime);
      if (gain <= 0.000001) continue;
      const sampled = sampleDecodedAudio(source, audioStart + sourceTime, gain);
      if (!sampled) continue;
      left[index] += sampled[0];
      right[index] += sampled[1];
      contributed = true;
    }
    if (contributed) sourceContributions += 1;
  }

  let duckingSummary: ReturnType<typeof computeDuckingEnvelope> | null = null;
  if (soundtrack?.ducking.enabled) {
    throwIfAborted(signal);
    duckingSummary = computeDuckingEnvelope(left, right, MIX_SAMPLE_RATE, soundtrack.ducking, signal);
    messages.push(describeDucking(duckingSummary));
  }

  if (soundtrack) {
    throwIfAborted(signal);
    const source = decoded.get(soundtrack.assetId);
    let soundtrackContributed = false;
    if (source) {
      const start = Math.max(soundtrack.timelineStart, range.start);
      const end = Math.min(musicPlaybackEnd, range.end);
      const firstSample = Math.max(0, Math.ceil((start - range.start) * MIX_SAMPLE_RATE));
      const lastSample = Math.min(length, Math.ceil((end - range.start) * MIX_SAMPLE_RATE));
      const asset = project.assets[soundtrack.assetId];
      const audioStart = asset?.audio?.startTime ?? 0;
      let lastIteration = -1;
      for (let index = firstSample; index < lastSample; index += 1) {
        throwIfAborted(signal);
        const projectTime = range.start + index / MIX_SAMPLE_RATE;
        const points = soundtrackSamplePointsAt(soundtrack, projectTime, musicPlaybackEnd);
        if (points.length === 0) continue;
        const duckGain = duckingSummary?.gain[index] ?? 1;
        const gain = soundtrackGainAt(soundtrack, projectTime, musicPlaybackEnd, duckGain);
        if (gain <= 0.000001) continue;
        let contributed = false;
        for (const point of points) {
          const sampled = sampleDecodedAudio(source, audioStart + point.sourceTime, gain * point.gain);
          if (!sampled) continue;
          left[index] += sampled[0];
          right[index] += sampled[1];
          contributed = true;
          lastIteration = Math.max(lastIteration, point.iteration);
        }
        if (contributed) soundtrackContributed = true;
      }
      if (soundtrack.loop && musicLoopCount > 1) {
        const crossfade = Math.min(soundtrack.loopCrossfade, musicSourceDuration * 0.5);
        messages.push(`Soundtrack loops ${musicLoopCount} times across ${musicPlaybackDuration.toFixed(2)}s${crossfade > 0.001 ? ` with a ${crossfade.toFixed(2)}s equal-power boundary crossfade` : ""}; the last repetition uses only the remaining timeline.`);
      }
      if (soundtrack.loop && musicLoopCount <= 1) {
        messages.push("Soundtrack loop is enabled, but the soundtrack already covers the whole composition.");
      }
      if (soundtrack.loop && lastIteration < 0) {
        messages.push("Soundtrack loop produced no samples inside the selected export range.");
      }
    }
    if (!soundtrackContributed && soundtrack.ducking.enabled && clipSources.length === 0) {
      messages.push("Ducking is enabled but there is no audible clip audio, so the soundtrack plays at its own level.");
    }
    if (soundtrackContributed) sourceContributions += 1;
  }

  if (duckingSummary && sourceContributions === 0) {
    messages.push("No audible source was available for ducking analysis.");
  }

  for (let index = 0; index < length; index += 1) {
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
  }
  const gainTrim = peak > 0.98 ? 0.98 / peak : 1;
  if (gainTrim < 1) messages.push("A transparent master trim prevented clipping; relative clip balance is unchanged.");
  if (gainTrim !== 1) {
    for (let index = 0; index < length; index += 1) {
      left[index] *= gainTrim;
      right[index] *= gainTrim;
    }
    peak *= gainTrim;
  }
  if (sourceContributions === 0) {
    messages.push("The audible timeline contains no decodable samples in this range.");
    return { buffer: null, sampleCount: 0, peak: 0, sources: 0, messages: Array.from(new Set(messages)), gainTrim };
  }
  if (peak < 0.000001) messages.push("The mixed audio track is silent; check clip levels, fades, and trims.");
  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: MIX_SAMPLE_RATE });
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return {
    buffer,
    sampleCount: length,
    peak,
    sources: sourceContributions,
    messages: Array.from(new Set(messages)),
    gainTrim,
  };
}

async function decodeAudioSource(url: string, sourceStart: number, sourceEnd: number, signal?: AbortSignal): Promise<DecodedAudio | null> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !await track.canDecode()) return null;
    if (!(sourceEnd > sourceStart)) return null;
    if (sourceEnd - sourceStart > MAX_AUDIO_DECODE_SECONDS) {
      throw new Error("The requested audio range is too long for a single local export. Split the export into shorter ranges.");
    }
    const firstTimestamp = await track.getFirstTimestamp();
    const sampleRate = await track.getSampleRate();
    const rangeStart = firstTimestamp + Math.max(0, sourceStart);
    const rangeEnd = firstTimestamp + Math.max(0, sourceEnd);
    const origin = Math.floor(rangeStart * sampleRate) / sampleRate;
    const length = Math.max(2, Math.ceil((rangeEnd - origin) * sampleRate) + 2);
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    const sink = new AudioBufferSink(track);
    for await (const chunk of sink.buffers(rangeStart, rangeEnd)) {
      throwIfAborted(signal);
      const buffer = chunk.buffer;
      const offset = Math.round((chunk.timestamp - origin) * sampleRate);
      if (!Number.isFinite(offset)) continue;
      const sourceLeft = buffer.getChannelData(0);
      const sourceRight = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : sourceLeft;
      const count = Math.min(buffer.length, length - offset);
      for (let index = 0; index < count; index += 1) {
        const target = offset + index;
        if (target < 0 || target >= length) continue;
        left[target] = sourceLeft[Math.max(0, Math.min(sourceLeft.length - 1, index))];
        right[target] = sourceRight[Math.max(0, Math.min(sourceRight.length - 1, index))];
      }
    }
    return { sampleRate, channels: [left, right], origin, length };
  } finally {
    input.dispose();
  }
}

function sampleDecodedAudio(source: DecodedAudio, timestamp: number, gain: number): [number, number] | null {
  const position = (timestamp - source.origin) * source.sampleRate;
  if (!Number.isFinite(position) || position < 0 || position >= source.length - 1) return null;
  const index = Math.floor(position);
  const fraction = position - index;
  const left = source.channels[0];
  const right = source.channels[1] ?? source.channels[0];
  if (!left || !right || index + 1 >= left.length) return null;
  return [
    (left[index] * (1 - fraction) + left[index + 1] * fraction) * gain,
    (right[index] * (1 - fraction) + right[index + 1] * fraction) * gain,
  ];
}

function fadeEnvelope(localTime: number, duration: number, fadeIn: number, fadeOut: number): number {
  let gain = 1;
  if (fadeIn > 0.0001) gain *= Math.min(1, Math.max(0, localTime / fadeIn));
  if (fadeOut > 0.0001) gain *= Math.min(1, Math.max(0, (duration - localTime) / fadeOut));
  return Math.min(1, Math.max(0, gain));
}

function dbToLinear(db: number): number {
  return Math.pow(10, Math.min(12, Math.max(-60, db)) / 20);
}

/** True when a video layer contains frames inside an export range. */
export function layerOverlapsRange(layer: VideoLayer, range: Pick<ResolvedExportRange, "start" | "end">): boolean {
  return Math.min(layer.timeline.start + layer.timeline.duration, range.end) > Math.max(layer.timeline.start, range.start);
}

export function audioOutputTimestamp(layer: VideoLayer, sourceStart: number, sampleTimestamp: number, startFrame: number, sampleRate: number, exportStart = 0): number {
  const sourceTrimStart = sourceStart + layer.trimStart;
  return Math.max(0, layer.timeline.start + Math.max(0, sampleTimestamp + startFrame / sampleRate - sourceTrimStart) - exportStart);
}

async function renderExportFrame(project: BendProject, time: number, renderer: PixiBendRenderer, temporalEngine: TemporalEngine, sources: VideoRenderSource[], signal?: AbortSignal): Promise<void> {
  const sourceByAsset = new Map(sources.map((source) => [source.assetId, source]));
  for (const layer of getRenderableLayers(project, time)) {
    if (layer.kind !== "video") continue;
    const source = sourceByAsset.get(layer.assetId);
    if (!source) continue;
    const asset = project.assets[layer.assetId];
    const timestamp = sourceTimestampAt(layer, time, asset?.videoStartTime ?? 0);
    if (source.sink) {
      const frame = await source.sink.getCanvas(timestamp);
      throwIfAborted(signal);
      if (!frame) throw new Error(`BEND could not decode a frame from ${layer.name} at ${time.toFixed(3)}s.`);
      renderer.setVideoFrames({ [layer.id]: frame.canvas });
    } else {
      await seekVideo(source.video, timestamp);
      throwIfAborted(signal);
      renderer.setVideoFrames({ [layer.id]: copyVideoFrame(source.video) });
    }
  }
  const temporalFrames = await temporalEngine.prepareFrame({
    project,
    time,
    signal,
    sampleVideo: async (layer, sampleTime) => {
      if (layer.kind !== "video") throw new Error("Temporal export sampling received a non-video layer.");
      const source = sourceByAsset.get(layer.assetId);
      if (!source) throw new Error("The local video source is unavailable for temporal export.");
      if (source.sink) {
        const asset = project.assets[layer.assetId];
        const frame = await source.sink.getCanvas(sourceTimestampAt(layer, sampleTime, asset?.videoStartTime ?? 0));
        if (!frame) throw new Error(`BEND could not decode a temporal frame from ${layer.name} at ${sampleTime.toFixed(3)}s.`);
        return copyCanvasSource(frame.canvas);
      }
      await seekVideo(source.video, sourceTimeAt(layer, sampleTime));
      return copyVideoFrame(source.video);
    },
  });
  throwIfAborted(signal);
  renderer.setTemporalFrames(temporalFrames);
  renderer.render(project, time);
}

function copyVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, video.videoWidth);
  canvas.height = Math.max(1, video.videoHeight);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("BEND could not create a frame sample canvas.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function copyCanvasSource(source: HTMLCanvasElement | OffscreenCanvas): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, source.width);
  canvas.height = Math.max(1, source.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("BEND could not create a temporal decoder canvas.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("BEND export cancelled.", "AbortError");
}

export function getExportFrameCount(duration: number, fps: number): number {
  return Math.max(1, Math.ceil(Math.max(0, duration) * Math.max(1, fps) - 1e-9));
}

async function decodeImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("BEND could not validate the still image."));
    };
    image.src = url;
  });
}

function exportFilename(project: BendProject, range: ResolvedExportRange, extension: string): string {
  if (range.full) return `bend-${project.id}.${extension}`;
  return `bend-${project.id}-${range.start.toFixed(2)}-${range.end.toFixed(2)}.${extension}`;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
