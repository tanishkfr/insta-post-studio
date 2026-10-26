export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  hasAlpha: boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export class RasterValidationError extends Error {
  readonly code = "RASTER_VALIDATION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "RasterValidationError";
  }
}

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 33 &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  );
}

export function inspectPng(bytes: Uint8Array): PngInfo {
  if (!isPng(bytes)) throw new RasterValidationError("The rendered image is not a PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (width <= 0 || height <= 0) {
    throw new RasterValidationError("The rendered PNG has invalid dimensions.");
  }
  if (![8, 16].includes(bitDepth)) {
    throw new RasterValidationError("The rendered PNG has an unsupported bit depth.");
  }
  if (![0, 2, 3, 4, 6].includes(colorType)) {
    throw new RasterValidationError("The rendered PNG has an unsupported colour type.");
  }
  let hasAlpha = colorType === 4 || colorType === 6;
  if (!hasAlpha) {
    // A tRNS chunk indicates transparency for palette/grayscale/truecolour PNGs.
    let offset = 8;
    while (offset + 12 <= bytes.byteLength) {
      const length = view.getUint32(offset, false);
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7],
      );
      if (type === "tRNS") {
        hasAlpha = true;
        break;
      }
      if (type === "IEND") break;
      offset += 12 + length;
      if (length > bytes.byteLength) break;
    }
  }
  return { width, height, bitDepth, colorType, hasAlpha };
}

export function imageMimeFromBytes(bytes: Uint8Array): string | null {
  if (isPng(bytes)) return "image/png";
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function assertSupportedRasterInput(
  bytes: Uint8Array,
  declaredMime?: string,
): { mimeType: string } {
  const detected = imageMimeFromBytes(bytes);
  if (!detected) {
    throw new RasterValidationError(
      `Unsupported image input${declaredMime ? ` (${declaredMime})` : ""}. Use PNG, JPEG or WebP; SVG is not a raster input.`,
    );
  }
  if (
    declaredMime &&
    declaredMime !== detected &&
    !(declaredMime === "image/jpg" && detected === "image/jpeg")
  ) {
    throw new RasterValidationError(
      `The asset declares ${declaredMime} but its bytes are ${detected}.`,
    );
  }
  return { mimeType: detected };
}

export function assertRenderMatchesRequest(
  info: PngInfo,
  expected: { width: number; height: number },
): void {
  if (info.width !== expected.width || info.height !== expected.height) {
    throw new RasterValidationError(
      `Rendered image is ${info.width}×${info.height}, expected ${expected.width}×${expected.height}. The host artboard was not silently stretched or cropped.`,
    );
  }
}
