import type {
  Artboard,
  AssetReference,
  SharedLayer,
  StudioProject,
  ToolInputAsset,
} from "@studio/contracts";
import { assetRepository } from "../../storage/instances";
import { nowIso } from "../../lib/ids";
import { parseTypographySourceState } from "../typography/typographySourceState";

export const GENERATE_MANIFEST_LAYER_ID = "__studio_generate_manifest__";
const THUMBNAIL_MAX = 512;

export interface GenerateHostManifestLayer {
  id: string;
  name: string;
  kind: SharedLayer["kind"];
  sourceTool: SharedLayer["sourceTool"];
  locked: boolean;
  visible: boolean;
  opacity: number;
  aspectHOverW: number;
  text: string;
  hasThumbnail: boolean;
}

export interface GenerateHostManifest {
  version: "1.0.0";
  projectId: string;
  artboard: {
    id: string;
    name: string;
    index: number;
    width: number;
    height: number;
  };
  layers: GenerateHostManifestLayer[];
}

function syntheticManifestAsset(byteSize: number): AssetReference {
  return {
    id: `generate-manifest-${Date.now()}`,
    kind: "other",
    name: "Generate host manifest",
    mimeType: "application/json",
    storage: {
      backend: "inline",
      mimeType: "application/json",
      dataUrl: "",
    },
    byteSize,
    sourceTool: "host",
    createdAt: nowIso(),
  };
}

async function thumbnailBytes(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  if (mimeType === "image/svg+xml") return bytes;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return bytes;
  let bitmap: ImageBitmap;
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    bitmap = await createImageBitmap(new Blob([copy.buffer], { type: mimeType }));
  } catch {
    return bytes;
  }
  try {
    const scale = Math.min(1, THUMBNAIL_MAX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return bytes;
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return bytes;
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

async function textForLayer(layer: SharedLayer): Promise<string> {
  if (layer.sourceTool !== "typography" || !layer.sourceState) return "";
  try {
    const payload = await assetRepository.getSourceState(layer.sourceState);
    const parsed = parseTypographySourceState(payload.content);
    return parsed.state.text;
  } catch {
    return "";
  }
}

/**
 * Builds the only Generate input payload: visible layers on the selected
 * artboard, their stable IDs and downscaled previews. Hidden layers are
 * excluded by default; locked layers are included for preview and marked so
 * Apply layout can leave them untouched. Assets from other artboards/projects
 * are never transmitted.
 */
export async function loadGenerateInputs(
  project: StudioProject,
  artboard: Artboard,
  excludeLayerId?: string | null,
): Promise<{ manifest: GenerateHostManifest; inputs: ToolInputAsset[] }> {
  const layersById = new Map(project.layers.map((layer) => [layer.id, layer]));
  const ordered = artboard.layerOrder
    .map((layerId) => layersById.get(layerId))
    .filter((layer): layer is SharedLayer => Boolean(layer))
    .filter((layer) => layer.visible)
    .filter((layer) => layer.kind !== "generated-layout")
    .filter((layer) => layer.id !== excludeLayerId);
  const manifestLayers: GenerateHostManifestLayer[] = [];
  const inputs: ToolInputAsset[] = [];
  for (const layer of ordered) {
    const text = await textForLayer(layer);
    let aspectHOverW = layer.transform.height / Math.max(1, layer.transform.width);
    let hasThumbnail = false;
    if (layer.rendered?.assetId) {
      try {
        const stored = await assetRepository.getAsset(layer.rendered.assetId);
        if (
          stored.reference.mimeType === "image/svg+xml" ||
          /^image\/(png|jpeg|webp)$/.test(stored.reference.mimeType)
        ) {
          const thumb = await thumbnailBytes(stored.bytes, stored.reference.mimeType);
          const thumbnailAsset: AssetReference = {
            ...stored.reference,
            id: `generate-thumb-${layer.id}-${stored.reference.id}`,
            name: `${layer.name} thumbnail`,
            byteSize: thumb.byteLength,
            sourceTool: "host",
          };
          inputs.push({
            layerId: layer.id,
            asset: thumbnailAsset,
            role: "reference",
            bytes: thumb,
          });
          if (stored.reference.width && stored.reference.height) {
            aspectHOverW = stored.reference.height / stored.reference.width;
          }
          hasThumbnail = true;
        }
      } catch {
        // Missing rendered artwork is reported to Generate as a placeholder; the
        // host layer still remains available for layout application.
      }
    }
    manifestLayers.push({
      id: layer.id,
      name: layer.name,
      kind: layer.kind,
      sourceTool: layer.sourceTool,
      locked: layer.locked,
      visible: layer.visible,
      opacity: layer.opacity,
      aspectHOverW,
      text,
      hasThumbnail,
    });
  }
  const manifest: GenerateHostManifest = {
    version: "1.0.0",
    projectId: project.id,
    artboard: {
      id: artboard.id,
      name: artboard.name,
      index: artboard.index,
      width: artboard.width,
      height: artboard.height,
    },
    layers: manifestLayers,
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  inputs.unshift({
    layerId: GENERATE_MANIFEST_LAYER_ID,
    asset: syntheticManifestAsset(manifestBytes.byteLength),
    role: "reference",
    bytes: manifestBytes,
  });
  return { manifest, inputs };
}
