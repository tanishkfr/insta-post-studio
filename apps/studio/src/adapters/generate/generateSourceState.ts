import type { ToolSourceStatePayload } from "@studio/contracts";

export const GENERATE_TOOL_STATE_VERSION = "1.0.0";
export const GENERATE_TOOL_STATE_MIME = "application/vnd.studio.generate+json";

export interface GenerateAsset {
  id: string;
  type?: string;
  role?: string;
  text?: string;
  name?: string;
  src?: string;
  on?: number;
  hostLayerId?: string;
  hostKind?: string;
  aspectHOverW?: number;
  locked?: boolean;
  missing?: boolean;
  opacity?: number;
  [key: string]: unknown;
}

export interface GeneratePlacement {
  id: string;
  x: number;
  y: number;
  w: number;
  r: number;
  z: number;
}

export interface GenerateVariant {
  c: Record<string, unknown>;
  seed: number;
  sl: GeneratePlacement[][];
}

export interface GenerateHostLayer {
  layerId: string;
  name: string;
  kind: string;
  sourceTool: string;
  aspectHOverW: number;
  locked: boolean;
  visible: boolean;
  text?: string;
}

export interface GenerateSourceStateV1 {
  tool: "generate";
  schemaVersion: typeof GENERATE_TOOL_STATE_VERSION;
  savedAt: string;
  mode: "rules" | "claude" | "static";
  format: "post" | "carousel";
  slides: number;
  seed: number;
  selected: number;
  controls: Record<string, unknown>;
  variations: GenerateVariant[];
  assets: GenerateAsset[];
  hostLayers: GenerateHostLayer[];
  missingLayers: string[];
  artboard: { id?: string; width: number; height: number } | null;
  frameHeight: number;
  background: {
    controls: Record<string, unknown>;
    seed: number;
    slide: number;
  } | null;
}

export interface GenerateLayoutTarget {
  hostLayerId: string;
  centerXPercent: number;
  centerYPercent: number;
  widthPercent: number;
  aspectHOverW: number;
  rotationDegrees: number;
  z: number;
}

