import type {
  ArtboardContext,
  AssetReference,
  RenderedAssetReference,
  ToolSourceStateReference,
} from "@studio/contracts";
import type { IframeToolAdapter } from "../iframe/IframeToolAdapter";
import type { AssetRepository } from "../../storage/assetRepository";
import { createId } from "../../lib/ids";
import {
  assertRestorableShapesPayload,
  shapesLayerName,
  SHAPES_TOOL_STATE_MIME,
  SHAPES_TOOL_STATE_VERSION,
} from "./shapesSourceState";
import {
  ShapesPngError,
  validateTransparentShapesPng,
  type TransparentPngReport,
} from "./pngValidation";

export interface CaptureShapesResult {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  suggestedName: string;
  pngReport: TransparentPngReport;
}

export interface CaptureShapesOptions {
  adapter: IframeToolAdapter;
  assets: AssetRepository;
  artboard: ArtboardContext;
  revision: number;
  requestId?: string;
}

/**
 * Captures the complete Shapes source and a real transparent RGBA render.
 * Both are persisted and verified before the host is allowed to commit a layer.
 */
export async function captureShapesArtwork(
  options: CaptureShapesOptions,
): Promise<CaptureShapesResult> {
  if (!Number.isInteger(options.revision) || options.revision < 1) {
    throw new Error("Shapes source revision must be a positive integer.");
  }
  const sourcePayload = await options.adapter.getEditableSourceState();
  const sourceDocument = assertRestorableShapesPayload(sourcePayload);

  const requestId = options.requestId ?? createId("render");
  const renderResult = await options.adapter.render({
    requestId,
    artboard: options.artboard,
    scale: 1,
    format: "png",
    background: "transparent",
  });
  if (
    renderResult.rendered.kind !== "image" ||
    renderResult.rendered.mimeType !== "image/png" ||
    !renderResult.bytes
  ) {
    throw new Error("Shapes returned an invalid PNG render.");
  }
  const bytes =
    renderResult.bytes instanceof Uint8Array
      ? renderResult.bytes
      : new Uint8Array(renderResult.bytes);
  let pngReport: TransparentPngReport;
  try {
    pngReport = await validateTransparentShapesPng(bytes, {
      width: options.artboard.width,
      height: options.artboard.height,
    });
  } catch (error) {
    if (error instanceof ShapesPngError) {
      throw new Error(`Shapes transparent render rejected: ${error.message}`);
    }
    throw error;
  }

  // Persist only after a verified render. A failed capture must not create a
  // new source revision that the layer never references.
  const sourceRef = await options.assets.putSourceState({
    tool: "shapes",
    toolStateVersion: SHAPES_TOOL_STATE_VERSION,
    mimeType: SHAPES_TOOL_STATE_MIME,
    content: sourcePayload.content,
    revision: options.revision,
    label: `${shapesLayerName(sourceDocument)} source`,
  });

  const name = shapesLayerName(sourceDocument);
  const renderedAsset = await options.assets.putAsset({
    bytes,
    kind: "rendered-image",
    name: `${name}.png`,
    mimeType: "image/png",
    sourceTool: "shapes",
    width: pngReport.width,
    height: pngReport.height,
  });

  await options.assets.getSourceState(sourceRef);
  const storedAsset = await options.assets.getAsset(renderedAsset.id);
  if (storedAsset.reference.contentHash !== renderedAsset.contentHash) {
    throw new Error("Rendered Shapes asset hash changed after writing.");
  }

  return {
    sourceState: sourceRef,
    rendered: {
      kind: "image",
      mimeType: "image/png",
      assetId: renderedAsset.id,
      storage: renderedAsset.storage,
      width: pngReport.width,
      height: pngReport.height,
      hasAlpha: true,
      contentHash: renderedAsset.contentHash,
    },
    renderedAsset,
    suggestedName: name,
    pngReport,
  };
}
