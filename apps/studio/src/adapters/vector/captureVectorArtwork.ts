import type {
  ArtboardContext,
  AssetReference,
  ProjectFormat,
  RenderedAssetReference,
  StudioGlobalContext,
  StudioProject,
  ToolSourceStateReference,
} from "@studio/contracts";
import type { IframeToolAdapter } from "../iframe/IframeToolAdapter";
import { createId, nowIso } from "../../lib/ids";
import type { AssetRepository } from "../../storage/assetRepository";
import { sanitizeVectorSvg } from "./svgSanitizer";
import {
  assertRestorableVectorPayload,
  vectorLayerName,
  VECTOR_TOOL_STATE_MIME,
  VECTOR_TOOL_STATE_VERSION,
} from "./vectorSourceState";

export interface CaptureVectorResult {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  suggestedName: string;
  sanitizedSvg: string;
}

export interface CaptureVectorOptions {
  adapter: IframeToolAdapter;
  assets: AssetRepository;
  artboard: ArtboardContext;
  revision: number;
  requestId?: string;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Captures the real Vector source and rendered SVG, validates both, sanitizes
 * executable/external SVG content, persists both blobs and verifies the stored
 * bytes before returning references. The project commit happens only after this
 * function succeeds.
 */
export async function captureVectorArtwork(
  options: CaptureVectorOptions,
): Promise<CaptureVectorResult> {
  if (!Number.isInteger(options.revision) || options.revision < 1) {
    throw new Error("Vector source revision must be a positive integer.");
  }

  const sourcePayload = await options.adapter.getEditableSourceState();
  const sourceDocument = assertRestorableVectorPayload(sourcePayload);
  const sourceRef = await options.assets.putSourceState({
    tool: "vector",
    toolStateVersion: VECTOR_TOOL_STATE_VERSION,
    mimeType: VECTOR_TOOL_STATE_MIME,
    content: sourcePayload.content,
    revision: options.revision,
    label: `${vectorLayerName(sourceDocument)} source`,
  });

  const requestId = options.requestId ?? createId("render");
  const renderResult = await options.adapter.render({
    requestId,
    artboard: options.artboard,
    scale: 1,
    format: "svg",
    background: "transparent",
  });
  if (renderResult.rendered.kind !== "svg" || !renderResult.bytes) {
    throw new Error("Vector returned an invalid SVG render.");
  }
  const rawSvg = decode(
    renderResult.bytes instanceof Uint8Array
      ? renderResult.bytes
      : new Uint8Array(renderResult.bytes),
  );
  const sanitized = sanitizeVectorSvg(rawSvg);
  if (sanitized.svg.length === 0) {
    throw new Error("Vector returned empty artwork.");
  }

  const name = vectorLayerName(sourceDocument);
  const renderedAsset = await options.assets.putAsset({
    bytes: new TextEncoder().encode(sanitized.svg),
    kind: "vector",
    name: `${name}.svg`,
    mimeType: "image/svg+xml",
    sourceTool: "vector",
    width: sanitized.width,
    height: sanitized.height,
  });

  // Verify both payloads are readable and integrity-checked before the project
  // is allowed to reference either one.
  await options.assets.getSourceState(sourceRef);
  const storedAsset = await options.assets.getAsset(renderedAsset.id);
  if (storedAsset.reference.contentHash !== renderedAsset.contentHash) {
    throw new Error("Rendered Vector asset hash changed after writing.");
  }

  return {
    sourceState: sourceRef,
    rendered: {
      kind: "svg",
      mimeType: "image/svg+xml",
      assetId: renderedAsset.id,
      storage: renderedAsset.storage,
      width: sanitized.width,
      height: sanitized.height,
      hasAlpha: true,
      contentHash: renderedAsset.contentHash,
    },
    renderedAsset,
    suggestedName: name,
    sanitizedSvg: sanitized.svg,
  };
}

export function projectGlobalContext(
  project: StudioProject,
  activeArtboardId: string,
): StudioGlobalContext {
  const artboard = project.artboards.find((candidate) => candidate.id === activeArtboardId);
  if (!artboard) throw new Error("The active artboard does not exist.");
  return {
    projectId: project.id,
    projectName: project.name,
    schemaVersion: project.schemaVersion,
    format: structuredClone(project.format),
    artboards: project.artboards.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      index: candidate.index,
      width: candidate.width,
      height: candidate.height,
      background: structuredClone(candidate.background),
    })),
    activeArtboard: {
      id: artboard.id,
      name: artboard.name,
      index: artboard.index,
      width: artboard.width,
      height: artboard.height,
      background: structuredClone(artboard.background),
    },
    colorScheme: "light",
    accentColor: "#236F72",
  };
}

export function formatDimensions(format: ProjectFormat): string {
  return `${format.width} × ${format.height}`;
}

export function sourceRevisionForLayer(
  sourceState: ToolSourceStateReference | null,
): number {
  return (sourceState?.revision ?? 0) + 1;
}

export function publishedAt(): string {
  return nowIso();
}
