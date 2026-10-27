import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 0);
  return Buffer.concat([length, typeBytes, Buffer.from(data), crc]);
}

export interface PngOptions {
  width: number;
  height: number;
  /** RGBA pixel callback. Defaults to an opaque orange-to-teal gradient. */
  pixel?: (x: number, y: number) => [number, number, number, number];
}

export function makePng(options: PngOptions): Buffer {
  const { width, height } = options;
  const pixel =
    options.pixel ??
    ((x: number, y: number) => {
      const r = Math.round(40 + (x / Math.max(1, width - 1)) * 190);
      const g = Math.round(80 + (y / Math.max(1, height - 1)) * 120);
      const b = Math.round(170 - (x / Math.max(1, width - 1)) * 70);
      return [r, g, b, 255];
    });
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function readPngSize(bytes: Buffer): { width: number; height: number } {
  if (
    bytes.length < 33 ||
    bytes[0] !== 0x89 ||
    bytes.toString("ascii", 1, 4) !== "PNG"
  ) {
    throw new Error("Not a PNG");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

export function makeTransparentPng(width = 240, height = 240): Buffer {
  return makePng({
    width,
    height,
    pixel(x, y) {
      const dx = (x - width / 2) / (width * 0.34);
      const dy = (y - height / 2) / (height * 0.34);
      const inside = dx * dx + dy * dy <= 1;
      return inside ? [190, 220, 100, 255] : [0, 0, 0, 0];
    },
  });
}
