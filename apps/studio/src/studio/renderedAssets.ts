import { sanitizeVectorSvg } from "../adapters/vector/svgSanitizer";
import { assetRepository, objectUrls } from "../storage/instances";

const renderedSvgCache = new Map<string, string>();

export class RenderedAssetLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RenderedAssetLoadError";
  }
}

export async function loadRenderedSvg(assetId: string): Promise<string> {
  const cached = renderedSvgCache.get(assetId);
  if (cached) return cached;
  try {
    const bytes = await assetRepository.getAssetBytes(assetId);
    const raw = new TextDecoder().decode(bytes);
    const sanitized = sanitizeVectorSvg(raw);
    renderedSvgCache.set(assetId, sanitized.svg);
    return sanitized.svg;
  } catch (error) {
    throw new RenderedAssetLoadError(
      error instanceof Error ? error.message : "The rendered SVG could not be loaded.",
      { cause: error },
    );
  }
}

export function primeRenderedSvg(assetId: string, svg: string): void {
  renderedSvgCache.set(assetId, svg);
}

export async function downloadRenderedAsset(
  assetId: string,
  filename: string,
): Promise<void> {
  await downloadStoredAsset(assetId, filename);
}

export async function downloadStoredAsset(
  assetId: string,
  filename: string,
): Promise<void> {
  const asset = await assetRepository.getAsset(assetId);
  const copy = new Uint8Array(asset.bytes.byteLength);
  copy.set(asset.bytes);
  const blob = new Blob([copy.buffer], { type: asset.reference.mimeType });
  const url = objectUrls.acquire(assetId, blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => objectUrls.release(assetId), 1_000);
}

export function clearRenderedSvgCache(): void {
  renderedSvgCache.clear();
}
