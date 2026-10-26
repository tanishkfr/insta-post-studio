import { sha256Hex } from "../../lib/hash";

export const BEND_PACKAGE_MAGIC = "BENDPKG1";
export const BEND_PACKAGE_FORMAT = "bendpkg";
export const BEND_PACKAGE_VERSION = 1;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

export interface InspectedBendPackage {
  format: typeof BEND_PACKAGE_FORMAT;
  formatVersion: number;
  complete: true;
  projectId: string;
  projectName: string;
  canvas: { width: number; height: number; fps: number; duration: number };
  assetIds: string[];
  media: Array<{
    id: string;
    name: string;
    mimeType: string;
    byteLength: number;
    sha256: string | null;
    width?: number;
    height?: number;
    durationSeconds?: number;
  }>;
  byteLength: number;
}

interface Manifest {
  format?: unknown;
  formatVersion?: unknown;
  complete?: unknown;
  project?: {
    id?: unknown;
    name?: unknown;
    canvas?: { width?: unknown; height?: unknown; fps?: unknown; duration?: unknown };
    assets?: Record<string, Record<string, unknown>>;
    layers?: Array<{ kind?: unknown; assetId?: unknown; name?: unknown }>;
    soundtrack?: { assetId?: unknown } | null;
  };
  assets?: Record<
    string,
    {
      id?: unknown;
      path?: unknown;
      name?: unknown;
      mimeType?: unknown;
      size?: unknown;
      sha256?: unknown;
    }
  >;
}

export class BendPackageInspectionError extends Error {
  readonly code = "BEND_PACKAGE_INSPECTION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "BendPackageInspectionError";
  }
}

/**
 * Independent host-side validation of BEND's `.bendpkg` archive. It mirrors the
 * public package format (magic, manifest, entry table, per-asset hashes) so the
 * host never commits a video layer whose editable source is incomplete, corrupt
 * or missing media, even if the bridge reports success.
 */
export async function inspectBendPackage(
  input: Uint8Array | ArrayBuffer | Blob,
): Promise<InspectedBendPackage> {
  const bytes =
    input instanceof Blob
      ? new Uint8Array(await input.arrayBuffer())
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  if (bytes.byteLength < 16) throw new BendPackageInspectionError("The package is too small.");
  if (bytes.byteLength > MAX_TOTAL_BYTES) {
    throw new BendPackageInspectionError("The package exceeds the host browser safety limit.");
  }
  const magic = new TextDecoder("ascii").decode(bytes.subarray(0, 8));
  if (magic !== BEND_PACKAGE_MAGIC) {
    throw new BendPackageInspectionError("The file is not a BEND package archive.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  const manifestLength = view.getUint32(offset, true);
  offset += 4;
  const entryCount = view.getUint32(offset, true);
  offset += 4;
  if (manifestLength > MAX_MANIFEST_BYTES || offset + manifestLength > bytes.byteLength) {
    throw new BendPackageInspectionError("The package manifest length is invalid.");
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(offset, offset + manifestLength),
      ),
    ) as Manifest;
  } catch {
    throw new BendPackageInspectionError("The package manifest is not valid JSON.");
  }
  offset += manifestLength;
  validateManifest(manifest);

  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 12 > bytes.byteLength) {
      throw new BendPackageInspectionError("The package entry table is truncated.");
    }
    const pathLength = view.getUint32(offset, true);
    offset += 4;
    const sizeBig = view.getBigUint64(offset, true);
    offset += 8;
    if (sizeBig > BigInt(MAX_ENTRY_BYTES) || sizeBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BendPackageInspectionError("A package entry exceeds the supported size.");
    }
    const size = Number(sizeBig);
    if (pathLength > 4096 || offset + pathLength + size > bytes.byteLength) {
      throw new BendPackageInspectionError("A package entry is truncated.");
    }
    let path: string;
    try {
      path = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(offset, offset + pathLength),
      );
    } catch {
      throw new BendPackageInspectionError("A package entry path is invalid.");
    }
    offset += pathLength;
    assertSafePath(path);
    if (entries.has(path)) {
      throw new BendPackageInspectionError(`The package repeats entry ${path}.`);
    }
    entries.set(path, bytes.subarray(offset, offset + size));
    offset += size;
  }
  if (offset !== bytes.byteLength) {
    throw new BendPackageInspectionError("The package contains unexpected trailing bytes.");
  }

  const projectAssetIds = Object.keys(manifest.project!.assets!).sort();
  const manifestAssetIds = Object.keys(manifest.assets!).sort();
  if (projectAssetIds.join("\u0000") !== manifestAssetIds.join("\u0000")) {
    throw new BendPackageInspectionError(
      "The package project and its media manifest disagree about source assets.",
    );
  }
  for (const layer of manifest.project!.layers ?? []) {
    if (layer.kind === "video" && (typeof layer.assetId !== "string" || !manifest.assets![layer.assetId])) {
      throw new BendPackageInspectionError(
        `Layer ${String(layer.name ?? "(unnamed)")} references media that is missing from the package.`,
      );
    }
  }
  const soundtrackId = manifest.project!.soundtrack?.assetId;
  if (typeof soundtrackId === "string" && !manifest.assets![soundtrackId]) {
    throw new BendPackageInspectionError("The soundtrack references media missing from the package.");
  }

  const media: InspectedBendPackage["media"] = [];
  for (const id of manifestAssetIds) {
    const asset = manifest.assets![id];
    if (typeof asset.path !== "string" || !entries.has(asset.path)) {
      throw new BendPackageInspectionError(`Package media entry for ${id} is missing.`);
    }
    const payload = entries.get(asset.path)!;
    if (payload.byteLength !== asset.size) {
      throw new BendPackageInspectionError(`Package media entry for ${id} has an invalid size.`);
    }
    if (typeof asset.sha256 === "string") {
      const actual = await sha256Hex(payload);
      if (actual !== asset.sha256) {
        throw new BendPackageInspectionError(`Package media entry for ${id} failed its hash check.`);
      }
    }
    const record = manifest.project!.assets![id];
    media.push({
      id,
      name: String(asset.name),
      mimeType: String(asset.mimeType),
      byteLength: Number(asset.size),
      sha256: typeof asset.sha256 === "string" ? asset.sha256 : null,
      width: typeof record?.width === "number" ? record.width : undefined,
      height: typeof record?.height === "number" ? record.height : undefined,
      durationSeconds:
        typeof record?.duration === "number" ? record.duration : undefined,
    });
  }

  const canvas = manifest.project!.canvas!;
  return {
    format: BEND_PACKAGE_FORMAT,
    formatVersion: BEND_PACKAGE_VERSION,
    complete: true,
    projectId: String(manifest.project!.id),
    projectName: String(manifest.project!.name),
    canvas: {
      width: Number(canvas.width),
      height: Number(canvas.height),
      fps: Number(canvas.fps),
      duration: Number(canvas.duration),
    },
    assetIds: media.map((entry) => entry.id),
    media,
    byteLength: bytes.byteLength,
  };
}

