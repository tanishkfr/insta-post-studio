import type {
  LayerKind,
  LayerProvenance,
  RenderedAssetReference,
  SharedLayer,
  SourceToolId,
  StudioProject,
  ToolSourceStateReference,
} from "@studio/contracts";
import { createIdentityTransform } from "@studio/contracts";
import { createId, nowIso } from "../../lib/ids";

export interface RasterLayerCapture {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  suggestedName: string;
}

export interface CreateRasterLayerOptions {
  project: StudioProject;
  artboardId: string;
  capture: RasterLayerCapture;
  kind: Extract<LayerKind, "image" | "typography">;
  sourceTool: Extract<SourceToolId, "image" | "typography">;
  toolVersion: string;
  name?: string;
  tags?: string[];
  provenance?: LayerProvenance;
}

/**
 * Creates a new host raster layer. The native artwork is fitted inside the
 * artboard without upscaling; artwork that already matches the artboard fills
 * it exactly. Host transform stays independent from the tool's internal crop.
 */
export function createRasterLayer(options: CreateRasterLayerOptions): SharedLayer {
  const artboard = options.project.artboards.find(
    (candidate) => candidate.id === options.artboardId,
  );
  if (!artboard) throw new Error("Cannot create a layer without an active artboard.");
  const nativeWidth = options.capture.rendered.width ?? artboard.width;
  const nativeHeight = options.capture.rendered.height ?? artboard.height;
  const fitScale = Math.min(
    artboard.width / nativeWidth,
    artboard.height / nativeHeight,
    1,
  );
  const width = Math.max(1, Math.round(nativeWidth * fitScale));
  const height = Math.max(1, Math.round(nativeHeight * fitScale));
  const timestamp = nowIso();

  return {
    id: createId("layer"),
    name: (options.name ?? options.capture.suggestedName).slice(0, 80),
    kind: options.kind,
    sourceTool: options.sourceTool,
    artboardId: artboard.id,
    order: artboard.layerOrder.length,
    sourceState: structuredClone(options.capture.sourceState),
    rendered: structuredClone(options.capture.rendered),
    transform: {
      ...createIdentityTransform(width, height),
      x: Math.round((artboard.width - width) / 2),
      y: Math.round((artboard.height - height) / 2),
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    mask: null,
    clipToArtboard: true,
    provenance: options.provenance,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      toolVersion: options.toolVersion,
      tags: options.tags,
    },
  };
}
