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
  assertRestorableGeneratePayload,
  generateLayerName,
  GENERATE_TOOL_STATE_MIME,
  GENERATE_TOOL_STATE_VERSION,
} from "./generateSourceState";
import { inspectPng } from "../shapes/pngValidation";

export interface CaptureGenerateResult {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  suggestedName: string;
}

export interface CaptureGenerateOptions {
  adapter: IframeToolAdapter;
  assets: AssetRepository;
  artboard: ArtboardContext;
  revision: number;
  requestId?: string;
}

/**
 * Publishes the selected Generate treatment (background, accents, texture) as
 * an independent raster layer. The editable Generate source is stored beside
 * it; foreground host layers are never merged into this asset.
 */
export async function captureGenerateArtwork(
  options: CaptureGenerateOptions,
): Promise<CaptureGenerateResult> {
  if (!Number.isInteger(options.revision) || options.revision < 1) {
    throw new Error("Generate source revision must be a positive integer.");
  }
  const sourcePayload = await options.adapter.getEditableSourceState();
  const sourceDocument = assertRestorableGeneratePayload(sourcePayload);

  const renderResult = await options.adapter.render({
    requestId: options.requestId ?? createId("render"),
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
    throw new Error("Generate returned an invalid PNG treatment.");
  }
  const bytes =
    renderResult.bytes instanceof Uint8Array
      ? renderResult.bytes
      : new Uint8Array(renderResult.bytes);
  const header = inspectPng(bytes);
  if (header.width !== options.artboard.width || header.height !== options.artboard.height) {
    throw new Error(
      `Generate returned ${header.width}×${header.height}; the artboard requires ${options.artboard.width}×${options.artboard.height}.`,
    );
  }
  const sourceRef = await options.assets.putSourceState({
    tool: "generate",
    toolStateVersion: GENERATE_TOOL_STATE_VERSION,
    mimeType: GENERATE_TOOL_STATE_MIME,
    content: sourcePayload.content,
    revision: options.revision,
    label: `${generateLayerName(sourceDocument)} source`,
  });
  const name = generateLayerName(sourceDocument);
  const renderedAsset = await options.assets.putAsset({
    bytes,
    kind: "rendered-image",
    name: `${name}.png`,
    mimeType: "image/png",
    sourceTool: "generate",
    width: header.width,
    height: header.height,
  });

  await options.assets.getSourceState(sourceRef);
  const storedAsset = await options.assets.getAsset(renderedAsset.id);
  if (storedAsset.reference.contentHash !== renderedAsset.contentHash) {
    throw new Error("Generated treatment asset hash changed after writing.");
  }

  return {
    sourceState: sourceRef,
    rendered: {
      kind: "image",
      mimeType: "image/png",
      assetId: renderedAsset.id,
      storage: renderedAsset.storage,
      width: header.width,
      height: header.height,
      hasAlpha: header.hasAlpha,
      contentHash: renderedAsset.contentHash,
    },
    renderedAsset,
    suggestedName: name,
  };
}
