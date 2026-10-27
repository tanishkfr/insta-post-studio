import type {
  Artboard,
  BackgroundSpec,
  BlendMode,
  LayerKind,
  SharedLayer,
  StudioProject,
} from "@studio/contracts";
import { inspectPng } from "../adapters/image/rasterValidation";
import { assetRepository } from "../storage/instances";
import { loadRenderedSvg } from "./renderedAssets";

/**
 * Host-side static compositor.
 *
 * This module is deliberately the single owner of composition semantics for
 * static Studio artwork. The BEND handoff and the final PNG/ZIP export both use
 * it so their layer ordering, transforms, masks, opacity and blend behaviour
 * cannot drift apart.
 */

export type CompositionBackgroundPolicy =
  | "artboard"
  | "transparent"
  | "white"
  | "black";

export interface CompositionRenderOptions {
  project: StudioProject;
  artboard: Artboard;
  background: CompositionBackgroundPolicy;
  /**
   * Restrict the render to these layer IDs. Used by the BEND "selected layer"
   * handoff. When omitted, the artboard's authoritative order is used.
   */
  layerIds?: string[];
  /** Draw selected layers even when hidden. Defaults to false. */
  includeHidden?: boolean;
  /**
   * Final exports are strict: a missing rendered asset, poster or mask aborts
   * the render instead of producing a plausible but incomplete image.
   */
  strict?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: CompositionProgress) => void;
}

export interface CompositionProgress {
  stage: "background" | "layers" | "encode";
  completed: number;
  total: number;
  label: string;
}

export interface CompositionWarning {
  code:
    | "MISSING_LAYER"
    | "LAYER_ON_OTHER_ARTBOARD"
    | "MISSING_RENDERED_ASSET"
    | "MISSING_POSTER"
    | "MISSING_MASK"
    | "MISSING_BACKGROUND_ASSET"
    | "DECODE_FAILED"
    | "UNSUPPORTED_BLEND";
  message: string;
  layerId?: string;
  assetId?: string;
}

export interface CompositionLayerReport {
  layerId: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  drawn: boolean;
  usedPoster: boolean;
  masked: boolean;
  blendMode: BlendMode;
}

export interface CompositionRenderResult {
  png: Blob;
  width: number;
  height: number;
  /** Resolved fill, or null when the output is transparent. */
  backgroundHex: string | null;
  hasTransparency: boolean;
  layers: CompositionLayerReport[];
  drawnLayerIds: string[];
  posterLayerIds: string[];
  warnings: CompositionWarning[];
}

export type CompositionErrorCode =
  | "INVALID_ARTBOARD"
  | "MISSING_LAYER"
  | "MISSING_RENDERED_ASSET"
  | "MISSING_POSTER"
  | "MISSING_MASK"
  | "MISSING_BACKGROUND_ASSET"
  | "DECODE_FAILED"
  | "UNSUPPORTED_BLEND"
  | "CANVAS_UNAVAILABLE"
  | "ENCODE_FAILED"
  | "ABORTED";

export class CompositionRenderError extends Error {
  readonly code: CompositionErrorCode;
  readonly layerId?: string;
  readonly assetId?: string;

  constructor(
    code: CompositionErrorCode,
    message: string,
    detail: { layerId?: string; assetId?: string; cause?: unknown } = {},
  ) {
    super(message, detail.cause === undefined ? undefined : { cause: detail.cause });
    this.name = "CompositionRenderError";
    this.code = code;
    this.layerId = detail.layerId;
    this.assetId = detail.assetId;
  }
}

export interface ResolvedBackground {
  kind: "solid" | "transparent" | "asset";
  color?: string;
  assetId?: string;
}

