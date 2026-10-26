import type { StudioProject, ToolInputAsset } from "@studio/contracts";
import { assetRepository } from "../../storage/instances";
import { assertSupportedRasterInput } from "../image/rasterValidation";

export class ToolInputUnavailableError extends Error {
  readonly code = "TOOL_INPUT_UNAVAILABLE" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ToolInputUnavailableError";
  }
}

/**
 * Resolves a selected host layer's rendered raster into adapter input bytes.
 * The host validates the actual magic bytes, not only the declared MIME type.
 */
export async function loadRasterInputForLayer(
  project: StudioProject,
  layerId: string,
  role: ToolInputAsset["role"],
): Promise<ToolInputAsset> {
  const layer = project.layers.find((candidate) => candidate.id === layerId);
  if (!layer) {
    throw new ToolInputUnavailableError("The selected input layer no longer exists.");
  }
  if (!layer.rendered?.assetId) {
    throw new ToolInputUnavailableError(
      `“${layer.name}” has no rendered asset to use as input.`,
    );
  }
  let stored;
  try {
    stored = await assetRepository.getAsset(layer.rendered.assetId);
  } catch (error) {
    throw new ToolInputUnavailableError(
      `The rendered asset for “${layer.name}” is missing from local storage.`,
      { cause: error },
    );
  }
  assertSupportedRasterInput(stored.bytes, stored.reference.mimeType);
  return {
    layerId: layer.id,
    asset: stored.reference,
    role,
    bytes: stored.bytes,
  };
}

export function inputLayerName(
  project: StudioProject,
  layerId: string | null | undefined,
): string | null {
  if (!layerId) return null;
  return project.layers.find((layer) => layer.id === layerId)?.name ?? null;
}
