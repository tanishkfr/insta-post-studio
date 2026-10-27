import { describe, expect, it } from "vitest";
import {
  assertRenderMatchesRequest,
  assertSupportedRasterInput,
  imageMimeFromBytes,
  inspectPng,
  isPng,
  RasterValidationError,
} from "./rasterValidation";

function pngHeader(options: {
  width: number;
  height: number;
  colorType?: number;
  bitDepth?: number;
}): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, options.width);
  view.setUint32(20, options.height);
  bytes[24] = options.bitDepth ?? 8;
  bytes[25] = options.colorType ?? 6;
  return bytes;
}

describe("raster validation", () => {
  it("reads intrinsic PNG dimensions and alpha information", () => {
    const rgba = inspectPng(pngHeader({ width: 1080, height: 1350, colorType: 6 }));
    expect(rgba).toMatchObject({
      width: 1080,
      height: 1350,
      hasAlpha: true,
      bitDepth: 8,
      colorType: 6,
    });
    const rgb = inspectPng(pngHeader({ width: 800, height: 600, colorType: 2 }));
    expect(rgb.hasAlpha).toBe(false);
  });

  it("detects supported raster signatures and rejects SVG input", () => {
    expect(imageMimeFromBytes(pngHeader({ width: 1, height: 1 }))).toBe("image/png");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(imageMimeFromBytes(jpeg)).toBe("image/jpeg");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(imageMimeFromBytes(webp)).toBe("image/webp");
    expect(() =>
      assertSupportedRasterInput(new TextEncoder().encode("<svg></svg>"), "image/svg+xml"),
    ).toThrow(RasterValidationError);
    expect(() =>
      assertSupportedRasterInput(pngHeader({ width: 1, height: 1 }), "image/jpeg"),
    ).toThrow(/declares image\/jpeg/);
  });

  it("requires the full-resolution render to match the host artboard exactly", () => {
    expect(() =>
      assertRenderMatchesRequest(
        { width: 1080, height: 1350, bitDepth: 8, colorType: 6, hasAlpha: true },
        { width: 1080, height: 1080 },
      ),
    ).toThrow(/not silently stretched or cropped/);
  });

  it("rejects malformed PNG headers and empty data", () => {
    expect(isPng(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(() => inspectPng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
    expect(() =>
      inspectPng(pngHeader({ width: 0, height: 1350 })),
    ).toThrow(/invalid dimensions/);
  });
});
