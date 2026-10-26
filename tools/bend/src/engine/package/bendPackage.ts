import { normalizeProject } from "../core/project";
import type { BendProject, MediaAssetRecord } from "../core/types";

export const BEND_PACKAGE_FORMAT = "bendpkg" as const;
export const BEND_PACKAGE_VERSION = 1 as const;
export const BEND_PACKAGE_MAGIC = "BENDPKG1";

export interface BendPackageLimits {
  maxManifestBytes: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxEntries: number;
}

export const DEFAULT_BEND_PACKAGE_LIMITS: BendPackageLimits = {
  maxManifestBytes: 8 * 1024 * 1024,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxEntries: 2_048,
};

export interface BendPackageAssetManifest {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string | null;
}

export interface BendPackageManifest {
  format: typeof BEND_PACKAGE_FORMAT;
  formatVersion: typeof BEND_PACKAGE_VERSION;
  createdAt: number;
  complete: boolean;
  project: BendProject;
  assets: Record<string, BendPackageAssetManifest>;
}

export interface BendPackageAssetInput {
  record: MediaAssetRecord;
  blob: Blob;
}

export interface BendPackageAssetOutput {
  manifest: BendPackageAssetManifest;
  blob: Blob;
}

export interface DecodedBendPackage {
  manifest: BendPackageManifest;
  project: BendProject;
  assets: Record<string, BendPackageAssetOutput>;
  byteLength: number;
}

export class BendPackageError extends Error {
  readonly code: "invalid" | "unsupported" | "incomplete" | "limit";

  constructor(message: string, code: BendPackageError["code"] = "invalid") {
    super(message);
    this.name = "BendPackageError";
    this.code = code;
  }
}

export class BendPackageIncompleteError extends BendPackageError {
  readonly missingAssetIds: string[];

  constructor(missingAssetIds: string[]) {
    super(`This project is incomplete because ${missingAssetIds.length} source asset${missingAssetIds.length === 1 ? " is" : "s are"} missing: ${missingAssetIds.join(", ")}.`, "incomplete");
    this.name = "BendPackageIncompleteError";
    this.missingAssetIds = missingAssetIds;
  }
}

export async function createBendPackage(
  project: BendProject,
  assets: BendPackageAssetInput[],
  limits: Partial<BendPackageLimits> = {},
): Promise<{ blob: Blob; manifest: BendPackageManifest; byteLength: number }> {
  const effectiveLimits = { ...DEFAULT_BEND_PACKAGE_LIMITS, ...limits };
  const normalized = normalizeProject(project);
  const assetById = new Map(assets.map((asset) => [asset.record.id, asset]));
  const missingAssetIds = Object.keys(normalized.assets).filter((id) => !assetById.has(id));
  if (missingAssetIds.length > 0) throw new BendPackageIncompleteError(missingAssetIds);
  if (assets.length !== Object.keys(normalized.assets).length) {
    throw new BendPackageError("The editable package contains an asset that is not referenced by the project.");
  }
  if (assets.length > effectiveLimits.maxEntries) {
    throw new BendPackageError("This project contains too many media entries for a portable package.", "limit");
  }

  const manifestAssets: Record<string, BendPackageAssetManifest> = {};
  const entries: PackageEntry[] = [];
  for (const id of Object.keys(normalized.assets).sort()) {
    const input = assetById.get(id);
    if (!input) throw new BendPackageIncompleteError([id]);
    const path = `assets/${encodeURIComponent(id)}`;
    assertSafeEntryPath(path);
    if (input.blob.size > effectiveLimits.maxEntryBytes) {
      throw new BendPackageError(`Source asset ${input.record.name} is larger than the portable package limit.`, "limit");
    }
    const bytes = new Uint8Array(await input.blob.arrayBuffer());
    const sha256 = await sha256Hex(bytes);
    manifestAssets[id] = {
      id,
      path,
      name: input.record.name,
      mimeType: input.record.mimeType || input.blob.type || "application/octet-stream",
      size: bytes.byteLength,
      sha256,
    };
    entries.push({ path, bytes });
  }

  const portableAssets = Object.fromEntries(Object.entries(normalized.assets).map(([id, asset]) => [id, {
    ...asset,
    storageKey: `portable/${id}`,
    size: manifestAssets[id]?.size ?? asset.size,
  }]));
  const manifest: BendPackageManifest = {
    format: BEND_PACKAGE_FORMAT,
    formatVersion: BEND_PACKAGE_VERSION,
    createdAt: Date.now(),
    complete: true,
    project: normalizeProject({ ...normalized, assets: portableAssets }),
    assets: manifestAssets,
  };
  const manifestBytes = encodeJson(manifest);
  if (manifestBytes.byteLength > effectiveLimits.maxManifestBytes) {
    throw new BendPackageError("The project manifest is larger than the portable package limit.", "limit");
  }
  const totalEntryBytes = entries.reduce((total, entry) => total + entry.bytes.byteLength, 0);
  if (totalEntryBytes > effectiveLimits.maxTotalBytes) {
    throw new BendPackageError("The portable package is larger than the browser safety limit.", "limit");
  }
  const bytes = encodeArchive(manifestBytes, entries, effectiveLimits);
  return {
    blob: new Blob([toArrayBuffer(bytes)], { type: "application/vnd.bend.project" }),
    manifest,
    byteLength: bytes.byteLength,
  };
}

