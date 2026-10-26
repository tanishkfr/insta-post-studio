import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import type { MediaAssetRecord, MediaAudioInfo } from "../core/types";
import { makeId } from "../core/project";

const VIDEO_EXTENSIONS = ["mp4", "webm", "m4v", "ogv"];
const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "webm"];

export interface MediaInspection {
  audio: MediaAudioInfo;
  frameRate: number | null;
  isVariableFrameRate: boolean;
  videoStartTime: number;
  duration?: number;
}

export function isSupportedVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && VIDEO_EXTENSIONS.includes(extension));
}

export function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && AUDIO_EXTENSIONS.includes(extension));
}

export function createAssetRecord(
  file: File,
  metadata: { width: number; height: number; duration: number },
  mediaType: "video" | "audio" = file.type.startsWith("audio/") ? "audio" : "video",
): MediaAssetRecord {
  return {
    id: makeId("asset"),
    name: file.name,
    mimeType: file.type || (mediaType === "audio" ? "audio/mpeg" : "video/mp4"),
    mediaType,
    size: file.size,
    width: Math.max(1, metadata.width),
    height: Math.max(1, metadata.height),
    duration: Math.max(0.1, metadata.duration),
    storageKey: makeId("blob"),
    audio: { status: "unknown", codec: null, channels: null, sampleRate: null, startTime: 0 },
    frameRate: null,
    isVariableFrameRate: false,
    videoStartTime: 0,
  };
}

export async function inspectMediaFile(file: Blob): Promise<MediaInspection> {
  const fallback: MediaInspection = {
    audio: { status: "unknown", codec: null, channels: null, sampleRate: null, startTime: 0, message: "Track inspection was unavailable in this browser." },
    frameRate: null,
    isVariableFrameRate: false,
    videoStartTime: 0,
  };
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    const videoStartTime = videoTrack ? await videoTrack.getFirstTimestamp() : 0;
    const audioOnlyDuration = !videoTrack && audioTrack ? await audioTrack.computeDuration() : undefined;
    let frameRate: number | null = null;
    let isVariableFrameRate = false;
    if (videoTrack) {
      const metrics = await videoTrack.computeFrameRateMetrics({ targetPacketCount: 256 });
      frameRate = Number.isFinite(metrics.bestGuessFrameRate) ? metrics.bestGuessFrameRate : null;
      isVariableFrameRate = metrics.underlyingFrameRate === null || !metrics.frameRateIsConstant;
    }
    if (!audioTrack) {
      return { audio: { status: "none", codec: null, channels: null, sampleRate: null, startTime: 0 }, frameRate, isVariableFrameRate, videoStartTime };
    }
    const [codec, channels, sampleRate, startTime, canDecode] = await Promise.all([
      audioTrack.getCodec(),
      audioTrack.getNumberOfChannels(),
      audioTrack.getSampleRate(),
      audioTrack.getFirstTimestamp(),
      audioTrack.canDecode(),
    ]);
    return {
      audio: {
        status: canDecode ? "available" : "unsupported",
        codec: codec ? String(codec) : null,
        channels,
        sampleRate,
        startTime,
        ...(canDecode ? {} : { message: "The browser found an audio track but cannot decode it." }),
      },
      frameRate,
      isVariableFrameRate,
      videoStartTime,
      ...(audioOnlyDuration !== undefined ? { duration: audioOnlyDuration } : {}),
    };
  } catch {
    return fallback;
  } finally {
    input.dispose();
  }
}

export function probeAudio(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      audio.load();
      callback();
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      finish(() => resolve({ width: 1, height: 1, duration }));
    };
    audio.onerror = () => finish(() => reject(new Error("BEND could not read this audio. Try a browser-compatible MP3, M4A, WAV, or WebM audio file.")));
    audio.src = url;
    audio.load();
  });
}

export function probeVideo(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      callback();
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      };
      finish(() => resolve(metadata));
    };
    video.onerror = () => finish(() => reject(new Error("BEND could not read this video. Try a browser-compatible MP4 or WebM.")));
    video.src = url;
    video.load();
  });
}

export function createVideoElement(url: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = url;
  video.setAttribute("aria-hidden", "true");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.left = "-10px";
  video.style.top = "-10px";
  document.body.appendChild(video);
  return video;
}

export function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("The local video could not be decoded by this browser.")); };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.load();
  });
}

export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : time));
  if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("BEND could not seek the local video.")); };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    timer = window.setTimeout(() => { cleanup(); resolve(); }, 3000);
    try {
      video.currentTime = target;
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function releaseVideoElement(video: HTMLVideoElement | null): void {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.remove();
}
