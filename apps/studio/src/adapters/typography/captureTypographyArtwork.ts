import type {
  AssetReference,
  RenderedAssetReference,
  ToolSourceStateReference,
} from "@studio/contracts";
import type { AssetRepository } from "../../storage/assetRepository";
import type { IframeToolAdapter } from "../iframe/IframeToolAdapter";
import { createId } from "../../lib/ids";
import { inspectPng, type PngInfo } from "../image/rasterValidation";
import {
  parseTypographySourceState,
  TYPOGRAPHY_TOOL_STATE_MIME,
  TYPOGRAPHY_TOOL_STATE_VERSION,
  typographyLayerName,
  typographyTags,
  type TypographyMode,
  type TypographySourceStateV1,
} from "./typographySourceState";

export interface CaptureTypographyResult {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  suggestedName: string;
  tags: string[];
  mode: TypographyMode;
  png: PngInfo;
}

export interface CaptureTypographyOptions {
  adapter: IframeToolAdapter;
  assets: AssetRepository;
  revision: number;
  artboard: { width: number; height: number; id: string };
  expectedMode?: TypographyMode;
  requestId?: string;
}

export async function captureTypographyArtwork(
  options: CaptureTypographyOptions,
): Promise<CaptureTypographyResult> {
  if (!Number.isInteger(options.revision) || options.revision < 1) {
    throw new Error("Type source revision must be a positive integer.");
  }
  const payload = await options.adapter.getEditableSourceState();
  const document = parseTypographySourceState(payload.content);
  if (options.expectedMode && document.mode !== options.expectedMode) {
    throw new Error(
      `The Type editor returned ${document.mode} state while ${options.expectedMode} was active.`,
    );
  }
  const suggestedName = typographyLayerName(document);
  const sourceRef = await options.assets.putSourceState({
    tool: "typography",
    toolStateVersion: TYPOGRAPHY_TOOL_STATE_VERSION,
    mimeType: TYPOGRAPHY_TOOL_STATE_MIME,
    content: JSON.stringify(document),
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
    throw new Error("Type returned an invalid raster render.");
  }
  const bytes =
    renderResult.bytes instanceof Uint8Array
      ? renderResult.bytes
      : new Uint8Array(renderResult.bytes);
  const info = inspectPng(bytes);
  if (!info.width || !info.height) {
    throw new Error("Type returned an empty rendered canvas.");
  }
  const renderedAsset = await options.assets.putAsset({
    bytes,
    kind: "rendered-image",
    name: `${suggestedName.replace(/[^\w.-]+/g, "-").toLowerCase()}.png`,
    mimeType: "image/png",
    sourceTool: "typography",
    width: info.width,
    height: info.height,
  });

  const storedSource = await options.assets.getSourceState(sourceRef);
  const storedDocument: TypographySourceStateV1 = parseTypographySourceState(
    storedSource.content,
  );
  if (storedDocument.mode !== document.mode) {
    throw new Error("Stored Type mode changed after writing.");
  }
  const storedRender = await options.assets.getAsset(renderedAsset.id);
  if (storedRender.reference.contentHash !== renderedAsset.contentHash) {
    throw new Error("Stored Type render hash changed after writing.");
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
    suggestedName,
    tags: typographyTags(document.mode),
    mode: document.mode,
    png: info,
  };
}