export async function decodeBendPackage(
  input: Blob | ArrayBuffer | Uint8Array,
  limits: Partial<BendPackageLimits> = {},
): Promise<DecodedBendPackage> {
  const effectiveLimits = { ...DEFAULT_BEND_PACKAGE_LIMITS, ...limits };
  const bytes = input instanceof Blob
    ? new Uint8Array(await input.arrayBuffer())
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  if (bytes.byteLength > effectiveLimits.maxTotalBytes) {
    throw new BendPackageError("This package exceeds the browser safety limit.", "limit");
  }
  const reader = new ArchiveReader(bytes);
  const manifestLength = reader.readUint32();
  const entryCount = reader.readUint32();
  const manifestBytes = reader.readBytes(manifestLength);
  if (manifestBytes.byteLength > effectiveLimits.maxManifestBytes) {
    throw new BendPackageError("The package manifest is larger than the browser safety limit.", "limit");
  }
  if (entryCount > effectiveLimits.maxEntries) {
    throw new BendPackageError("This package contains too many entries.", "limit");
  }
  let manifest: BendPackageManifest;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)) as BendPackageManifest;
  } catch {
    throw new BendPackageError("The package manifest is not valid JSON.");
  }
  validateManifest(manifest);

  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    const pathLength = reader.readUint32();
    const size = reader.readUint64(effectiveLimits.maxEntryBytes);
    const path = decodePath(reader.readBytes(pathLength));
    assertSafeEntryPath(path);
    if (entries.has(path)) throw new BendPackageError(`The package contains a duplicate entry: ${path}.`);
    if (size > effectiveLimits.maxEntryBytes) throw new BendPackageError(`Package entry ${path} is too large.`, "limit");
    entries.set(path, reader.readBytes(size));
  }
  if (!reader.isAtEnd()) throw new BendPackageError("The package contains trailing bytes outside its archive entries.");

  const project = normalizeProject(manifest.project);
  const projectAssetIds = Object.keys(project.assets).sort();
  const manifestAssetIds = Object.keys(manifest.assets).sort();
  if (projectAssetIds.join("\u0000") !== manifestAssetIds.join("\u0000")) {
    throw new BendPackageError("The package manifest and project asset references do not match.");
  }
  for (const layer of project.layers) {
    if (layer.kind === "video" && !manifest.assets[layer.assetId]) {
      throw new BendPackageError(`Layer ${layer.name} references a media asset that is not in the package.`);
    }
  }
  if (project.soundtrack && !manifest.assets[project.soundtrack.assetId]) {
    throw new BendPackageError("The soundtrack references a media asset that is not in the package.");
  }

  const assets: Record<string, BendPackageAssetOutput> = {};
  for (const id of manifestAssetIds) {
    const assetManifest = manifest.assets[id];
    if (assetManifest.id !== id || !entries.has(assetManifest.path)) {
      throw new BendPackageError(`Package media entry for ${id} is missing.`);
    }
    const bytes = entries.get(assetManifest.path);
    if (!bytes || bytes.byteLength !== assetManifest.size) {
      throw new BendPackageError(`Package media entry for ${id} has an invalid size.`);
    }
    if (assetManifest.sha256) {
      const actualHash = await sha256Hex(bytes);
      if (!actualHash || actualHash !== assetManifest.sha256) {
        throw new BendPackageError(`Package media entry for ${id} failed its content-hash check.`);
      }
    }
    assets[id] = {
      manifest: assetManifest,
    blob: new Blob([toArrayBuffer(bytes)], { type: assetManifest.mimeType }),
    };
  }
  return { manifest, project, assets, byteLength: bytes.byteLength };
}

