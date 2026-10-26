import type {
  AssetReference,
  RenderedAssetReference,
  ToolSourceStateReference,
} from "@studio/contracts";
import type { AssetRepository } from "../../storage/assetRepository";
import type { IframeToolAdapter } from "../iframe/IframeToolAdapter";
import { createId } from "../../lib/ids";
import {
  assertRenderMatchesRequest,
  inspectPng,
  type PngInfo,
} from "./rasterValidation";
import {
  decodeDataUrl,
  IMAGE_TOOL_STATE_MIME,
  IMAGE_TOOL_STATE_VERSION,
  imageLayerName,
  parseTransientImageSourceState,
  storedImageSourceDocument,
  type ImageSourceStateV1,
} from "./imageSourceState";

export interface CaptureImageResult {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  sourceAssets: AssetReference[];
  suggestedName: string;
  tags: string[];
  png: PngInfo;
}

export interface CaptureImageOptions {
  adapter: IframeToolAdapter;
  assets: AssetRepository;
  artboard: { width: number; height: number; id: string };
  revision: number;
  requestId?: string;
}

/**
 * Publishing is transactional: the source photo, native Image document and
 * full-resolution PNG are persisted and read back before the host is allowed to
 * reference them. The layer/project commit happens outside this function.
 */
export async function captureImageArtwork(
  options: CaptureImageOptions,
): Promise<CaptureImageResult> {
  if (!Number.isInteger(options.revision) || options.revision < 1) {
    throw new Error("Image source revision must be a positive integer.");
  }

  const payload = await options.adapter.getEditableSourceState();
  const transient = parseTransientImageSourceState(payload.content);
  const decodedPhoto = decodeDataUrl(transient.photo.dataUrl);
  if (!decodedPhoto.bytes.byteLength) {
    throw new Error("Image returned an empty source-photo payload.");
  }
  const photoAsset = await options.assets.putAsset({
    bytes: decodedPhoto.bytes,
    kind: "source-image",
    name: transient.photo.name || "image-source.png",
    mimeType: transient.photo.mimeType || decodedPhoto.mimeType,
    sourceTool: "image",
    width: transient.photo.width || undefined,
    height: transient.photo.height || undefined,
  });

  const storedDocument: ImageSourceStateV1 = storedImageSourceDocument(transient, {
    assetId: photoAsset.id,
    name: photoAsset.name,
    mimeType: photoAsset.mimeType,
    width: transient.photo.width,
    height: transient.photo.height,
    contentHash: photoAsset.contentHash,
  });

  const suggestedName = imageLayerName(storedDocument);
  const sourceRef = await options.assets.putSourceState({
    tool: "image",
    toolStateVersion: IMAGE_TOOL_STATE_VERSION,
    mimeType: IMAGE_TOOL_STATE_MIME,
    content: JSON.stringify(storedDocument),
    revision: options.revision,
    label: `${suggestedName} source`,
  });

  const requestId = options.requestId ?? createId("render");
  const renderResult = await options.adapter.render({
    requestId,
    artboard: {
      id: options.artboard.id,
      name: "Studio artboard",
      index: 0,
      width: options.artboard.width,
      height: options.artboard.height,
      background: { kind: "transparent" },
    },
    scale: 1,
    format: "png",
    background: "transparent",
  });
  if (renderResult.rendered.kind !== "image" || !renderResult.bytes) {
    throw new Error("Image returned an invalid raster render.");
  }
  const bytes =
    renderResult.bytes instanceof Uint8Array
      ? renderResult.bytes
      : new Uint8Array(renderResult.bytes);
  const info = inspectPng(bytes);
  assertRenderMatchesRequest(info, {
    width: options.artboard.width,
    height: options.artboard.height,
  });

  const renderedAsset = await options.assets.putAsset({
    bytes,
    kind: "rendered-image",
    name: `${suggestedName.replace(/[^\w.-]+/g, "-").toLowerCase()}.png`,
    mimeType: "image/png",
    sourceTool: "image",
    width: info.width,
    height: info.height,
  });

  // Verify every persisted payload before returning references to the host.
  const storedSource = await options.assets.getSourceState(sourceRef);
  if (storedSource.tool !== "image") {
    throw new Error("Stored Image source state changed tool identity.");
  }
  const storedPhoto = await options.assets.getAsset(photoAsset.id);
  if (storedPhoto.reference.contentHash !== photoAsset.contentHash) {
    throw new Error("Stored source-photo hash changed after writing.");
  }
  const storedRender = await options.assets.getAsset(renderedAsset.id);
  if (storedRender.reference.contentHash !== renderedAsset.contentHash) {
    throw new Error("Stored Image render hash changed after writing.");
  }

  return {
    sourceState: sourceRef,
    rendered: {
      kind: "image",
      mimeType: "image/png",
      assetId: renderedAsset.id,
      storage: renderedAsset.storage,
      width: info.width,
      height: info.height,
      hasAlpha: info.hasAlpha,
      contentHash: renderedAsset.contentHash,
    },
    renderedAsset,
    sourceAssets: [photoAsset],
    suggestedName,
    tags: ["image", "phase-2"],
    png: info,
  };
}
