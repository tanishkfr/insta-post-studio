export interface PngHeaderInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  hasAlpha: boolean;
  byteLength: number;
}

export interface TransparentPngReport extends PngHeaderInfo {
  visibleSamples: number;
  transparentSamples: number;
}

export class ShapesPngError extends Error {
  readonly code = "SHAPES_PNG_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "ShapesPngError";
  }
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * Minimal structural PNG validation. Shapes renders must be real RGBA PNGs at
 * the exact artboard dimensions, not a canvas data URL with the wrong size.
 */
export function inspectPng(bytes: Uint8Array): PngHeaderInfo {
  if (bytes.byteLength < 45) throw new ShapesPngError("The Shapes render is not a complete PNG.");
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new ShapesPngError("The Shapes render is not a PNG.");
    }
  }
  if (u32(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") {
    throw new ShapesPngError("The Shapes PNG has no valid IHDR header.");
  }
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  const bitDepth = bytes[24] ?? 0;
  const colorType = bytes[25] ?? -1;
  if (width < 1 || height < 1 || width > 8192 || height > 8192) {
    throw new ShapesPngError("The Shapes PNG dimensions are outside the supported range.");
  }
  if (bitDepth !== 8) {
    throw new ShapesPngError("The Shapes PNG must use 8-bit channels.");
  }
  let hasTrns = false;
  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = u32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (offset + 12 + length > bytes.byteLength) {
      throw new ShapesPngError("The Shapes PNG is truncated.");
    }
    if (type === "tRNS") hasTrns = true;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
    offset += 12 + length;
  }
  if (!sawIend) throw new ShapesPngError("The Shapes PNG is missing its IEND chunk.");
  const hasAlpha = colorType === 4 || colorType === 6 || (colorType === 3 && hasTrns);
  if (!hasAlpha) {
    throw new ShapesPngError("The Shapes render has no alpha channel.");
  }
  if (colorType !== 4 && colorType !== 6) {
    throw new ShapesPngError("The Shapes render must use a true alpha PNG (colour type RGBA or grey+alpha).");
  }
  return { width, height, bitDepth, colorType, hasAlpha, byteLength: bytes.byteLength };
}

export async function validateTransparentShapesPng(
  bytes: Uint8Array,
  expected: { width: number; height: number },
): Promise<TransparentPngReport> {
  const header = inspectPng(bytes);
  if (header.width !== expected.width || header.height !== expected.height) {
    throw new ShapesPngError(
      `The Shapes render is ${header.width}×${header.height}; the artboard requires ${expected.width}×${expected.height}.`,
    );
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return { ...header, visibleSamples: 0, transparentSamples: 0 };
  }
  let bitmap: ImageBitmap;
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    bitmap = await createImageBitmap(new Blob([copy.buffer], { type: "image/png" }));
  } catch (error) {
    throw new ShapesPngError(
      `The Shapes PNG could not be decoded: ${error instanceof Error ? error.message : "unknown decoder error"}`,
    );
  }
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ShapesPngError("The transparency validation canvas is unavailable.");
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let visibleSamples = 0;
    let transparentSamples = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if ((pixels[index] ?? 0) > 0) visibleSamples += 1;
      else transparentSamples += 1;
    }
    if (visibleSamples === 0) {
      throw new ShapesPngError("The Shapes render contains no visible object pixels.");
    }
    if (transparentSamples === 0) {
      throw new ShapesPngError("The Shapes render has no transparent regions.");
    }
    return { ...header, visibleSamples, transparentSamples };
  } finally {
    bitmap.close();
  }
}