const SUPPORTED_BLEND_MODES = new Set<BlendMode>([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

const MAX_CANVAS_DIMENSION = 8192;
const MAX_CANVAS_AREA = 40_000_000;

export function resolveCompositionBackground(
  artboard: Artboard,
  policy: CompositionBackgroundPolicy,
): ResolvedBackground {
  if (policy === "transparent") return { kind: "transparent" };
  if (policy === "white") return { kind: "solid", color: "#ffffff" };
  if (policy === "black") return { kind: "solid", color: "#000000" };
  return resolveAuthoredBackground(artboard.background);
}

export function resolveAuthoredBackground(background: BackgroundSpec): ResolvedBackground {
  if (background.kind === "transparent") return { kind: "transparent" };
  if (background.kind === "asset" && background.assetId) {
    return { kind: "asset", assetId: background.assetId };
  }
  if (background.kind === "solid") {
    return { kind: "solid", color: background.color ?? "#ffffff" };
  }
  return { kind: "solid", color: "#ffffff" };
}

interface PlannedLayer {
  layer: SharedLayer;
  include: boolean;
  reason?: "hidden" | "audio";
}

export interface CompositionPlan {
  layers: PlannedLayer[];
  warnings: CompositionWarning[];
}

/**
 * Resolves the authoritative bottom-to-top stack. `Artboard.layerOrder` wins.
 * Layers present on the artboard but absent from the order are appended rather
 * than silently dropped; strict renders surface the inconsistency as a warning
 * and non-strict renders still include the artwork.
 */
export function planComposition(
  project: StudioProject,
  artboard: Artboard,
  options: {
    layerIds?: string[];
    includeHidden?: boolean;
    strict?: boolean;
  } = {},
): CompositionPlan {
  const warnings: CompositionWarning[] = [];
  const byId = new Map(project.layers.map((layer) => [layer.id, layer]));
  const requested = options.layerIds ? new Set(options.layerIds) : null;
  const ordered: SharedLayer[] = [];
  const seen = new Set<string>();

  for (const layerId of artboard.layerOrder) {
    const layer = byId.get(layerId);
    if (!layer) {
      if (options.strict) {
        throw new CompositionRenderError(
          "MISSING_LAYER",
          `Artboard “${artboard.name}” references a layer that no longer exists (${layerId}).`,
        );
      }
      warnings.push({
        code: "MISSING_LAYER",
        layerId,
        message: `Skipped a layer reference that no longer exists (${layerId}).`,
      });
      continue;
    }
    if (layer.artboardId !== artboard.id) {
      if (options.strict) {
        throw new CompositionRenderError(
          "MISSING_LAYER",
          `Layer “${layer.name}” belongs to a different artboard and cannot be composed here.`,
          { layerId: layer.id },
        );
      }
      warnings.push({
        code: "LAYER_ON_OTHER_ARTBOARD",
        layerId: layer.id,
        message: `Skipped “${layer.name}” because it belongs to another artboard.`,
      });
      continue;
    }
    if (requested && !requested.has(layer.id)) continue;
    if (seen.has(layer.id)) continue;
    seen.add(layer.id);
    ordered.push(layer);
  }

  if (!requested) {
    const unlisted = project.layers
      .filter((layer) => layer.artboardId === artboard.id && !seen.has(layer.id))
      .sort((left, right) => left.order - right.order);
    for (const layer of unlisted) {
      warnings.push({
        code: "MISSING_LAYER",
        layerId: layer.id,
        message: `Layer “${layer.name}” was missing from the artboard order and was appended in its saved order.`,
      });
      ordered.push(layer);
      seen.add(layer.id);
    }
  }

  const layers = ordered.map<PlannedLayer>((layer) => {
    if (layer.kind === "audio") return { layer, include: false, reason: "audio" };
    if (!layer.visible && !options.includeHidden) {
      return { layer, include: false, reason: "hidden" };
    }
    return { layer, include: true };
  });

  return { layers, warnings };
}

export async function renderCompositionToPng(
  options: CompositionRenderOptions,
): Promise<CompositionRenderResult> {
  const { project, artboard, strict = true } = options;
  validateArtboard(artboard);
  throwIfAborted(options.signal);

  const plan = planComposition(project, artboard, {
    layerIds: options.layerIds,
    includeHidden: options.includeHidden,
    strict,
  });
  const warnings = [...plan.warnings];
  const resolvedBackground = resolveCompositionBackground(artboard, options.background);

  const canvas = document.createElement("canvas");
  canvas.width = artboard.width;
  canvas.height = artboard.height;
  const target = canvas.getContext("2d");
  if (!target) {
    throw new CompositionRenderError(
      "CANVAS_UNAVAILABLE",
      "Studio could not create an artwork canvas.",
    );
  }

  options.onProgress?.({
    stage: "background",
    completed: 0,
    total: plan.layers.length,
    label: "Preparing artboard background",
  });

  target.clearRect(0, 0, canvas.width, canvas.height);
  let backgroundHex: string | null = null;
  if (resolvedBackground.kind === "solid") {
    backgroundHex = resolvedBackground.color ?? "#ffffff";
    target.fillStyle = backgroundHex;
    target.fillRect(0, 0, canvas.width, canvas.height);
  } else if (resolvedBackground.kind === "asset" && resolvedBackground.assetId) {
    try {
      const background = await loadImagePixels(
        resolvedBackground.assetId,
        "image",
        `artboard background “${artboard.name}”`,
      );
      try {
        drawCover(target, background.image, background.width, background.height, canvas.width, canvas.height);
      } finally {
        background.close();
      }
      // An authored image background may itself contain alpha, so the final
      // output is not assumed opaque. The transparency scan below decides.
      backgroundHex = null;
    } catch (error) {
      if (strict) {
        throw asCompositionError(
          error,
          "MISSING_BACKGROUND_ASSET",
          `The artboard background asset is missing or unreadable.`,
          { assetId: resolvedBackground.assetId },
        );
      }
      warnings.push({
        code: "MISSING_BACKGROUND_ASSET",
        assetId: resolvedBackground.assetId,
        message: "The artboard background asset could not be loaded; the export continues without it.",
      });
    }
  }

  const layerReports: CompositionLayerReport[] = [];
  const drawnLayerIds: string[] = [];
  const posterLayerIds: string[] = [];
  let completed = 0;

  for (const planned of plan.layers) {
    throwIfAborted(options.signal);
    const { layer } = planned;
    if (!planned.include) {
      layerReports.push({
        layerId: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        drawn: false,
        usedPoster: false,
        masked: Boolean(layer.mask?.assetId),
        blendMode: layer.blendMode,
      });
      continue;
    }

    const imageReference = selectImageReference(layer);
    if (!imageReference) {
      if (strict) {
        throw new CompositionRenderError(
          "MISSING_RENDERED_ASSET",
          `Layer “${layer.name}” has no rendered artwork. Export was stopped so the image is not incomplete.`,
          { layerId: layer.id },
        );
      }
      warnings.push({
        code: "MISSING_RENDERED_ASSET",
        layerId: layer.id,
        message: `Skipped “${layer.name}” because it has no rendered artwork.`,
      });
      layerReports.push({
        layerId: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        drawn: false,
        usedPoster: false,
        masked: Boolean(layer.mask?.assetId),
        blendMode: layer.blendMode,
      });
      continue;
    }

    if (!SUPPORTED_BLEND_MODES.has(layer.blendMode)) {
      if (strict) {
        throw new CompositionRenderError(
          "UNSUPPORTED_BLEND",
          `Layer “${layer.name}” uses an unsupported blend mode (${String(layer.blendMode)}).`,
          { layerId: layer.id },
        );
      }
      warnings.push({
        code: "UNSUPPORTED_BLEND",
        layerId: layer.id,
        message: `“${layer.name}” uses an unsupported blend mode and was composited normally.`,
      });
    }

    let source;
    try {
      source = await loadImagePixels(
        imageReference.assetId,
        imageReference.kind,
        `layer “${layer.name}”`,
      );
    } catch (error) {
      if (strict) {
        throw asCompositionError(
          error,
          "DECODE_FAILED",
          `Layer “${layer.name}” could not be decoded. Export was stopped so the image is not incomplete.`,
          { layerId: layer.id, assetId: imageReference.assetId },
        );
      }
      warnings.push({
        code: "DECODE_FAILED",
        layerId: layer.id,
        assetId: imageReference.assetId,
        message: `Skipped “${layer.name}” because its artwork could not be decoded.`,
      });
      layerReports.push({
        layerId: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        drawn: false,
        usedPoster: imageReference.usedPoster,
        masked: Boolean(layer.mask?.assetId),
        blendMode: layer.blendMode,
      });
      continue;
    }

    try {
      const masked = Boolean(layer.mask?.assetId);
      let maskPixels: Awaited<ReturnType<typeof loadImagePixels>> | null = null;
      if (masked && layer.mask?.assetId) {
        try {
          maskPixels = await loadImagePixels(
            layer.mask.assetId,
            "image",
            `mask on “${layer.name}”`,
          );
        } catch (error) {
          if (strict) {
            throw asCompositionError(
              error,
              "MISSING_MASK",
              `The mask for “${layer.name}” is missing or unreadable. Export was stopped so the layer is not silently unmasked.`,
              { layerId: layer.id, assetId: layer.mask.assetId },
            );
          }
          warnings.push({
            code: "MISSING_MASK",
            layerId: layer.id,
            assetId: layer.mask.assetId,
            message: `The mask for “${layer.name}” could not be loaded; the layer was composited without it.`,
          });
        }
      }

      drawComposedLayer(target, canvas, layer, source, maskPixels);
      if (maskPixels) maskPixels.close();
      drawnLayerIds.push(layer.id);
      if (imageReference.usedPoster) posterLayerIds.push(layer.id);
      layerReports.push({
        layerId: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        drawn: true,
        usedPoster: imageReference.usedPoster,
        masked,
        blendMode: layer.blendMode,
      });
    } finally {
      source.close();
    }

    completed += 1;
    options.onProgress?.({
      stage: "layers",
      completed,
      total: plan.layers.length,
      label: `Composited ${layer.name}`,
    });
  }

  throwIfAborted(options.signal);
  options.onProgress?.({
    stage: "encode",
    completed: plan.layers.length,
    total: plan.layers.length,
    label: "Encoding PNG",
  });

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new CompositionRenderError(
                "ENCODE_FAILED",
                "The composition PNG could not be encoded.",
              ),
            ),
      "image/png",
    );
  });

  // Validate the real encoded bytes, not just the canvas dimensions.
  const bytes = new Uint8Array(await png.arrayBuffer());
  let info;
  try {
    info = inspectPng(bytes);
  } catch (error) {
    throw new CompositionRenderError(
      "ENCODE_FAILED",
      "The composition PNG failed validation.",
      { cause: error },
    );
  }
  if (info.width !== canvas.width || info.height !== canvas.height) {
    throw new CompositionRenderError(
      "ENCODE_FAILED",
      `The composition PNG was ${info.width}×${info.height}, expected ${canvas.width}×${canvas.height}.`,
    );
  }

  const hasTransparency =
    backgroundHex === null && containsTransparency(target, canvas.width, canvas.height);

  return {
    png,
    width: canvas.width,
    height: canvas.height,
    backgroundHex,
    hasTransparency,
    layers: layerReports,
    drawnLayerIds,
    posterLayerIds,
    warnings,
  };
}