function validateManifest(value: Manifest): void {
  if (!value || value.format !== BEND_PACKAGE_FORMAT) {
    throw new BendPackageInspectionError("The package is not a BEND editable package.");
  }
  if (value.formatVersion !== BEND_PACKAGE_VERSION) {
    throw new BendPackageInspectionError(
      `BEND package format ${String(value.formatVersion)} is not supported.`,
    );
  }
  if (value.complete !== true) {
    throw new BendPackageInspectionError("The package is explicitly marked incomplete.");
  }
  if (!value.project || typeof value.project !== "object") {
    throw new BendPackageInspectionError("The package has no project document.");
  }
  if (typeof value.project.id !== "string" || !value.project.id) {
    throw new BendPackageInspectionError("The package project has no stable id.");
  }
  const canvas = value.project.canvas;
  if (
    !canvas ||
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height) ||
    !Number.isFinite(canvas.fps) ||
    !Number.isFinite(canvas.duration) ||
    Number(canvas.width) <= 0 ||
    Number(canvas.height) <= 0 ||
    Number(canvas.fps) <= 0 ||
    Number(canvas.duration) <= 0
  ) {
    throw new BendPackageInspectionError("The package project has invalid canvas metadata.");
  }
  if (!value.project.assets || typeof value.project.assets !== "object") {
    throw new BendPackageInspectionError("The package project has no source media table.");
  }
  if (!value.assets || typeof value.assets !== "object") {
    throw new BendPackageInspectionError("The package manifest has no media entries.");
  }
  for (const [id, asset] of Object.entries(value.assets)) {
    if (
      !asset ||
      asset.id !== id ||
      typeof asset.path !== "string" ||
      typeof asset.name !== "string" ||
      typeof asset.mimeType !== "string" ||
      !Number.isSafeInteger(asset.size) ||
      Number(asset.size) < 0
    ) {
      throw new BendPackageInspectionError(`Package media metadata for ${id} is invalid.`);
    }
    if (asset.sha256 !== null && (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256))) {
      throw new BendPackageInspectionError(`Package media hash for ${id} is invalid.`);
    }
    assertSafePath(asset.path);
    if (!asset.path.startsWith("assets/")) {
      throw new BendPackageInspectionError(`Package media path for ${id} is outside assets/.`);
    }
  }
}

function assertSafePath(path: string): void {
  if (
    !path ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.includes(":") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new BendPackageInspectionError(`Unsafe package entry path: ${path || "<empty>"}.`);
  }
}
