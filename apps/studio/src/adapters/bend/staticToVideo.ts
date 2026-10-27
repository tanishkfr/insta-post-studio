import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from "mediabunny";
import type { Artboard, StudioProject } from "@studio/contracts";
import { sha256Hex } from "../../lib/hash";
import { createId } from "../../lib/ids";
import {
  renderCompositionToPng,
  type CompositionBackgroundPolicy,
} from "../../studio/compositionRenderer";

export type StaticHandoffBackground = "artboard" | "white" | "black";
export type StaticHandoffScope = "layer" | "composition";

export interface StaticMotionHandoff {
  id: string;
  scope: StaticHandoffScope;
  sourceLayerIds: string[];
  sourceRevisions: Record<string, number>;
  background: StaticHandoffBackground;
  backgroundHex: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  video: Blob;
  mimeType: string;
  container: "mp4" | "webm";
  codec: string;
  byteLength: number;
  contentHash: string;
  hasAlpha: false;
  createdAt: string;
}

export interface RenderStaticArtworkOptions {
  project: StudioProject;
  artboard: Artboard;
  scope: StaticHandoffScope;
  selectedLayerId?: string | null;
  background: StaticHandoffBackground;
}

export interface RenderedStaticArtwork {
  png: Blob;
  width: number;
  height: number;
  backgroundHex: string;
  sourceLayerIds: string[];
  sourceRevisions: Record<string, number>;
  hasTransparency: boolean;
}

export class StaticArtworkRenderError extends Error {
  readonly code = "STATIC_ARTWORK_RENDER_ERROR" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StaticArtworkRenderError";
  }
}

export async function renderStaticArtworkToPng(
  options: RenderStaticArtworkOptions,
): Promise<RenderedStaticArtwork> {
  const { project, artboard, scope, selectedLayerId } = options;
  let layerIds: string[] | undefined;
  if (scope === "layer") {
    const selected = project.layers.find(
      (layer) => layer.id === selectedLayerId && layer.artboardId === artboard.id,
    );
    if (!selected) {
      throw new StaticArtworkRenderError("Select a static Studio layer to animate in BEND.");
    }
    if (selected.kind === "video") {
      throw new StaticArtworkRenderError(
        "That layer is already temporal. Select a static Image, Vector, Type, Shapes or Generate layer, or animate the whole composition.",
      );
    }
    layerIds = [selected.id];
  } else {
    const visible = project.layers.filter(
      (layer) => layer.artboardId === artboard.id && layer.visible && layer.kind !== "audio",
    );
    if (visible.length === 0) {
      throw new StaticArtworkRenderError("The active composition has no visible layers to animate.");
    }
  }

  const background = resolveHandoffBackground(options);
  const rendered = await renderCompositionToPng({
    project,
    artboard,
    background,
    layerIds,
    includeHidden: scope === "layer",
    strict: false,
  });

  return {
    png: rendered.png,
    width: rendered.width,
    height: rendered.height,
    backgroundHex: rendered.backgroundHex ?? "#ffffff",
    sourceLayerIds: rendered.drawnLayerIds,
    sourceRevisions: Object.fromEntries(
      rendered.drawnLayerIds.map((layerId) => [
        layerId,
        project.layers.find((layer) => layer.id === layerId)?.sourceState?.revision ?? 0,
      ]),
    ),
    hasTransparency: rendered.hasTransparency,
  };
}

export async function encodeStaticArtworkVideo(
  rendered: RenderedStaticArtwork,
  options: { durationSeconds: number; fps: number; signal?: AbortSignal; onProgress?: (value: number) => void },
): Promise<{ blob: Blob; mimeType: string; container: "mp4" | "webm"; codec: string; frameCount: number }> {
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds < 0.5 || options.durationSeconds > 10) {
    throw new StaticArtworkRenderError("The handoff clip duration must be between 0.5 and 10 seconds.");
  }
  if (!Number.isFinite(options.fps) || options.fps < 12 || options.fps > 60) {
    throw new StaticArtworkRenderError("The handoff frame rate must be between 12 and 60 FPS.");
  }
  const bitmap = await createImageBitmap(rendered.png);
  const canvas = document.createElement("canvas");
  canvas.width = rendered.width;
  canvas.height = rendered.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new StaticArtworkRenderError("Studio could not create the handoff video canvas.");
  }
  context.fillStyle = rendered.backgroundHex === "transparent" ? "#ffffff" : rendered.backgroundHex;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const frameCount = Math.max(1, Math.ceil(options.durationSeconds * options.fps));
  const frameDuration = 1 / options.fps;
  const quality = new Quality("medium");
  const mp4 = await tryEncode(new Mp4OutputFormat(), "mp4");
  if (mp4) return mp4;
  throwIfAborted(options.signal);
  const webm = await tryEncode(new WebMOutputFormat(), "webm");
  if (webm) return webm;
  throw new StaticArtworkRenderError(
    "This browser cannot encode the static-artwork handoff locally. Use a current Chromium or Edge build with WebCodecs, or keep the static layer instead.",
  );

  async function tryEncode(
    format: Mp4OutputFormat | WebMOutputFormat,
    container: "mp4" | "webm",
  ): Promise<{ blob: Blob; mimeType: string; container: "mp4" | "webm"; codec: string; frameCount: number } | null> {
    const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
      width: canvas.width,
      height: canvas.height,
      frameRate: options.fps,
      quality,
    });
    if (!codec) return null;
    const target = new BufferTarget();
    const output = new Output({ target, format });
    const source = new CanvasSource(canvas, { codec, quality });
    output.addVideoTrack(source);
    try {
      await output.start();
      for (let frame = 0; frame < frameCount; frame += 1) {
        throwIfAborted(options.signal);
        await source.add(frame * frameDuration, frameDuration);
        options.onProgress?.((frame + 1) / frameCount);
      }
      source.close();
      await output.finalize();
      if (!target.buffer || target.buffer.byteLength < 128) {
        throw new StaticArtworkRenderError("The browser returned an empty handoff video.");
      }
      const mimeType = await output.getMimeType();
      const blob = new Blob([target.buffer], { type: mimeType });
      await verifyHandoffVideo(blob, canvas.width, canvas.height, options.durationSeconds, frameCount);
      return { blob, mimeType, container, codec, frameCount };
    } catch (error) {
      await output.cancel().catch(() => undefined);
      if (isAbortError(error)) throw error;
      return null;
    }
  }
}

