import type { ToolSourceStatePayload } from "@studio/contracts";

export const IMAGE_TOOL_ID = "image" as const;
export const IMAGE_TOOL_STATE_VERSION = "1.0.0";
export const IMAGE_TOOL_STATE_MIME = "application/vnd.studio.image+json";

export interface ImagePhotoReference {
  assetId: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  contentHash?: string;
}

export interface ImagePhotoTransient {
  dataUrl: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface ImageMaskState {
  width: number;
  height: number;
  dataUrl: string;
}

export interface ImageViewState {
  format: "4:5" | "1:1" | "9:16";
  tab: string;
  selectedLayer: string;
  openSections: string[];
  advancedSections: string[];
}

/**
 * Host-persisted Image document. The original source photo is deliberately not
 * embedded here; `photo.assetId` points to a separate source-image asset.
 * `settings` is the editor's complete native `S` object (effect stack, masks,
 * brush strokes, internal layers and crop framing).
 */
export interface ImageSourceStateV1 {
  tool: typeof IMAGE_TOOL_ID;
  schemaVersion: typeof IMAGE_TOOL_STATE_VERSION;
  savedAt: string;
  photo: ImagePhotoReference;
  settings: Record<string, unknown>;
  history: unknown[];
  historyIndex: number;
  mask: ImageMaskState | null;
  view: ImageViewState;
}

export interface ImageTransientSourceStateV1
  extends Omit<ImageSourceStateV1, "photo"> {
  photo: ImagePhotoTransient;
}

export class ImageSourceStateError extends Error {
  readonly code = "IMAGE_SOURCE_STATE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "ImageSourceStateError";
  }
}

function asText(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

export function isImageSourcePayload(payload: ToolSourceStatePayload): boolean {
  return (
    payload.tool === IMAGE_TOOL_ID &&
    payload.mimeType === IMAGE_TOOL_STATE_MIME &&
    payload.toolStateVersion === IMAGE_TOOL_STATE_VERSION
  );
}

function parseCommon(content: string | Uint8Array): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(asText(content));
  } catch {
    throw new ImageSourceStateError("The saved Image document is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ImageSourceStateError("The saved Image document is empty.");
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.tool !== IMAGE_TOOL_ID) {
    throw new ImageSourceStateError("Source state does not belong to Image.");
  }
  if (candidate.schemaVersion !== IMAGE_TOOL_STATE_VERSION) {
    throw new ImageSourceStateError(
      `Image source version ${String(candidate.schemaVersion)} is not supported by this host.`,
    );
  }
  if (!candidate.settings || typeof candidate.settings !== "object") {
    throw new ImageSourceStateError("Image source state is missing editor settings.");
  }
  if (!Array.isArray(candidate.history)) {
    throw new ImageSourceStateError("Image undo history is malformed.");
  }
  if (
    typeof candidate.historyIndex !== "number" ||
    !Number.isInteger(candidate.historyIndex) ||
    candidate.historyIndex < -1
  ) {
    throw new ImageSourceStateError("Image history index is malformed.");
  }
  return candidate;
}

