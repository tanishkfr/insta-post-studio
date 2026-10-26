import type { ArtboardId, IsoDateTime, LayerId, SourceToolId } from "./ids";
import type { RenderedAssetReference, ToolSourceStateReference } from "./assets";

export type LayerKind =
  | "image"
  | "vector"
  | "typography"
  | "shapes"
  | "video"
  | "audio"
  | "generated-layout"
  | "group"
  | "composition";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

/** Position and size are in artboard pixel space; anchor is normalised 0–1. */
export interface LayerTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
  anchorX: number;
  anchorY: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export interface LayerMaskReference {
  /** Rendered alpha mask asset. Null means no mask. */
  assetId: string | null;
  inverted: boolean;
  featherPixels: number;
}

export interface TemporalMetadata {
  kind: "static" | "video" | "audio" | "animated";
  durationSeconds?: number;
  timelineStartSeconds?: number;
  sourceInSeconds?: number;
  sourceDurationSeconds?: number;
  frameRate?: number;
  /** Links a layer to an external BEND sequence while its full timeline stays tool-owned. */
  bendSequenceId?: string;
}

export interface LayerMetadata {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Upstream tool version whose output produced this layer. */
  toolVersion?: string;
  tags?: string[];
}

/**
 * Optional cross-tool lineage. A derivative layer keeps its own source state
 * while recording which existing host layer/asset was used as input.
 */
export interface LayerProvenance {
  relation: "derived-from";
  sourceLayerId: LayerId;
  sourceAssetId?: string;
  createdAt: IsoDateTime;
}

/**
 * The host's authoritative layer record. Specialized editable documents remain
 * in the source tool and are addressed through `sourceState`.
 */
export interface SharedLayer {
  id: LayerId;
  name: string;
  kind: LayerKind;
  sourceTool: SourceToolId;
  artboardId: ArtboardId;
  /** Normalised bottom-to-top index; must agree with `Artboard.layerOrder`. */
  order: number;
  sourceState: ToolSourceStateReference | null;
  rendered: RenderedAssetReference | null;
  transform: LayerTransform;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  mask: LayerMaskReference | null;
  clipToArtboard: boolean;
  temporal?: TemporalMetadata;
  provenance?: LayerProvenance;
  metadata: LayerMetadata;
}

export function createIdentityTransform(width: number, height: number): LayerTransform {
  return {
    x: 0,
    y: 0,
    width,
    height,
    scaleX: 1,
    scaleY: 1,
    rotationDegrees: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    flipHorizontal: false,
    flipVertical: false,
  };
}