function validateArtboard(artboard: Artboard): void {
  if (
    !Number.isFinite(artboard.width) ||
    !Number.isFinite(artboard.height) ||
    artboard.width <= 0 ||
    artboard.height <= 0
  ) {
    throw new CompositionRenderError(
      "INVALID_ARTBOARD",
      "The artboard dimensions are invalid.",
    );
  }
  if (
    artboard.width > MAX_CANVAS_DIMENSION ||
    artboard.height > MAX_CANVAS_DIMENSION ||
    artboard.width * artboard.height > MAX_CANVAS_AREA
  ) {
    throw new CompositionRenderError(
      "INVALID_ARTBOARD",
      `The artboard is ${artboard.width}×${artboard.height}, which is larger than Studio's safe export canvas.`,
    );
  }
}

function selectImageReference(
  layer: SharedLayer,
): { assetId: string; kind: "image" | "svg" | "video"; usedPoster: boolean } | null {
  if (layer.kind === "video" || layer.temporal?.kind === "video") {
    if (layer.poster?.assetId) {
      return { assetId: layer.poster.assetId, kind: "image", usedPoster: true };
    }
    if (layer.rendered?.kind === "image" && layer.rendered.assetId) {
      return { assetId: layer.rendered.assetId, kind: "image", usedPoster: true };
    }
    if (layer.rendered?.assetId && layer.rendered.kind !== "video") {
      return {
        assetId: layer.rendered.assetId,
        kind: layer.rendered.kind === "svg" ? "svg" : "image",
        usedPoster: false,
      };
    }
    return null;
  }
  if (!layer.rendered?.assetId) return null;
  return {
    assetId: layer.rendered.assetId,
    kind:
      layer.rendered.kind === "svg"
        ? "svg"
        : layer.rendered.kind === "image"
          ? "image"
          : "image",
    usedPoster: false,
  };
}