export async function createStaticMotionHandoff(options: {
  project: StudioProject;
  artboard: Artboard;
  scope: StaticHandoffScope;
  selectedLayerId?: string | null;
  background: StaticHandoffBackground;
  durationSeconds: number;
  fps: number;
  signal?: AbortSignal;
  onStage?: (stage: string, progress: number) => void;
}): Promise<StaticMotionHandoff> {
  options.onStage?.("Rendering static artwork", 0.05);
  const rendered = await renderStaticArtworkToPng({
    project: options.project,
    artboard: options.artboard,
    scope: options.scope,
    selectedLayerId: options.selectedLayerId,
    background: options.background,
  });
  throwIfAborted(options.signal);
  options.onStage?.("Encoding handoff clip", 0.2);
  const video = await encodeStaticArtworkVideo(rendered, {
    durationSeconds: options.durationSeconds,
    fps: options.fps,
    signal: options.signal,
    onProgress: (value) => options.onStage?.("Encoding handoff clip", 0.2 + value * 0.7),
  });
  throwIfAborted(options.signal);
  const bytes = new Uint8Array(await video.blob.arrayBuffer());
  const contentHash = await sha256Hex(bytes);
  options.onStage?.("Handoff ready", 1);
  return {
    id: createId("bend_handoff"),
    scope: options.scope,
    sourceLayerIds: rendered.sourceLayerIds,
    sourceRevisions: rendered.sourceRevisions,
    background: options.background,
    backgroundHex: rendered.backgroundHex,
    width: rendered.width,
    height: rendered.height,
    durationSeconds: options.durationSeconds,
    fps: options.fps,
    video: video.blob,
    mimeType: video.mimeType,
    container: video.container,
    codec: video.codec,
    byteLength: video.blob.size,
    contentHash,
    hasAlpha: false,
    createdAt: new Date().toISOString(),
  };
}

function resolveHandoffBackground(
  options: RenderStaticArtworkOptions,
): CompositionBackgroundPolicy {
  if (options.background === "white") return "white";
  if (options.background === "black") return "black";
  const artboard = options.artboard;
  if (artboard.background.kind === "solid" && artboard.background.color) {
    return "artboard";
  }
  // A transparent artboard would otherwise become black in the video codec.
  // The handoff dialog defaults to this explicit white treatment.
  return "white";
}

async function verifyHandoffVideo(
  blob: Blob,
  expectedWidth: number,
  expectedHeight: number,
  expectedDuration: number,
  expectedFrames: number,
): Promise<void> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new StaticArtworkRenderError("The handoff video has no video track.");
    if (!(await track.canDecode())) {
      throw new StaticArtworkRenderError("The handoff video track cannot be decoded by this browser.");
    }
    const [width, height, duration, stats] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.computeDuration(),
      track.computePacketStats(Infinity),
    ]);
    if (width !== expectedWidth || height !== expectedHeight) {
      throw new StaticArtworkRenderError(
        `The handoff video was encoded at ${width}×${height}, not ${expectedWidth}×${expectedHeight}.`,
      );
    }
    if (Math.abs(duration - expectedDuration) > 0.25) {
      throw new StaticArtworkRenderError(
        `The handoff video lasts ${duration.toFixed(2)}s, not ${expectedDuration.toFixed(2)}s.`,
      );
    }
    if (Math.abs(stats.packetCount - expectedFrames) > 2) {
      throw new StaticArtworkRenderError("The handoff video has an unexpected frame count.");
    }
  } finally {
    input.dispose();
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Static-to-motion handoff cancelled.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
