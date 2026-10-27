import type { SharedLayer, ToolSourceStatePayload } from "@studio/contracts";

export const TYPOGRAPHY_TOOL_ID = "typography" as const;
export const TYPOGRAPHY_TOOL_STATE_VERSION = "1.0.0";
export const TYPOGRAPHY_TOOL_STATE_MIME = "application/vnd.studio.typography+json";

export type TypographyMode = "library" | "custom";

export interface TypographyFontIdentity {
  name: string;
  kind: "system" | "open";
  file?: string;
  source?: string;
  caps?: boolean;
  family?: string;
}

export interface TypographyFieldState {
  width: number;
  height: number;
  /** Sparse [cellIndex, offsetX, offsetY] values in CSS pixels. */
  values: Array<[number, number, number]>;
}

export interface TypeLibraryState {
  text: string;
  font: TypographyFontIdentity;
  size: number;
  tracking: number;
  weight: number;
  ink: string;
  strength: number;
  brush: number;
  field: TypographyFieldState;
}

export interface CustomTypeImage {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
}

export interface CustomTypeState {
  strokes: Array<{ w: number; pts: Array<[number, number]> }>;
  thickness: number;
  img: CustomTypeImage | null;
  imgRect: { x: number; y: number; w: number; h: number } | null;
  imgBase: { w: number; h: number } | null;
  imgScale: number;
  top: "doodle" | "image";
  ink: string;
  text: string;
  spacing: number;
  motifSize: number;
  letterSize: number;
  tracking: number;
  rotation: number;
  variation: number;
  weight: number;
  serif: number;
  mono: number;
  script: number;
  stretch: number;
  slant: number;
  stage: "draw" | "type";
}

export type TypographySourceStateV1 =
  | {
      tool: typeof TYPOGRAPHY_TOOL_ID;
      schemaVersion: typeof TYPOGRAPHY_TOOL_STATE_VERSION;
      mode: "library";
      savedAt: string;
      state: TypeLibraryState;
    }
  | {
      tool: typeof TYPOGRAPHY_TOOL_ID;
      schemaVersion: typeof TYPOGRAPHY_TOOL_STATE_VERSION;
      mode: "custom";
      savedAt: string;
      state: CustomTypeState;
    };

export class TypographySourceStateError extends Error {
  readonly code = "TYPOGRAPHY_SOURCE_STATE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "TypographySourceStateError";
  }
}

function asText(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

export function isTypographySourcePayload(
  payload: ToolSourceStatePayload,
): boolean {
  return (
    payload.tool === TYPOGRAPHY_TOOL_ID &&
    payload.mimeType === TYPOGRAPHY_TOOL_STATE_MIME &&
    payload.toolStateVersion === TYPOGRAPHY_TOOL_STATE_VERSION
  );
}

function readField(raw: unknown): TypographyFieldState {
  if (!raw || typeof raw !== "object") {
    return { width: 0, height: 0, values: [] };
  }
  const field = raw as Record<string, unknown>;
  const width = Number(field.width);
  const height = Number(field.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
    throw new TypographySourceStateError("Type distortion-field dimensions are malformed.");
  }
  const values: Array<[number, number, number]> = [];
  if (Array.isArray(field.values)) {
    for (const entry of field.values) {
      if (
        Array.isArray(entry) &&
        entry.length === 3 &&
        Number.isInteger(entry[0]) &&
        Number.isFinite(entry[1]) &&
        Number.isFinite(entry[2]) &&
        entry[0] >= 0 &&
        entry[0] < width * height
      ) {
        values.push([entry[0], entry[1], entry[2]]);
      }
    }
  }
  return { width, height, values };
}

function readLibraryState(raw: unknown): TypeLibraryState {
  if (!raw || typeof raw !== "object") {
    throw new TypographySourceStateError("Type Library state is missing.");
  }
  const state = raw as Record<string, unknown>;
  const font = state.font as Record<string, unknown> | undefined;
  if (!font || typeof font.name !== "string" || !font.name) {
    throw new TypographySourceStateError("Type Library font identity is missing.");
  }
  return {
    text: typeof state.text === "string" ? state.text : "Custom type",
    font: {
      name: font.name,
      kind: font.kind === "open" ? "open" : "system",
      file: typeof font.file === "string" ? font.file : undefined,
      source: typeof font.source === "string" ? font.source : undefined,
      caps: font.caps === true,
      family: typeof font.family === "string" ? font.family : undefined,
    },
    size: Number(state.size) || 160,
    tracking: Number(state.tracking) || 0,
    weight: Number(state.weight) || 400,
    ink: typeof state.ink === "string" ? state.ink : "#193438",
    strength: Number(state.strength) || 0,
    brush: Number(state.brush) || 120,
    field: readField(state.field),
  };
}

function readCustomState(raw: unknown): CustomTypeState {
  if (!raw || typeof raw !== "object") {
    throw new TypographySourceStateError("Custom Type state is missing.");
  }
  const state = raw as Record<string, unknown>;
  if (!Array.isArray(state.strokes)) {
    throw new TypographySourceStateError("Custom Type motif strokes are missing.");
  }
  const strokes: CustomTypeState["strokes"] = [];
  for (const stroke of state.strokes) {
    if (!stroke || typeof stroke !== "object") continue;
    const candidate = stroke as Record<string, unknown>;
    if (!Array.isArray(candidate.pts)) continue;
    const pts = candidate.pts
      .filter(
        (point): point is [number, number] =>
          Array.isArray(point) &&
          point.length === 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]),
      )
      .map((point) => [point[0], point[1]] as [number, number]);
    if (pts.length > 0) {
      strokes.push({ w: Number(candidate.w) || 0.01, pts });
    }
  }
  const imgRaw = state.img as Record<string, unknown> | null | undefined;
  const img =
    imgRaw &&
    typeof imgRaw.dataUrl === "string" &&
    imgRaw.dataUrl.startsWith("data:image/")
      ? {
          dataUrl: imgRaw.dataUrl,
          name: typeof imgRaw.name === "string" ? imgRaw.name : "motif.png",
          width: Number(imgRaw.width) || 0,
          height: Number(imgRaw.height) || 0,
        }
      : null;
  const rectRaw = state.imgRect as Record<string, unknown> | null | undefined;
  const imgRect =
    rectRaw &&
    ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(rectRaw[key])))
      ? {
          x: Number(rectRaw.x),
          y: Number(rectRaw.y),
          w: Number(rectRaw.w),
          h: Number(rectRaw.h),
        }
      : null;
  const baseRaw = state.imgBase as Record<string, unknown> | null | undefined;
  const imgBase =
    baseRaw &&
    Number.isFinite(Number(baseRaw.w)) &&
    Number.isFinite(Number(baseRaw.h))
      ? { w: Number(baseRaw.w), h: Number(baseRaw.h) }
      : null;
  return {
    strokes,
    thickness: Number(state.thickness) || 8,
    img,
    imgRect,
    imgBase,
    imgScale: Number(state.imgScale) || 1,
    top: state.top === "image" ? "image" : "doodle",
    ink: typeof state.ink === "string" ? state.ink : "#193438",
    text: typeof state.text === "string" ? state.text : "Bend",
    spacing: Number(state.spacing) || 0.09,
    motifSize: Number(state.motifSize) || 1.1,
    letterSize: Number(state.letterSize) || 180,
    tracking: Number(state.tracking) || 0.02,
    rotation: Number(state.rotation) || 0,
    variation: Number(state.variation) || 0,
    weight: Number(state.weight) || 1,
    serif: Number(state.serif) || 0,
    mono: Number(state.mono) || 0,
    script: Number(state.script) || 0,
    stretch: Number(state.stretch) || 1,
    slant: Number(state.slant) || 0,
    stage: state.stage === "type" ? "type" : "draw",
  };
}