interface LoadedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function loadImagePixels(
  assetId: string,
  kind: "image" | "svg" | "video",
  label: string,
): Promise<LoadedImage> {
  let asset;
  try {
    asset = await assetRepository.getAsset(assetId);
  } catch (error) {
    throw new CompositionRenderError(
      "MISSING_RENDERED_ASSET",
      `The rendered artwork for ${label} is missing from local storage.`,
      { assetId, cause: error },
    );
  }

  if (kind === "svg" || asset.reference.mimeType.includes("svg")) {
    const svg = await loadRenderedSvg(assetId);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = await decodeHtmlImage(url);
      return {
        image,
        width: image.naturalWidth || image.width || asset.reference.width || 1,
        height: image.naturalHeight || image.height || asset.reference.height || 1,
        close: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw new CompositionRenderError(
        "DECODE_FAILED",
        `The SVG artwork for ${label} could not be rasterized.`,
        { assetId, cause: error },
      );
    }
  }

  const copy = new Uint8Array(asset.bytes.byteLength);
  copy.set(asset.bytes);
  const blob = new Blob([copy.buffer], {
    type: asset.reference.mimeType || "image/png",
  });

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to an HTMLImageElement so browsers that cannot decode a
      // format through createImageBitmap still get one honest attempt.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await decodeHtmlImage(url);
    return {
      image,
      width: image.naturalWidth || image.width || asset.reference.width || 1,
      height: image.naturalHeight || image.height || asset.reference.height || 1,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new CompositionRenderError(
      "DECODE_FAILED",
      `The artwork for ${label} could not be decoded.`,
      { assetId, cause: error },
    );
  }
}

function decodeHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new CompositionRenderError("DECODE_FAILED", "The artwork image could not be decoded."));
    image.src = url;
  });
}

function drawComposedLayer(
  target: CanvasRenderingContext2D,
  artboardCanvas: HTMLCanvasElement,
  layer: SharedLayer,
  source: LoadedImage,
  mask: LoadedImage | null,
): void {
  const transform = layer.transform;
  const displayWidth = Math.max(1, transform.width * Math.abs(transform.scaleX || 1));
  const displayHeight = Math.max(1, transform.height * Math.abs(transform.scaleY || 1));
  if (!Number.isFinite(displayWidth) || !Number.isFinite(displayHeight)) {
    throw new CompositionRenderError(
      "INVALID_ARTBOARD",
      `Layer “${layer.name}” has invalid transform dimensions.`,
      { layerId: layer.id },
    );
  }

  const opacity = Math.min(1, Math.max(0, layer.opacity));
  const blend = compositeMode(layer.blendMode);
  const flipHorizontal = Boolean(transform.flipHorizontal) !== (transform.scaleX < 0);
  const flipVertical = Boolean(transform.flipVertical) !== (transform.scaleY < 0);

  let paintTarget = target;
  let layerCanvas: HTMLCanvasElement | null = null;
  if (mask) {
    layerCanvas = document.createElement("canvas");
    layerCanvas.width = artboardCanvas.width;
    layerCanvas.height = artboardCanvas.height;
    const context = layerCanvas.getContext("2d");
    if (!context) {
      throw new CompositionRenderError(
        "CANVAS_UNAVAILABLE",
        "Studio could not create a masked-layer canvas.",
      );
    }
    paintTarget = context;
  }

  paintTarget.save();
  paintTarget.globalAlpha = mask ? 1 : opacity;
  paintTarget.globalCompositeOperation = mask ? "source-over" : blend;
  paintTarget.translate(
    transform.x + displayWidth * transform.anchorX,
    transform.y + displayHeight * transform.anchorY,
  );
  paintTarget.rotate((transform.rotationDegrees * Math.PI) / 180);
  paintTarget.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  paintTarget.drawImage(
    source.image,
    -displayWidth * transform.anchorX,
    -displayHeight * transform.anchorY,
    displayWidth,
    displayHeight,
  );
  paintTarget.restore();

  if (!layerCanvas) return;

  if (mask) {
    paintTarget.save();
    paintTarget.globalCompositeOperation = layer.mask?.inverted
      ? "destination-out"
      : "destination-in";
    const feather = Math.max(0, layer.mask?.featherPixels ?? 0);
    if (feather > 0 && "filter" in paintTarget) {
      paintTarget.filter = `blur(${feather}px)`;
    }
    // Masks are authored in artboard space. Drawing the mask to the full
    // canvas preserves that contract across different artboard sizes.
    paintTarget.drawImage(mask.image, 0, 0, artboardCanvas.width, artboardCanvas.height);
    paintTarget.restore();
  }

  target.save();
  target.globalAlpha = opacity;
  target.globalCompositeOperation = blend;
  target.drawImage(layerCanvas, 0, 0);
  target.restore();
}

function drawCover(
  target: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
): void {
  if (imageWidth <= 0 || imageHeight <= 0) return;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  target.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function compositeMode(mode: BlendMode): GlobalCompositeOperation {
  return mode === "normal" ? "source-over" : (mode as GlobalCompositeOperation);
}

function containsTransparency(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const data = context.getImageData(0, 0, width, height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CompositionRenderError("ABORTED", "The composition export was cancelled.");
  }
}

function asCompositionError(
  error: unknown,
  code: CompositionErrorCode,
  message: string,
  detail: { layerId?: string; assetId?: string },
): CompositionRenderError {
  if (error instanceof CompositionRenderError) return error;
  return new CompositionRenderError(code, message, { ...detail, cause: error });
}
