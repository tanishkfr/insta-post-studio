import type { SharedLayer, StudioProject } from "@studio/contracts";
import { createIdentityTransform } from "@studio/contracts";
import { createId, nowIso } from "../../lib/ids";
import type { CaptureVectorResult } from "./captureVectorArtwork";

export interface CreateVectorLayerOptions {
  project: StudioProject;
  artboardId: string;
  capture: CaptureVectorResult;
  name?: string;
}

/**
 * Creates a new host Vector layer, fitting the native artwork inside the active
 * artboard while preserving its aspect ratio. Host x/y/width/height are in
 * artboard pixels.
 */
export function createVectorLayer(options: CreateVectorLayerOptions): SharedLayer {
  const artboard = options.project.artboards.find(
    (candidate) => candidate.id === options.artboardId,
  );
  if (!artboard) throw new Error("Cannot create a layer without an active artboard.");
  const nativeWidth = options.capture.rendered.width ?? artboard.width;
  const nativeHeight = options.capture.rendered.height ?? artboard.height;
  const fitScale = Math.min(
    (artboard.width * 0.78) / nativeWidth,
    (artboard.height * 0.78) / nativeHeight,
    1,
  );
  const width = Math.max(1, Math.round(nativeWidth * fitScale));
  const height = Math.max(1, Math.round(nativeHeight * fitScale));
  const timestamp = nowIso();

  return {
    id: createId("layer"),
    name: (options.name ?? options.capture.suggestedName).slice(0, 80),
    kind: "vector",
    sourceTool: "vector",
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
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      toolVersion: "vector@1.0.0",
      tags: ["vector", "phase-1"],
    },
  };
}

export function updateVectorLayerArtwork(
  layer: SharedLayer,
  capture: CaptureVectorResult,
): SharedLayer {
  if (layer.kind !== "vector" || layer.sourceTool !== "vector") {
    throw new Error("Only Vector layers can be updated by the Vector editor.");
  }
  return {
    ...layer,
    sourceState: structuredClone(capture.sourceState),
    rendered: structuredClone(capture.rendered),
    metadata: {
      ...layer.metadata,
      updatedAt: nowIso(),
      toolVersion: "vector@1.0.0",
    },
  };
}