export class GenerateSourceStateError extends Error {
  readonly code = "GENERATE_SOURCE_STATE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "GenerateSourceStateError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new GenerateSourceStateError(message);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} is not finite.`);
  return value;
}

function readPlacement(value: unknown, label: string): GeneratePlacement {
  if (!isRecord(value) || typeof value.id !== "string") fail(`${label} is malformed.`);
  const w = finite(value.w, `${label}.w`);
  if (w <= 0 || w > 100) fail(`${label}.w is outside the canvas.`);
  return {
    id: value.id,
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
    w,
    r: finite(value.r, `${label}.r`),
    z: finite(value.z, `${label}.z`),
  };
}

export function isGenerateSourcePayload(payload: ToolSourceStatePayload): boolean {
  return (
    payload.tool === "generate" &&
    payload.mimeType === GENERATE_TOOL_STATE_MIME &&
    payload.toolStateVersion === GENERATE_TOOL_STATE_VERSION
  );
}

function asText(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

export function parseGenerateSourceState(
  content: string | Uint8Array,
): GenerateSourceStateV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(asText(content));
  } catch {
    fail("The saved Generate document is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.tool !== "generate") {
    fail("Source state does not belong to Generate.");
  }
  if (parsed.schemaVersion !== GENERATE_TOOL_STATE_VERSION) {
    fail(`Generate source version ${String(parsed.schemaVersion)} is not supported by this host.`);
  }
  if (!isRecord(parsed.controls)) fail("Generate creative controls are missing.");
  if (!Array.isArray(parsed.variations) || parsed.variations.length > 20) {
    fail("Generate variations are malformed.");
  }
  const variations = parsed.variations.map((variance, variantIndex) => {
    if (!isRecord(variance) || !isRecord(variance.c) || !Array.isArray(variance.sl)) {
      fail(`Generate variation ${variantIndex} is malformed.`);
    }
    if (variance.sl.length > 3) fail(`Generate variation ${variantIndex} has too many slides.`);
    return {
      c: structuredClone(variance.c),
      seed: finite(variance.seed, `variations[${variantIndex}].seed`),
      sl: variance.sl.map((slide, slideIndex) => {
        if (!Array.isArray(slide) || slide.length > 50) {
          fail(`Generate slide ${slideIndex} in variation ${variantIndex} is malformed.`);
        }
        return slide.map((placement, placementIndex) =>
          readPlacement(placement, `variations[${variantIndex}].sl[${slideIndex}][${placementIndex}]`),
        );
      }),
    };
  });
  if (!Array.isArray(parsed.assets) || parsed.assets.length > 120) {
    fail("Generate assets are malformed.");
  }
  const assets = parsed.assets.map((asset, index) => {
    if (!isRecord(asset) || typeof asset.id !== "string") {
      fail(`Generate asset ${index} is malformed.`);
    }
    if (asset.hostLayerId !== undefined && typeof asset.hostLayerId !== "string") {
      fail(`Generate asset ${index} has an invalid host layer mapping.`);
    }
    if (asset.aspectHOverW !== undefined) {
      finite(asset.aspectHOverW, `assets[${index}].aspectHOverW`);
    }
    return structuredClone(asset) as GenerateAsset;
  });
  const hostLayers = Array.isArray(parsed.hostLayers)
    ? parsed.hostLayers.map((layer, index) => {
        if (!isRecord(layer) || typeof layer.layerId !== "string") {
          fail(`Generate host layer ${index} is malformed.`);
        }
        return {
          layerId: layer.layerId,
          name: typeof layer.name === "string" ? layer.name : layer.layerId,
          kind: typeof layer.kind === "string" ? layer.kind : "image",
          sourceTool: typeof layer.sourceTool === "string" ? layer.sourceTool : "host",
          aspectHOverW:
            typeof layer.aspectHOverW === "number" && layer.aspectHOverW > 0
              ? layer.aspectHOverW
              : 0.8,
          locked: layer.locked === true,
          visible: layer.visible !== false,
          text: typeof layer.text === "string" ? layer.text : "",
        };
      })
    : [];
  const artboard =
    isRecord(parsed.artboard) &&
    typeof parsed.artboard.width === "number" &&
    typeof parsed.artboard.height === "number" &&
    parsed.artboard.width > 0 &&
    parsed.artboard.height > 0
      ? {
          id: typeof parsed.artboard.id === "string" ? parsed.artboard.id : undefined,
          width: parsed.artboard.width,
          height: parsed.artboard.height,
        }
      : null;
  const selected = Number.isInteger(parsed.selected) ? (parsed.selected as number) : 0;
  if (!Number.isInteger(parsed.seed)) fail("Generate seed is malformed.");
  if (!Number.isInteger(parsed.slides) || (parsed.slides as number) < 1 || (parsed.slides as number) > 3) {
    fail("Generate slide count is malformed.");
  }
  const frameHeight = finite(parsed.frameHeight ?? 125, "frameHeight");
  if (frameHeight < 40 || frameHeight > 400) fail("Generate frame height is outside the supported range.");
  return {
    tool: "generate",
    schemaVersion: GENERATE_TOOL_STATE_VERSION,
    savedAt:
      typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    mode:
      parsed.mode === "static" || parsed.mode === "claude" ? parsed.mode : "rules",
    format: parsed.format === "carousel" ? "carousel" : "post",
    slides: parsed.slides as number,
    seed: parsed.seed as number,
    selected,
    controls: structuredClone(parsed.controls),
    variations,
    assets,
    hostLayers,
    missingLayers: Array.isArray(parsed.missingLayers)
      ? parsed.missingLayers.filter((layerId): layerId is string => typeof layerId === "string")
      : [],
    artboard,
    frameHeight,
    background: isRecord(parsed.background)
      ? {
          controls: isRecord(parsed.background.controls)
            ? structuredClone(parsed.background.controls)
            : {},
          seed: finite(parsed.background.seed ?? 1, "background.seed"),
          slide: finite(parsed.background.slide ?? 0, "background.slide"),
        }
      : null,
  };
}

export function assertRestorableGeneratePayload(
  payload: ToolSourceStatePayload,
): GenerateSourceStateV1 {
  if (!isGenerateSourcePayload(payload)) {
    throw new GenerateSourceStateError(
      `Unsupported Generate source state (${payload.tool} / ${payload.toolStateVersion}).`,
    );
  }
  return parseGenerateSourceState(payload.content);
}

/**
 * Resolves the selected alternative's first slide into stable host-layer
 * targets. Native demo assets, missing layers, locked layers and placements
 * whose width is not finite are excluded. The host applies nothing until the
 * user explicitly chooses Apply layout.
 */
export function selectedGenerateTargets(
  source: GenerateSourceStateV1,
): GenerateLayoutTarget[] {
  const variant = source.variations[source.selected];
  if (!variant) return [];
  const slide = variant.sl[0] ?? [];
  const assets = new Map(source.assets.map((asset) => [asset.id, asset]));
  const targets: GenerateLayoutTarget[] = [];
  for (const placement of slide) {
    const asset = assets.get(placement.id);
    if (!asset?.hostLayerId || asset.missing) continue;
    const aspectHOverW =
      typeof asset.aspectHOverW === "number" && asset.aspectHOverW > 0
        ? asset.aspectHOverW
        : 0.8;
    targets.push({
      hostLayerId: asset.hostLayerId,
      centerXPercent: placement.x,
      centerYPercent: (placement.y / source.frameHeight) * 100,
      widthPercent: placement.w,
      aspectHOverW,
      rotationDegrees: placement.r,
      z: placement.z,
    });
  }
  return targets;
}

export function generateLayerName(source: GenerateSourceStateV1): string {
  const treatment =
    typeof source.background?.controls.background === "string"
      ? source.background.controls.background
      : "Layout";
  return `Generate · ${treatment}`;
}
