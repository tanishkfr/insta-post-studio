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
import type { Artboard, SharedLayer, StudioProject } from "@studio/contracts";
import { assetRepository } from "../../storage/instances";
import { loadRenderedSvg } from "../../studio/renderedAssets";
import { sha256Hex } from "../../lib/hash";
import { createId } from "../../lib/ids";

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
  const ordered = project.layers
    .filter((layer) => layer.artboardId === artboard.id)
    .sort((left, right) => left.order - right.order);
  let layers: SharedLayer[];
  if (scope === "layer") {
    const selected = ordered.find((layer) => layer.id === selectedLayerId);
    if (!selected) {
      throw new StaticArtworkRenderError("Select a static Studio layer to animate in BEND.");
    }
    if (selected.kind === "video") {
      throw new StaticArtworkRenderError(
        "That layer is already temporal. Select a static Image, Vector, Type, Shapes or Generate layer, or animate the whole composition.",
      );
    }
    layers = [selected];
  } else {
    layers = ordered.filter((layer) => layer.visible);
    if (layers.length === 0) {
      throw new StaticArtworkRenderError("The active composition has no visible layers to animate.");
    }
  }

  const backgroundHex = resolveBackground(options);
  const canvas = document.createElement("canvas");
  canvas.width = artboard.width;
  canvas.height = artboard.height;
  const context = canvas.getContext("2d");
  if (!context) throw new StaticArtworkRenderError("Studio could not create an artwork canvas.");

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundHex !== "transparent") {
    context.fillStyle = backgroundHex;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (const layer of layers) {
    if (!layer.visible || !layer.rendered?.assetId) continue;
    const source = await loadLayerPixels(layer);
    if (!source) continue;
    try {
      await drawLayer(context, layer, source, artboard);
    } finally {
      source.close();
    }
  }

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new StaticArtworkRenderError("The static artwork PNG could not be encoded."))),
      "image/png",
    );
  });
  const hasTransparency = backgroundHex === "transparent" && containsTransparency(canvas);

  return {
    png,
    width: canvas.width,
    height: canvas.height,
    backgroundHex,
    sourceLayerIds: layers.map((layer) => layer.id),
    sourceRevisions: Object.fromEntries(
      layers.map((layer) => [layer.id, layer.sourceState?.revision ?? 0]),
    ),
    hasTransparency,
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

function resolveBackground(options: RenderStaticArtworkOptions): string {
  if (options.background === "white") return "#ffffff";
  if (options.background === "black") return "#000000";
  const artboard = options.artboard;
  if (artboard.background.kind === "solid" && artboard.background.color) {
    return artboard.background.color;
  }
  // A transparent artboard would otherwise become black in the video codec.
  // The handoff dialog defaults to this explicit white treatment.
  return "#ffffff";
}

async function loadLayerPixels(layer: SharedLayer): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
} | null> {
  const rendered = layer.poster?.assetId ? layer.poster : layer.rendered;
  if (!rendered?.assetId) return null;
  const asset = await assetRepository.getAsset(rendered.assetId);
  const bytes = new Uint8Array(asset.bytes.byteLength);
  bytes.set(asset.bytes);
  if (rendered.kind === "svg") {
    const svg = await loadRenderedSvg(rendered.assetId);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const image = await decodeImage(url);
      return {
        image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        close: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw new StaticArtworkRenderError("A Vector asset could not be rasterized for the BEND handoff.", { cause: error });
    }
  }
  const blob = new Blob([bytes.buffer], { type: asset.reference.mimeType || "image/png" });
  const bitmap = await createImageBitmap(blob).catch(async () => {
    const url = URL.createObjectURL(blob);
    try {
      return await decodeImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  if (bitmap instanceof HTMLImageElement) {
    return {
      image: bitmap,
      width: bitmap.naturalWidth || bitmap.width,
      height: bitmap.naturalHeight || bitmap.height,
      close: () => undefined,
    };
  }
  return {
    image: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new StaticArtworkRenderError("The static artwork image could not be decoded."));
    image.src = url;
  });
}

async function drawLayer(
  target: CanvasRenderingContext2D,
  layer: SharedLayer,
  source: { image: CanvasImageSource; width: number; height: number },
  artboard: Artboard,
): Promise<void> {
  const displayWidth = Math.max(1, layer.transform.width * Math.abs(layer.transform.scaleX || 1));
  const displayHeight = Math.max(1, layer.transform.height * Math.abs(layer.transform.scaleY || 1));
  const mask = layer.mask;
  let paintTarget = target;
  let layerCanvas: HTMLCanvasElement | null = null;
  if (mask?.assetId) {
    layerCanvas = document.createElement("canvas");
    layerCanvas.width = artboard.width;
    layerCanvas.height = artboard.height;
    const context = layerCanvas.getContext("2d");
    if (context) paintTarget = context;
  }
  paintTarget.save();
  paintTarget.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
  paintTarget.globalCompositeOperation = compositeMode(layer.blendMode);
  paintTarget.translate(
    layer.transform.x + displayWidth * layer.transform.anchorX,
    layer.transform.y + displayHeight * layer.transform.anchorY,
  );
  paintTarget.rotate((layer.transform.rotationDegrees * Math.PI) / 180);
  paintTarget.scale(
    layer.transform.flipHorizontal ? -1 : 1,
    layer.transform.flipVertical ? -1 : 1,
  );
  paintTarget.drawImage(
    source.image,
    -displayWidth * layer.transform.anchorX,
    -displayHeight * layer.transform.anchorY,
    displayWidth,
    displayHeight,
  );
  paintTarget.restore();

  if (layerCanvas && paintTarget !== target && mask) {
    const maskPixels = await loadMaskPixels(mask.assetId!);
    if (maskPixels) {
      paintTarget.save();
      paintTarget.globalCompositeOperation = mask.inverted ? "destination-out" : "destination-in";
      paintTarget.drawImage(maskPixels.image, 0, 0, artboard.width, artboard.height);
      paintTarget.restore();
      maskPixels.close();
    }
    target.save();
    target.globalAlpha = 1;
    target.globalCompositeOperation = compositeMode(layer.blendMode);
    target.drawImage(layerCanvas, 0, 0);
    target.restore();
  }
}

async function loadMaskPixels(
  assetId: string,
): Promise<{ image: CanvasImageSource; close: () => void } | null> {
  try {
    const asset = await assetRepository.getAsset(assetId);
    const bytes = new Uint8Array(asset.bytes.byteLength);
    bytes.set(asset.bytes);
    const blob = new Blob([bytes.buffer], { type: asset.reference.mimeType || "image/png" });
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, close: () => bitmap.close() };
  } catch {
    // A missing optional mask must not silently erase the layer; report through
    // pixel output instead of blocking the handoff.
    return null;
  }
}

function compositeMode(mode: SharedLayer["blendMode"]): GlobalCompositeOperation {
  return mode === "normal" ? "source-over" : (mode as GlobalCompositeOperation);
}

function containsTransparency(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(4, Math.floor(data.length / 4 / 4096) * 4);
  for (let index = 3; index < data.length; index += step) {
    if (data[index] < 250) return true;
  }
  return false;
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
