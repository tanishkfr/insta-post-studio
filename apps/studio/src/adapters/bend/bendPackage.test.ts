import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  BEND_PACKAGE_MAGIC,
  BendPackageInspectionError,
  inspectBendPackage,
} from "./bendPackage";

interface TestAsset {
  id: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function archive(
  manifest: unknown,
  entries: Array<{ path: string; bytes: Uint8Array }>,
): Uint8Array {
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const pathBytes = entries.map((entry) => new TextEncoder().encode(entry.path));
  const size =
    16 +
    manifestBytes.byteLength +
    entries.reduce(
      (total, entry, index) => total + 4 + 8 + pathBytes[index].byteLength + entry.bytes.byteLength,
      0,
    );
  const output = new Uint8Array(size);
  const view = new DataView(output.buffer);
  output.set(new TextEncoder().encode(BEND_PACKAGE_MAGIC), 0);
  view.setUint32(8, manifestBytes.byteLength, true);
  view.setUint32(12, entries.length, true);
  let offset = 16;
  output.set(manifestBytes, offset);
  offset += manifestBytes.byteLength;
  entries.forEach((entry, index) => {
    view.setUint32(offset, pathBytes[index].byteLength, true);
    offset += 4;
    view.setBigUint64(offset, BigInt(entry.bytes.byteLength), true);
    offset += 8;
    output.set(pathBytes[index], offset);
    offset += pathBytes[index].byteLength;
    output.set(entry.bytes, offset);
    offset += entry.bytes.byteLength;
  });
  return output;
}

function manifestFor(assets: TestAsset[], overrides: Record<string, unknown> = {}) {
  return {
    format: "bendpkg",
    formatVersion: 1,
    createdAt: 1,
    complete: true,
    project: {
      id: "project-package",
      name: "Package fixture",
      canvas: { width: 1080, height: 1350, fps: 30, duration: 3 },
      assets: Object.fromEntries(
        assets.map((asset) => [
          asset.id,
          {
            id: asset.id,
            name: asset.name,
            mimeType: asset.mimeType,
            size: asset.bytes.byteLength,
            width: 1080,
            height: 1350,
            duration: 3,
            storageKey: `portable/${asset.id}`,
          },
        ]),
      ),
      layers: assets.map((asset) => ({
        id: `layer-${asset.id}`,
        kind: "video",
        name: asset.name,
        assetId: asset.id,
      })),
      soundtrack: null,
    },
    assets: Object.fromEntries(
      assets.map((asset) => [
        asset.id,
        {
          id: asset.id,
          path: `assets/${asset.id}`,
          name: asset.name,
          mimeType: asset.mimeType,
          size: asset.bytes.byteLength,
          sha256: sha256(asset.bytes),
        },
      ]),
    ),
    ...overrides,
  };
}

const assets: TestAsset[] = [
  {
    id: "asset-a",
    name: "clip.mp4",
    mimeType: "video/mp4",
    bytes: new Uint8Array([0, 1, 2, 3, 4]),
  },
  {
    id: "asset-b",
    name: "bed.mp3",
    mimeType: "audio/mpeg",
    bytes: new Uint8Array([5, 6, 7]),
  },
];

describe("independent BEND package inspection", () => {
  it("accepts a complete archive and reports source media integrity", async () => {
    const manifest = manifestFor(assets);
    const bytes = archive(
      manifest,
      assets.map((asset) => ({ path: `assets/${asset.id}`, bytes: asset.bytes })),
    );
    const inspected = await inspectBendPackage(bytes);
    expect(inspected.projectId).toBe("project-package");
    expect(inspected.assetIds).toEqual(["asset-a", "asset-b"]);
    expect(inspected.media[0].sha256).toBe(sha256(assets[0].bytes));
    expect(inspected.byteLength).toBe(bytes.byteLength);
  });

  it("rejects an incomplete manifest, unsupported version and mismatched asset tables", async () => {
    await expect(inspectBendPackage(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      BendPackageInspectionError,
    );
    const incomplete = archive(manifestFor(assets, { complete: false }), [
      { path: "assets/asset-a", bytes: assets[0].bytes },
      { path: "assets/asset-b", bytes: assets[1].bytes },
    ]);
    await expect(inspectBendPackage(incomplete)).rejects.toThrow(/incomplete/i);
    const future = archive(manifestFor(assets, { formatVersion: 2 }), [
      { path: "assets/asset-a", bytes: assets[0].bytes },
      { path: "assets/asset-b", bytes: assets[1].bytes },
    ]);
    await expect(inspectBendPackage(future)).rejects.toThrow(/not supported/i);

    const missingProjectAsset = manifestFor(assets);
    delete (missingProjectAsset.project.assets as Record<string, unknown>)["asset-b"];
    const mismatch = archive(missingProjectAsset, [
      { path: "assets/asset-a", bytes: assets[0].bytes },
      { path: "assets/asset-b", bytes: assets[1].bytes },
    ]);
    await expect(inspectBendPackage(mismatch)).rejects.toThrow(/disagree/i);
  });

  it("rejects missing entries, entry hash damage and trailing/truncated bytes", async () => {
    const missing = archive(manifestFor(assets), [
      { path: "assets/asset-a", bytes: assets[0].bytes },
    ]);
    await expect(inspectBendPackage(missing)).rejects.toThrow(/missing/i);

    const hashManifest = manifestFor(assets);
    (hashManifest.assets as Record<string, { sha256: string }>)["asset-a"].sha256 = "0".repeat(64);
    const badHash = archive(hashManifest, [
      { path: "assets/asset-a", bytes: assets[0].bytes },
      { path: "assets/asset-b", bytes: assets[1].bytes },
    ]);
    await expect(inspectBendPackage(badHash)).rejects.toThrow(/hash check/i);

    const valid = archive(manifestFor(assets), [
      { path: "assets/asset-a", bytes: assets[0].bytes },
      { path: "assets/asset-b", bytes: assets[1].bytes },
    ]);
    const truncated = valid.slice(0, valid.byteLength - 2);
    await expect(inspectBendPackage(truncated)).rejects.toBeInstanceOf(
      BendPackageInspectionError,
    );
    const trailing = new Uint8Array(valid.byteLength + 1);
    trailing.set(valid);
    await expect(inspectBendPackage(trailing)).rejects.toThrow(/trailing/i);
  });

  it("rejects a video layer that references an asset missing from the package", async () => {
    const manifest = manifestFor(assets);
    manifest.project.layers[0].assetId = "asset-missing";
    const bytes = archive(manifest, [
      { path: "assets/asset-a", bytes: assets[0].bytes },
      { path: "assets/asset-b", bytes: assets[1].bytes },
    ]);
    await expect(inspectBendPackage(bytes)).rejects.toThrow(/missing from the package/i);
  });
});