function validateManifest(value: BendPackageManifest): void {
  if (!value || value.format !== BEND_PACKAGE_FORMAT) throw new BendPackageError("This file is not a BEND editable package.");
  if (value.formatVersion > BEND_PACKAGE_VERSION) throw new BendPackageError(`This BEND package uses a newer format version (${value.formatVersion}).`, "unsupported");
  if (value.formatVersion !== BEND_PACKAGE_VERSION) throw new BendPackageError(`This BEND package format version (${value.formatVersion}) is not supported.`, "unsupported");
  if (value.complete !== true) throw new BendPackageError("This BEND package is explicitly marked incomplete and cannot be restored.", "incomplete");
  if (!value.project || typeof value.project !== "object" || !value.assets || typeof value.assets !== "object") {
    throw new BendPackageError("The BEND package manifest is missing its project or asset table.");
  }
  const paths = new Set<string>();
  for (const [id, asset] of Object.entries(value.assets)) {
    if (!asset || asset.id !== id || !safeString(asset.path) || !safeString(asset.name) || !safeString(asset.mimeType) || !Number.isSafeInteger(asset.size) || asset.size < 0) {
      throw new BendPackageError(`The package asset metadata for ${id} is invalid.`);
    }
    assertSafeEntryPath(asset.path);
    if (!asset.path.startsWith("assets/")) throw new BendPackageError(`The package asset path for ${id} is outside the assets directory.`);
    if (paths.has(asset.path)) throw new BendPackageError(`The package contains duplicate asset paths: ${asset.path}.`);
    paths.add(asset.path);
    if (asset.sha256 !== null && (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256))) {
      throw new BendPackageError(`The package asset hash for ${id} is invalid.`);
    }
  }
}

interface PackageEntry {
  path: string;
  bytes: Uint8Array;
}

function encodeArchive(manifest: Uint8Array, entries: PackageEntry[], limits: BendPackageLimits): Uint8Array {
  const encoder = new TextEncoder();
  const encodedEntries = entries.map((entry) => ({ ...entry, pathBytes: encoder.encode(entry.path) }));
  const byteLength = 16 + manifest.byteLength + encodedEntries.reduce((total, entry) => total + 4 + 8 + entry.pathBytes.byteLength + entry.bytes.byteLength, 0);
  if (byteLength > limits.maxTotalBytes) throw new BendPackageError("The portable package is larger than the browser safety limit.", "limit");
  const output = new Uint8Array(byteLength);
  const view = new DataView(output.buffer);
  output.set(encoder.encode(BEND_PACKAGE_MAGIC), 0);
  view.setUint32(8, manifest.byteLength, true);
  view.setUint32(12, encodedEntries.length, true);
  let offset = 16;
  output.set(manifest, offset);
  offset += manifest.byteLength;
  for (const entry of encodedEntries) {
    view.setUint32(offset, entry.pathBytes.byteLength, true);
    offset += 4;
    view.setBigUint64(offset, BigInt(entry.bytes.byteLength), true);
    offset += 8;
    output.set(entry.pathBytes, offset);
    offset += entry.pathBytes.byteLength;
    output.set(entry.bytes, offset);
    offset += entry.bytes.byteLength;
  }
  return output;
}

class ArchiveReader {
  private offset = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    if (bytes.byteLength < 16) throw new BendPackageError("The file is too small to be a BEND package.");
    const magic = new TextDecoder("ascii").decode(bytes.slice(0, 8));
    if (magic !== BEND_PACKAGE_MAGIC) throw new BendPackageError("The file is not a BEND package archive.");
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 8;
  }

  readUint32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readUint64(max: number): number {
    this.ensure(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    if (value > BigInt(max) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new BendPackageError("A package entry size is outside the supported range.", "limit");
    return Number(value);
  }

  readBytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0) throw new BendPackageError("The package contains an invalid byte length.");
    this.ensure(length);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  isAtEnd(): boolean {
    return this.offset === this.bytes.byteLength;
  }

  private ensure(length: number): void {
    if (this.offset + length > this.bytes.byteLength) throw new BendPackageError("The package ends before all declared bytes are available.");
  }
}

function decodePath(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new BendPackageError("The package contains an invalid entry path.");
  }
}

function assertSafeEntryPath(path: string): void {
  if (!path || path.includes("\\") || path.startsWith("/") || path.includes(":") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new BendPackageError(`Unsafe package entry path: ${path || "<empty>"}.`);
  }
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function safeString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