export function parseTypographySourceState(
  content: string | Uint8Array,
): TypographySourceStateV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(asText(content));
  } catch {
    throw new TypographySourceStateError("The saved Type document is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new TypographySourceStateError("The saved Type document is empty.");
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.tool !== TYPOGRAPHY_TOOL_ID) {
    throw new TypographySourceStateError("Source state does not belong to Type.");
  }
  if (candidate.schemaVersion !== TYPOGRAPHY_TOOL_STATE_VERSION) {
    throw new TypographySourceStateError(
      `Type source version ${String(candidate.schemaVersion)} is not supported by this host.`,
    );
  }
  if (candidate.mode === "library") {
    return {
      tool: TYPOGRAPHY_TOOL_ID,
      schemaVersion: TYPOGRAPHY_TOOL_STATE_VERSION,
      mode: "library",
      savedAt:
        typeof candidate.savedAt === "string"
          ? candidate.savedAt
          : new Date(0).toISOString(),
      state: readLibraryState(candidate.state),
    };
  }
  if (candidate.mode === "custom") {
    return {
      tool: TYPOGRAPHY_TOOL_ID,
      schemaVersion: TYPOGRAPHY_TOOL_STATE_VERSION,
      mode: "custom",
      savedAt:
        typeof candidate.savedAt === "string"
          ? candidate.savedAt
          : new Date(0).toISOString(),
      state: readCustomState(candidate.state),
    };
  }
  throw new TypographySourceStateError("Type source state has an unknown mode.");
}

export function assertRestorableTypographyPayload(
  payload: ToolSourceStatePayload,
  expectedMode?: TypographyMode,
): TypographySourceStateV1 {
  if (!isTypographySourcePayload(payload)) {
    throw new TypographySourceStateError(
      `Unsupported Type source state (${payload.tool} / ${payload.toolStateVersion}).`,
    );
  }
  const parsed = parseTypographySourceState(payload.content);
  if (expectedMode && parsed.mode !== expectedMode) {
    throw new TypographySourceStateError(
      `This layer was authored in ${parsed.mode === "library" ? "Type Library" : "Custom Type"}, not ${expectedMode === "library" ? "Type Library" : "Custom Type"}.`,
    );
  }
  return parsed;
}

export function typographyLayerName(state: TypographySourceStateV1): string {
  if (state.mode === "library") {
    const text = state.state.text.replace(/\s+/g, " ").trim().slice(0, 34);
    return `Type · ${state.state.font.name}${text ? ` · ${text}` : ""}`;
  }
  const text = state.state.text.replace(/\s+/g, " ").trim().slice(0, 30);
  return `Custom Type${text ? ` · ${text}` : ""}`;
}

export function typographyModeFromLayer(layer: SharedLayer | null): TypographyMode {
  if (!layer) return "library";
  if (layer.metadata.tags?.includes("type-mode:custom")) return "custom";
  if (layer.metadata.tags?.includes("type-mode:library")) return "library";
  return "library";
}

export function typographyTags(mode: TypographyMode): string[] {
  return ["typography", "phase-2", mode === "custom" ? "type-mode:custom" : "type-mode:library"];
}