function readView(raw: unknown): ImageViewState {
  const view = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const format =
    view.format === "1:1" || view.format === "9:16" ? view.format : "4:5";
  return {
    format,
    tab: typeof view.tab === "string" ? view.tab : "effects",
    selectedLayer: typeof view.selectedLayer === "string" ? view.selectedLayer : "styled",
    openSections: Array.isArray(view.openSections)
      ? view.openSections.filter((value): value is string => typeof value === "string")
      : [],
    advancedSections: Array.isArray(view.advancedSections)
      ? view.advancedSections.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function readMask(raw: unknown): ImageMaskState | null {
  if (!raw || typeof raw !== "object") return null;
  const mask = raw as Record<string, unknown>;
  if (
    typeof mask.dataUrl !== "string" ||
    typeof mask.width !== "number" ||
    typeof mask.height !== "number" ||
    mask.width <= 0 ||
    mask.height <= 0
  ) {
    throw new ImageSourceStateError("Image painted-mask data is malformed.");
  }
  return {
    width: mask.width,
    height: mask.height,
    dataUrl: mask.dataUrl,
  };
}

export function parseImageSourceState(
  content: string | Uint8Array,
): ImageSourceStateV1 {
  const candidate = parseCommon(content);
  const photo = candidate.photo as Record<string, unknown> | undefined;
  if (!photo || typeof photo.assetId !== "string" || !photo.assetId) {
    throw new ImageSourceStateError("Image source state is missing its source-photo asset.");
  }
  return {
    tool: IMAGE_TOOL_ID,
    schemaVersion: IMAGE_TOOL_STATE_VERSION,
    savedAt:
      typeof candidate.savedAt === "string"
        ? candidate.savedAt
        : new Date(0).toISOString(),
    photo: {
      assetId: photo.assetId,
      name: typeof photo.name === "string" ? photo.name : "Source photo",
      mimeType: typeof photo.mimeType === "string" ? photo.mimeType : "image/png",
      width: typeof photo.width === "number" ? photo.width : 0,
      height: typeof photo.height === "number" ? photo.height : 0,
      contentHash: typeof photo.contentHash === "string" ? photo.contentHash : undefined,
    },
    settings: structuredClone(candidate.settings as Record<string, unknown>),
    history: structuredClone(candidate.history as unknown[]),
    historyIndex: candidate.historyIndex as number,
    mask: readMask(candidate.mask),
    view: readView(candidate.view),
  };
}

export function parseTransientImageSourceState(
  content: string | Uint8Array,
): ImageTransientSourceStateV1 {
  const candidate = parseCommon(content);
  const photo = candidate.photo as Record<string, unknown> | undefined;
  if (
    !photo ||
    typeof photo.dataUrl !== "string" ||
    !photo.dataUrl.startsWith("data:image/")
  ) {
    throw new ImageSourceStateError(
      "Image publish payload did not include the original source-photo bytes.",
    );
  }
  return {
    tool: IMAGE_TOOL_ID,
    schemaVersion: IMAGE_TOOL_STATE_VERSION,
    savedAt:
      typeof candidate.savedAt === "string"
        ? candidate.savedAt
        : new Date(0).toISOString(),
    photo: {
      dataUrl: photo.dataUrl,
      name: typeof photo.name === "string" ? photo.name : "Source photo",
      mimeType:
        typeof photo.mimeType === "string" ? photo.mimeType : "image/png",
      width: typeof photo.width === "number" ? photo.width : 0,
      height: typeof photo.height === "number" ? photo.height : 0,
    },
    settings: structuredClone(candidate.settings as Record<string, unknown>),
    history: structuredClone(candidate.history as unknown[]),
    historyIndex: candidate.historyIndex as number,
    mask: readMask(candidate.mask),
    view: readView(candidate.view),
  };
}

export function assertRestorableImagePayload(
  payload: ToolSourceStatePayload,
): ImageSourceStateV1 {
  if (!isImageSourcePayload(payload)) {
    throw new ImageSourceStateError(
      `Unsupported Image source state (${payload.tool} / ${payload.toolStateVersion}).`,
    );
  }
  return parseImageSourceState(payload.content);
}

export function storedImageSourceDocument(
  transient: ImageTransientSourceStateV1,
  photo: ImagePhotoReference,
): ImageSourceStateV1 {
  return {
    tool: IMAGE_TOOL_ID,
    schemaVersion: IMAGE_TOOL_STATE_VERSION,
    savedAt: new Date().toISOString(),
    photo,
    settings: transient.settings,
    history: transient.history,
    historyIndex: transient.historyIndex,
    mask: transient.mask,
    view: transient.view,
  };
}

export function imageLayerName(state: ImageSourceStateV1 | ImageTransientSourceStateV1): string {
  const settings = state.settings as {
    medium?: { on?: number; type?: string };
    trace?: { on?: number; type?: string };
    color?: { mode?: string };
  };
  const effect = settings.medium?.on
    ? settings.medium.type
    : settings.trace?.on
      ? settings.trace.type
      : settings.color?.mode && settings.color.mode !== "Color"
        ? settings.color.mode
        : "Photo";
  return `Image · ${effect ?? "Photo"}`;
}

export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new ImageSourceStateError("Source photo data URL is malformed.");
  const mimeType = match[1];
  if (!match[2]) {
    return { bytes: new TextEncoder().encode(decodeURIComponent(match[3])), mimeType };
  }
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}
