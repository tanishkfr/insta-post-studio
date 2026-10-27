import JSZip from "jszip";
import type {
  Artboard,
  AssetKind,
  AssetReference,
  RenderedAssetReference,
  SharedLayer,
  SourceToolId,
  StudioProject,
  ToolSourceStatePayload,
  ToolSourceStateReference,
} from "@studio/contracts";
import { STUDIO_PROJECT_SCHEMA_VERSION } from "@studio/contracts";
import { sha256Hex } from "../lib/hash";
import { createId, nowIso } from "../lib/ids";
import {
  ASSET_DB_NAME,
  ASSET_STORE,
  type AssetRepository,
} from "../storage/assetRepository";
import {
  UnsupportedProjectVersionError,
  validateProject,
  type ProjectRepository,
} from "../storage/projectRepository";
import { studioSlug } from "./compositionExport";

export const STUDIO_PACKAGE_FORMAT = "studio-project-package";
export const STUDIO_PACKAGE_VERSION = 1;
export const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
export const MAX_PACKAGE_ENTRY_COUNT = 600;
export const MAX_PACKAGE_ENTRY_BYTES = 80 * 1024 * 1024;
export const MAX_PACKAGE_TOTAL_UNCOMPRESSED = 400 * 1024 * 1024;
export const MAX_PACKAGE_MANIFEST_BYTES = 2 * 1024 * 1024;
export const MAX_PACKAGE_ASSETS = 400;
export const MAX_PACKAGE_SOURCE_STATES = 200;

const ASSET_KINDS = new Set<AssetKind>([
  "source-image",
  "rendered-image",
  "vector",
  "font",
  "video",
  "audio",
  "project-package",
  "other",
]);

const SOURCE_TOOLS = new Set<SourceToolId>([
  "host",
  "image",
  "vector",
  "typography",
  "shapes",
  "generate",
  "bend",
]);

export interface PackageAssetEntry {
  id: string;
  path: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  sourceTool: SourceToolId;
  byteLength: number;
  contentHash: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  createdAt: string;
}

export interface PackageSourceStateEntry {
  id: string;
  path: string;
  tool: SourceToolId;
  toolStateVersion: string;
  mimeType: string;
  revision: number;
  byteLength: number;
  contentHash: string;
  label?: string;
}

export interface ProjectPackageManifest {
  format: typeof STUDIO_PACKAGE_FORMAT;
  formatVersion: typeof STUDIO_PACKAGE_VERSION;
  schemaVersion: typeof STUDIO_PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  appVersion: string;
  exportedAt: string;
  project: {
    path: "project.json";
    byteLength: number;
    sha256: string;
  };
  assets: PackageAssetEntry[];
  sourceStates: PackageSourceStateEntry[];
  totals: {
    assets: number;
    sourceStates: number;
    uncompressedBytes: number;
  };
  limits: {
    maxPackageBytes: number;
    maxEntries: number;
    maxEntryBytes: number;
    maxTotalUncompressedBytes: number;
  };
  notes: string[];
}

export interface ProjectPackageExportResult {
  blob: Blob;
  filename: string;
  manifest: ProjectPackageManifest;
}

export interface ProjectPackageImportResult {
  project: StudioProject;
  revision: number;
  projectId: string;
  sourceProjectId: string;
  remappedProjectId: boolean;
  assetsImported: number;
  sourceStatesImported: number;
  warnings: string[];
}

export type ProjectPackageErrorCode =
  | "INVALID_ARCHIVE"
  | "UNSAFE_ENTRY"
  | "TOO_LARGE"
  | "UNSUPPORTED_VERSION"
  | "INVALID_MANIFEST"
  | "MISSING_ENTRY"
  | "HASH_MISMATCH"
  | "MISSING_ASSET"
  | "MISSING_SOURCE_STATE"
  | "COLLISION"
  | "ABORTED"
  | "SAVE_FAILED";

export class ProjectPackageError extends Error {
  readonly code: ProjectPackageErrorCode;

  constructor(code: ProjectPackageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectPackageError";
    this.code = code;
  }
}

interface LoadedSourceState {
  reference: ToolSourceStateReference;
  payload: ToolSourceStatePayload;
  bytes: Uint8Array;
  contentHash: string;
}

interface LoadedAsset {
  reference: AssetReference;
  bytes: Uint8Array;
  contentHash: string;
}

/**
 * Builds a validated, portable Studio project package. Every referenced asset
 * and every native source document is resolved from the local store before the
 * ZIP is offered as a download; a missing dependency fails the backup instead
 * of producing an incomplete archive.
 */
export async function exportProjectPackage(options: {
  project: StudioProject;
  assets: AssetRepository;
  signal?: AbortSignal;
  onProgress?: (value: number, label: string) => void;
}): Promise<ProjectPackageExportResult> {
  const { project, assets } = options;
  throwIfAborted(options.signal);
  validateProject(project);
  options.onProgress?.(0.03, "Collecting editable source documents");

  const sourceReferences = new Map<string, ToolSourceStateReference>();
  for (const layer of project.layers) {
    if (layer.sourceState) sourceReferences.set(layer.sourceState.id, layer.sourceState);
  }

  const sourceStates: LoadedSourceState[] = [];
  const assetIds = new Set<string>();
  for (const asset of project.assets) assetIds.add(asset.id);
  for (const layer of project.layers) {
    addReferenceAsset(assetIds, layer.rendered);
    addReferenceAsset(assetIds, layer.poster);
    if (layer.mask?.assetId) assetIds.add(layer.mask.assetId);
  }
  for (const artboard of project.artboards) {
    if (artboard.background.assetId) assetIds.add(artboard.background.assetId);
  }

  let completedSources = 0;
  for (const reference of sourceReferences.values()) {
    throwIfAborted(options.signal);
    const payload = await assets.getSourceState(reference);
    const bytes =
      typeof payload.content === "string"
        ? new TextEncoder().encode(payload.content)
        : new Uint8Array(payload.content);
    const contentHash = await sha256Hex(bytes);
    if (reference.contentHash && reference.contentHash !== contentHash) {
      throw new ProjectPackageError(
        "HASH_MISMATCH",
        `Source state “${reference.id}” does not match its recorded hash.`,
      );
    }
    const loaded: LoadedSourceState = {
      reference,
      payload,
      bytes,
      contentHash,
    };
    sourceStates.push(loaded);
    collectAssetIdsFromSourceState(payload, sourceReferences.get(reference.id)?.tool, assetIds);
    completedSources += 1;
    options.onProgress?.(
      0.03 + (completedSources / Math.max(1, sourceReferences.size)) * 0.12,
      `Read ${reference.tool} source document`,
    );
  }

  const assetEntries: LoadedAsset[] = [];
  let completedAssets = 0;
  for (const assetId of assetIds) {
    throwIfAborted(options.signal);
    let stored;
    try {
      stored = await assets.getAsset(assetId);
    } catch (error) {
      throw new ProjectPackageError(
        "MISSING_ASSET",
        `The project references asset ${assetId}, which is not available locally. The backup was stopped so it cannot be incomplete.`,
        { cause: error },
      );
    }
    const bytes = new Uint8Array(stored.bytes);
    const contentHash = await sha256Hex(bytes);
    const reference = resolveAssetReference(project, assetId) ?? stored.reference;
    if (reference.contentHash && reference.contentHash !== contentHash) {
      throw new ProjectPackageError(
        "HASH_MISMATCH",
        `Asset ${assetId} does not match the hash recorded by the project.`,
      );
    }
    assetEntries.push({ reference: stored.reference, bytes, contentHash });
    completedAssets += 1;
    options.onProgress?.(
      0.15 + (completedAssets / Math.max(1, assetIds.size)) * 0.55,
      `Read asset ${completedAssets} of ${assetIds.size}`,
    );
  }

  throwIfAborted(options.signal);
  assetEntries.sort((left, right) => left.reference.id.localeCompare(right.reference.id));
  sourceStates.sort((left, right) => left.reference.id.localeCompare(right.reference.id));

  const projectBytes = new TextEncoder().encode(JSON.stringify(project, null, 2));
  const projectHash = await sha256Hex(projectBytes);
  const manifest: ProjectPackageManifest = {
    format: STUDIO_PACKAGE_FORMAT,
    formatVersion: STUDIO_PACKAGE_VERSION,
    schemaVersion: STUDIO_PROJECT_SCHEMA_VERSION,
    projectId: project.id,
    projectName: project.name,
    appVersion: project.metadata.appVersion,
    exportedAt: nowIso(),
    project: {
      path: "project.json",
      byteLength: projectBytes.byteLength,
      sha256: projectHash,
    },
    assets: assetEntries.map((entry) => ({
      id: entry.reference.id,
      path: `assets/${entry.reference.id}`,
      kind: entry.reference.kind,
      name: entry.reference.name,
      mimeType: entry.reference.mimeType,
      sourceTool: entry.reference.sourceTool,
      byteLength: entry.bytes.byteLength,
      contentHash: entry.contentHash,
      ...(entry.reference.width !== undefined ? { width: entry.reference.width } : {}),
      ...(entry.reference.height !== undefined ? { height: entry.reference.height } : {}),
      ...(entry.reference.durationSeconds !== undefined
        ? { durationSeconds: entry.reference.durationSeconds }
        : {}),
      createdAt: entry.reference.createdAt,
    })),
    sourceStates: sourceStates.map((entry) => ({
      id: entry.reference.id,
      path: `source-states/${entry.reference.id}`,
      tool: entry.reference.tool,
      toolStateVersion: entry.reference.toolStateVersion,
      mimeType: entry.reference.mimeType,
      revision: entry.reference.revision,
      byteLength: entry.bytes.byteLength,
      contentHash: entry.contentHash,
      ...(entry.payload.label ? { label: entry.payload.label } : {}),
    })),
    totals: {
      assets: assetEntries.length,
      sourceStates: sourceStates.length,
      uncompressedBytes:
        projectBytes.byteLength +
        assetEntries.reduce((total, entry) => total + entry.bytes.byteLength, 0) +
        sourceStates.reduce((total, entry) => total + entry.bytes.byteLength, 0),
    },
    limits: {
      maxPackageBytes: MAX_PACKAGE_BYTES,
      maxEntries: MAX_PACKAGE_ENTRY_COUNT,
      maxEntryBytes: MAX_PACKAGE_ENTRY_BYTES,
      maxTotalUncompressedBytes: MAX_PACKAGE_TOTAL_UNCOMPRESSED,
    },
    notes: [
      "Portable Studio project package. Every binary uses a package-relative path and SHA-256 hash.",
      "Import validates all entries and hashes before writing a project, then rewrites IndexedDB locators.",
      "BEND packages, source media, posters, editable source state and masks are included when referenced.",
    ],
  };

  options.onProgress?.(0.74, "Writing project package");
  const zip = new JSZip();
  zip.file("README.txt", packageReadme(project));
  zip.file("project.json", projectBytes);
  for (const entry of assetEntries) {
    zip.file(`assets/${entry.reference.id}`, entry.bytes);
  }
  for (const entry of sourceStates) {
    zip.file(`source-states/${entry.reference.id}`, entry.bytes);
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/zip",
  });
  if (blob.size > MAX_PACKAGE_BYTES) {
    throw new ProjectPackageError(
      "TOO_LARGE",
      `The project package is ${formatBytes(blob.size)}, above the ${formatBytes(MAX_PACKAGE_BYTES)} limit.`,
    );
  }

  // Reopen the real bytes and verify every manifest hash before download.
  options.onProgress?.(0.9, "Verifying package integrity");
  const verified = await JSZip.loadAsync(await blob.arrayBuffer());
  const verifyProject = await verified.files["project.json"].async("uint8array");
  if (
    verifyProject.byteLength !== projectBytes.byteLength ||
    (await sha256Hex(verifyProject)) !== projectHash
  ) {
    throw new ProjectPackageError(
      "HASH_MISMATCH",
      "The package project document failed its integrity check.",
    );
  }
  for (const entry of manifest.assets) {
    const file = verified.files[entry.path];
    if (!file) {
      throw new ProjectPackageError("MISSING_ENTRY", `The package is missing ${entry.path}.`);
    }
    const bytes = await file.async("uint8array");
    if (bytes.byteLength !== entry.byteLength || (await sha256Hex(bytes)) !== entry.contentHash) {
      throw new ProjectPackageError(
        "HASH_MISMATCH",
        `The package asset ${entry.path} failed its integrity check.`,
      );
    }
  }
  for (const entry of manifest.sourceStates) {
    const file = verified.files[entry.path];
    if (!file) {
      throw new ProjectPackageError("MISSING_ENTRY", `The package is missing ${entry.path}.`);
    }
    const bytes = await file.async("uint8array");
    if (bytes.byteLength !== entry.byteLength || (await sha256Hex(bytes)) !== entry.contentHash) {
      throw new ProjectPackageError(
        "HASH_MISMATCH",
        `The package source state ${entry.path} failed its integrity check.`,
      );
    }
  }

  options.onProgress?.(1, "Project package ready");
  return {
    blob,
    filename: `${studioSlug(project.name)}-studio-project.zip`,
    manifest,
  };
}

/**
 * Imports a package into the current browser. All archive entries, hashes,
 * manifest bounds and project references are validated before any write. The
 * project record is written last; existing projects are never overwritten.
 */
export async function importProjectPackage(options: {
  bytes: Uint8Array;
  assets: AssetRepository;
  projects: ProjectRepository;
  signal?: AbortSignal;
  onProgress?: (value: number, label: string) => void;
}): Promise<ProjectPackageImportResult> {
  const { assets, projects } = options;
  throwIfAborted(options.signal);
  if (options.bytes.byteLength > MAX_PACKAGE_BYTES) {
    throw new ProjectPackageError(
      "TOO_LARGE",
      `The package is ${formatBytes(options.bytes.byteLength)}, above the ${formatBytes(MAX_PACKAGE_BYTES)} limit.`,
    );
  }

  options.onProgress?.(0.02, "Opening project package");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(
      options.bytes.buffer.slice(
        options.bytes.byteOffset,
        options.bytes.byteOffset + options.bytes.byteLength,
      ) as ArrayBuffer,
    );
  } catch (error) {
    throw new ProjectPackageError(
      "INVALID_ARCHIVE",
      "This file is not a readable Studio project ZIP.",
      { cause: error },
    );
  }

  const files: JSZip.JSZipObject[] = [];
  let guessedUncompressed = 0;
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue;
    validatePackagePath(file.name);
    files.push(file);
    if (files.length > MAX_PACKAGE_ENTRY_COUNT) {
      throw new ProjectPackageError(
        "TOO_LARGE",
        `The package contains more than ${MAX_PACKAGE_ENTRY_COUNT} files.`,
      );
    }
    const declared = declaredUncompressedSize(file);
    if (declared !== null) {
      if (declared > MAX_PACKAGE_ENTRY_BYTES) {
        throw new ProjectPackageError(
          "TOO_LARGE",
          `The package entry ${file.name} is larger than the per-entry limit.`,
        );
      }
      guessedUncompressed += declared;
      if (guessedUncompressed > MAX_PACKAGE_TOTAL_UNCOMPRESSED) {
        throw new ProjectPackageError(
          "TOO_LARGE",
          "The package expands beyond the total size limit.",
        );
      }
    }
  }
  for (const name of ["manifest.json", "project.json"]) {
    if (!zip.files[name] || zip.files[name].dir) {
      throw new ProjectPackageError("MISSING_ENTRY", `The package is missing ${name}.`);
    }
  }

  const manifestBytes = await readBoundedEntry(zip, "manifest.json", MAX_PACKAGE_MANIFEST_BYTES);
  const manifest = parseManifest(manifestBytes);

  if (manifest.schemaVersion > STUDIO_PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectVersionError(manifest.schemaVersion);
  }
  if (manifest.schemaVersion < STUDIO_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPackageError(
      "UNSUPPORTED_VERSION",
      `Project schema version ${manifest.schemaVersion} is older than this Studio build supports.`,
    );
  }

  options.onProgress?.(0.1, "Validating project document");
  const projectBytes = await readBoundedEntry(zip, "project.json", MAX_PACKAGE_ENTRY_BYTES);
  if (
    projectBytes.byteLength !== manifest.project.byteLength ||
    (await sha256Hex(projectBytes)) !== manifest.project.sha256
  ) {
    throw new ProjectPackageError(
      "HASH_MISMATCH",
      "The project document does not match the package manifest.",
    );
  }
  let project: StudioProject;
  try {
    project = JSON.parse(new TextDecoder().decode(projectBytes)) as StudioProject;
  } catch (error) {
    throw new ProjectPackageError("INVALID_MANIFEST", "The project document is not valid JSON.", {
      cause: error,
    });
  }
  if (project.schemaVersion !== manifest.schemaVersion) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      "The project schema version does not match the package manifest.",
    );
  }
  try {
    validateProject(project);
  } catch (error) {
    if (error instanceof UnsupportedProjectVersionError) throw error;
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      error instanceof Error ? error.message : "The project document is invalid.",
      { cause: error },
    );
  }

  options.onProgress?.(0.16, "Verifying package assets");
  const assetPayloads = new Map<string, { entry: PackageAssetEntry; bytes: Uint8Array }>();
  if (manifest.assets.length > MAX_PACKAGE_ASSETS) {
    throw new ProjectPackageError(
      "TOO_LARGE",
      `The package contains more than ${MAX_PACKAGE_ASSETS} assets.`,
    );
  }
  for (const entry of manifest.assets) {
    throwIfAborted(options.signal);
    validateAssetEntry(entry);
    if (assetPayloads.has(entry.id)) {
      throw new ProjectPackageError("INVALID_MANIFEST", `Duplicate asset ${entry.id}.`);
    }
    const bytes = await readBoundedEntry(zip, entry.path, MAX_PACKAGE_ENTRY_BYTES);
    if (bytes.byteLength !== entry.byteLength || (await sha256Hex(bytes)) !== entry.contentHash) {
      throw new ProjectPackageError(
        "HASH_MISMATCH",
        `Asset ${entry.path} does not match its manifest hash.`,
      );
    }
    assetPayloads.set(entry.id, { entry, bytes });
  }

  options.onProgress?.(0.26, "Verifying editable source documents");
  const sourcePayloads = new Map<string, { entry: PackageSourceStateEntry; bytes: Uint8Array }>();
  if (manifest.sourceStates.length > MAX_PACKAGE_SOURCE_STATES) {
    throw new ProjectPackageError(
      "TOO_LARGE",
      `The package contains more than ${MAX_PACKAGE_SOURCE_STATES} source documents.`,
    );
  }
  for (const entry of manifest.sourceStates) {
    throwIfAborted(options.signal);
    validateSourceEntry(entry);
    if (sourcePayloads.has(entry.id)) {
      throw new ProjectPackageError(
        "INVALID_MANIFEST",
        `Duplicate source document ${entry.id}.`,
      );
    }
    const bytes = await readBoundedEntry(zip, entry.path, MAX_PACKAGE_ENTRY_BYTES);
    if (bytes.byteLength !== entry.byteLength || (await sha256Hex(bytes)) !== entry.contentHash) {
      throw new ProjectPackageError(
        "HASH_MISMATCH",
        `Source document ${entry.path} does not match its manifest hash.`,
      );
    }
    sourcePayloads.set(entry.id, { entry, bytes });
  }

  options.onProgress?.(0.36, "Checking project references");
  validatePackageReferences(project, assetPayloads, sourcePayloads);

  options.onProgress?.(0.42, "Importing assets into local storage");
  const importedAssets = new Map<string, AssetReference>();
  let completedAssets = 0;
  for (const { entry, bytes } of assetPayloads.values()) {
    throwIfAborted(options.signal);
    try {
      const reference = await assets.importAssetRecord({
        id: entry.id,
        bytes,
        contentHash: entry.contentHash,
        kind: entry.kind,
        name: entry.name,
        mimeType: entry.mimeType,
        sourceTool: entry.sourceTool,
        width: entry.width,
        height: entry.height,
        durationSeconds: entry.durationSeconds,
        createdAt: entry.createdAt,
      });
      importedAssets.set(entry.id, reference);
    } catch (error) {
      throw new ProjectPackageError(
        "COLLISION",
        error instanceof Error ? error.message : `Could not import asset ${entry.id}.`,
        { cause: error },
      );
    }
    completedAssets += 1;
    options.onProgress?.(
      0.42 + (completedAssets / Math.max(1, assetPayloads.size)) * 0.2,
      `Imported asset ${completedAssets} of ${assetPayloads.size}`,
    );
  }

  options.onProgress?.(0.64, "Importing editable source documents");
  const importedSources = new Map<string, ToolSourceStateReference>();
  let completedSources = 0;
  for (const { entry, bytes } of sourcePayloads.values()) {
    throwIfAborted(options.signal);
    try {
      const reference = await assets.importSourceStateRecord({
        id: entry.id,
        bytes,
        contentHash: entry.contentHash,
        tool: entry.tool,
        toolStateVersion: entry.toolStateVersion,
        mimeType: entry.mimeType,
        revision: entry.revision,
        label: entry.label,
      });
      importedSources.set(entry.id, reference);
    } catch (error) {
      throw new ProjectPackageError(
        "COLLISION",
        error instanceof Error
          ? error.message
          : `Could not import source document ${entry.id}.`,
        { cause: error },
      );
    }
    completedSources += 1;
    options.onProgress?.(
      0.64 + (completedSources / Math.max(1, sourcePayloads.size)) * 0.18,
      `Imported source ${completedSources} of ${sourcePayloads.size}`,
    );
  }

  options.onProgress?.(0.84, "Rebuilding project references");
  const rewritten = rewriteProjectReferences(project, importedAssets, importedSources);

  // Never overwrite an existing project. A duplicate ID becomes a new project.
  const sourceProjectId = rewritten.id;
  let target = rewritten;
  let remapped = false;
  const existing = await projects.load(target.id);
  if (existing) {
    target = {
      ...target,
      id: createId("project"),
      name: `${target.name} (imported copy)`.slice(0, 80),
    };
    remapped = true;
  }
  target = {
    ...target,
    metadata: {
      ...target.metadata,
      updatedAt: nowIso(),
      notes: `${target.metadata.notes ?? ""}${
        target.metadata.notes ? " " : ""
      }Imported from Studio package on ${nowIso()}.`.trim(),
    },
  };

  options.onProgress?.(0.94, "Saving imported project");
  let record;
  try {
    record = await projects.save(target, 0);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ProjectRevisionConflictError" &&
      !remapped
    ) {
      target = {
        ...target,
        id: createId("project"),
        name: `${target.name} (imported copy)`.slice(0, 80),
      };
      remapped = true;
      record = await projects.save(target, 0);
    } else {
      throw new ProjectPackageError(
        "SAVE_FAILED",
        `The imported assets are valid, but the project could not be saved. The existing project was not changed. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
        { cause: error },
      );
    }
  }

  options.onProgress?.(1, "Project imported");
  return {
    project: target,
    revision: record.revision,
    projectId: target.id,
    sourceProjectId,
    remappedProjectId: remapped,
    assetsImported: importedAssets.size,
    sourceStatesImported: importedSources.size,
    warnings: remapped
      ? [
          `A project with ID ${sourceProjectId} already exists. The imported copy was saved with a new ID so the existing project was not overwritten.`,
        ]
      : [],
  };
}

function parseManifest(bytes: Uint8Array): ProjectPackageManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new ProjectPackageError("INVALID_MANIFEST", "The package manifest is not valid JSON.", {
      cause: error,
    });
  }
  if (!isRecord(parsed)) {
    throw new ProjectPackageError("INVALID_MANIFEST", "The package manifest is missing.");
  }
  if (parsed.format !== STUDIO_PACKAGE_FORMAT) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      "This ZIP is not a Studio project package.",
    );
  }
  if (parsed.formatVersion !== STUDIO_PACKAGE_VERSION) {
    throw new ProjectPackageError(
      "UNSUPPORTED_VERSION",
      typeof parsed.formatVersion === "number" && parsed.formatVersion > STUDIO_PACKAGE_VERSION
        ? `Package format version ${parsed.formatVersion} is newer than this Studio build supports.`
        : "The package format version is not supported.",
    );
  }
  if (typeof parsed.schemaVersion !== "number" || !Number.isInteger(parsed.schemaVersion)) {
    throw new ProjectPackageError("INVALID_MANIFEST", "The package schema version is invalid.");
  }
  const project = parsed.project;
  if (
    !isRecord(project) ||
    project.path !== "project.json" ||
    typeof project.byteLength !== "number" ||
    project.byteLength <= 0 ||
    project.byteLength > MAX_PACKAGE_ENTRY_BYTES ||
    typeof project.sha256 !== "string" ||
    !isHash(project.sha256)
  ) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      "The package project entry is invalid.",
    );
  }
  if (!Array.isArray(parsed.assets) || !Array.isArray(parsed.sourceStates)) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      "The package asset lists are missing.",
    );
  }
  for (const entry of parsed.assets) validateAssetEntry(entry);
  for (const entry of parsed.sourceStates) validateSourceEntry(entry);
  return parsed as unknown as ProjectPackageManifest;
}

function validateAssetEntry(value: unknown): asserts value is PackageAssetEntry {
  if (!isRecord(value)) {
    throw new ProjectPackageError("INVALID_MANIFEST", "A package asset entry is invalid.");
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || !isSafeId(entry.id)) {
    throw new ProjectPackageError("INVALID_MANIFEST", "A package asset ID is invalid.");
  }
  if (entry.path !== `assets/${entry.id}`) {
    throw new ProjectPackageError("UNSAFE_ENTRY", `Asset ${entry.id} has an invalid path.`);
  }
  if (!ASSET_KINDS.has(entry.kind as AssetKind)) {
    throw new ProjectPackageError("INVALID_MANIFEST", `Asset ${entry.id} has an unknown kind.`);
  }
  if (!SOURCE_TOOLS.has(entry.sourceTool as SourceToolId)) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      `Asset ${entry.id} has an unknown source tool.`,
    );
  }
  if (
    typeof entry.name !== "string" ||
    entry.name.length > 200 ||
    typeof entry.mimeType !== "string" ||
    entry.mimeType.length > 160 ||
    typeof entry.byteLength !== "number" ||
    entry.byteLength <= 0 ||
    entry.byteLength > MAX_PACKAGE_ENTRY_BYTES ||
    typeof entry.contentHash !== "string" ||
    !isHash(entry.contentHash) ||
    typeof entry.createdAt !== "string"
  ) {
    throw new ProjectPackageError("INVALID_MANIFEST", `Asset ${entry.id} metadata is invalid.`);
  }
  for (const dimension of [entry.width, entry.height, entry.durationSeconds]) {
    if (
      dimension !== undefined &&
      (typeof dimension !== "number" || !Number.isFinite(dimension) || dimension <= 0)
    ) {
      throw new ProjectPackageError("INVALID_MANIFEST", `Asset ${entry.id} has invalid metrics.`);
    }
  }
}

function validateSourceEntry(value: unknown): asserts value is PackageSourceStateEntry {
  if (!isRecord(value)) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      "A package source-document entry is invalid.",
    );
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || !isSafeId(entry.id)) {
    throw new ProjectPackageError("INVALID_MANIFEST", "A source-document ID is invalid.");
  }
  if (entry.path !== `source-states/${entry.id}`) {
    throw new ProjectPackageError("UNSAFE_ENTRY", `Source ${entry.id} has an invalid path.`);
  }
  if (!SOURCE_TOOLS.has(entry.tool as SourceToolId)) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      `Source ${entry.id} has an unknown tool.`,
    );
  }
  if (
    typeof entry.toolStateVersion !== "string" ||
    typeof entry.mimeType !== "string" ||
    typeof entry.revision !== "number" ||
    !Number.isInteger(entry.revision) ||
    entry.revision < 1 ||
    typeof entry.byteLength !== "number" ||
    entry.byteLength <= 0 ||
    entry.byteLength > MAX_PACKAGE_ENTRY_BYTES ||
    typeof entry.contentHash !== "string" ||
    !isHash(entry.contentHash) ||
    (entry.label !== undefined && typeof entry.label !== "string")
  ) {
    throw new ProjectPackageError(
      "INVALID_MANIFEST",
      `Source ${entry.id} metadata is invalid.`,
    );
  }
}

function validatePackageReferences(
  project: StudioProject,
  assets: Map<string, { entry: PackageAssetEntry }>,
  sources: Map<string, { entry: PackageSourceStateEntry; bytes: Uint8Array }>,
): void {
  const requiredAssets = new Set<string>();
  for (const asset of project.assets) requiredAssets.add(asset.id);
  for (const layer of project.layers) {
    if (layer.rendered?.assetId) requiredAssets.add(layer.rendered.assetId);
    if (layer.poster?.assetId) requiredAssets.add(layer.poster.assetId);
    if (layer.mask?.assetId) requiredAssets.add(layer.mask.assetId);
    if (layer.sourceState && !sources.has(layer.sourceState.id)) {
      throw new ProjectPackageError(
        "MISSING_SOURCE_STATE",
        `Layer “${layer.name}” references source state ${layer.sourceState.id}, which is not in the package.`,
      );
    }
    if (layer.sourceState) {
      const entry = sources.get(layer.sourceState.id)!.entry;
      if (
        entry.tool !== layer.sourceState.tool ||
        entry.toolStateVersion !== layer.sourceState.toolStateVersion ||
        entry.mimeType !== layer.sourceState.mimeType
      ) {
        throw new ProjectPackageError(
          "INVALID_MANIFEST",
          `Source state ${entry.id} does not match the layer reference.`,
        );
      }
    }
  }
  for (const artboard of project.artboards) {
    if (artboard.background.assetId) requiredAssets.add(artboard.background.assetId);
  }
  for (const id of requiredAssets) {
    if (!assets.has(id)) {
      throw new ProjectPackageError(
        "MISSING_ASSET",
        `The project references asset ${id}, which is not in the package.`,
      );
    }
  }
  for (const { bytes, entry } of sources.values()) {
    if (!/json|text|svg/.test(entry.mimeType)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      continue;
    }
    const referenced = new Set<string>();
    collectAssetIds(parsed, referenced);
    for (const id of referenced) {
      if (!assets.has(id)) {
        throw new ProjectPackageError(
          "MISSING_ASSET",
          `Source document ${entry.id} references asset ${id}, which is not in the package.`,
        );
      }
    }
  }
}

function rewriteProjectReferences(
  project: StudioProject,
  assets: Map<string, AssetReference>,
  sources: Map<string, ToolSourceStateReference>,
): StudioProject {
  const mergedAssets = new Map<string, AssetReference>();
  for (const asset of project.assets) {
    const imported = assets.get(asset.id);
    if (imported) mergedAssets.set(asset.id, imported);
  }
  for (const [id, imported] of assets) {
    if (!mergedAssets.has(id)) mergedAssets.set(id, imported);
  }

  const rewriteRendered = (
    reference: RenderedAssetReference | null | undefined,
  ): RenderedAssetReference | null | undefined => {
    if (!reference?.assetId) return reference;
    const imported = assets.get(reference.assetId);
    if (!imported) return reference;
    return {
      ...reference,
      assetId: imported.id,
      storage: imported.storage,
      contentHash: imported.contentHash ?? reference.contentHash,
      mimeType: reference.mimeType || imported.mimeType,
    };
  };

  const layers: SharedLayer[] = project.layers.map((layer) => ({
    ...layer,
    rendered: rewriteRendered(layer.rendered) ?? null,
    ...(layer.poster !== undefined ? { poster: rewriteRendered(layer.poster) ?? null } : {}),
    sourceState: layer.sourceState
      ? sources.get(layer.sourceState.id) ?? layer.sourceState
      : null,
  }));

  const artboards: Artboard[] = project.artboards.map((artboard) => ({
    ...artboard,
    background:
      artboard.background.kind === "asset" && artboard.background.assetId
        ? {
            ...artboard.background,
            assetId: assets.get(artboard.background.assetId)?.id ?? artboard.background.assetId,
          }
        : artboard.background,
  }));

  return {
    ...project,
    artboards,
    layers,
    assets: Array.from(mergedAssets.values()).sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

function resolveAssetReference(
  project: StudioProject,
  assetId: string,
): AssetReference | null {
  const direct = project.assets.find((asset) => asset.id === assetId);
  if (direct) return direct;
  for (const layer of project.layers) {
    if (layer.rendered?.assetId === assetId) {
      return {
        id: assetId,
        kind: layer.rendered.kind === "svg" ? "vector" : "rendered-image",
        name: layer.name,
        mimeType: layer.rendered.mimeType,
        storage:
          layer.rendered.storage ?? {
            backend: "indexeddb",
            database: ASSET_DB_NAME,
            objectStore: ASSET_STORE,
            key: assetId,
          },
        width: layer.rendered.width,
        height: layer.rendered.height,
        contentHash: layer.rendered.contentHash,
        createdAt: layer.metadata.createdAt,
        sourceTool: layer.sourceTool,
      };
    }
    if (layer.poster?.assetId === assetId) {
      return {
        id: assetId,
        kind: "rendered-image",
        name: layer.name,
        mimeType: layer.poster.mimeType,
        storage:
          layer.poster.storage ?? {
            backend: "indexeddb",
            database: ASSET_DB_NAME,
            objectStore: ASSET_STORE,
            key: assetId,
          },
        width: layer.poster.width,
        height: layer.poster.height,
        contentHash: layer.poster.contentHash,
        createdAt: layer.metadata.createdAt,
        sourceTool: layer.sourceTool,
      };
    }
  }
  return null;
}

function addReferenceAsset(set: Set<string>, reference: RenderedAssetReference | null | undefined): void {
  if (reference?.assetId) set.add(reference.assetId);
}

function collectAssetIdsFromSourceState(
  payload: ToolSourceStatePayload,
  tool: SourceToolId | undefined,
  target: Set<string>,
): void {
  if (!/json|text|svg/.test(payload.mimeType)) return;
  const text =
    typeof payload.content === "string"
      ? payload.content
      : new TextDecoder().decode(payload.content);
  try {
    collectAssetIds(JSON.parse(text), target);
  } catch {
    // A source tool may store a non-JSON text document; no asset links to scan.
  }
  if (tool === "bend") {
    // BEND's package is a first-class asset even when the JSON parser failed.
    const match = text.match(/"assetId"\s*:\s*"(asset_[A-Za-z0-9_-]+)"/);
    if (match?.[1]) target.add(match[1]);
  }
}

function collectAssetIds(value: unknown, target: Set<string>): void {
  if (typeof value === "string") {
    if (/^asset_[A-Za-z0-9_-]{6,}$/.test(value)) target.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetIds(item, target);
    return;
  }
  if (!isRecord(value)) return;
  for (const item of Object.values(value)) collectAssetIds(item, target);
}

function validatePackagePath(name: string): void {
  if (
    name.length === 0 ||
    name.length > 260 ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith("/") ||
    name.includes("//")
  ) {
    throw new ProjectPackageError("UNSAFE_ENTRY", `Unsafe package path: ${name}`);
  }
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new ProjectPackageError("UNSAFE_ENTRY", `Unsafe package path: ${name}`);
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
    throw new ProjectPackageError("UNSAFE_ENTRY", `Unsafe package path: ${name}`);
  }
  const allowed =
    name === "manifest.json" ||
    name === "project.json" ||
    name === "README.txt" ||
    name.startsWith("assets/") ||
    name.startsWith("source-states/");
  if (!allowed) {
    throw new ProjectPackageError("UNSAFE_ENTRY", `Unexpected package entry: ${name}`);
  }
}

function declaredUncompressedSize(file: JSZip.JSZipObject): number | null {
  const data = (file as unknown as { _data?: { uncompressedSize?: number } })._data;
  return typeof data?.uncompressedSize === "number" ? data.uncompressedSize : null;
}

async function readBoundedEntry(
  zip: JSZip,
  path: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const file = zip.files[path];
  if (!file || file.dir) {
    throw new ProjectPackageError("MISSING_ENTRY", `The package is missing ${path}.`);
  }
  const bytes = await file.async("uint8array");
  if (bytes.byteLength > maxBytes) {
    throw new ProjectPackageError(
      "TOO_LARGE",
      `The package entry ${path} is larger than its allowed limit.`,
    );
  }
  return bytes;
}

function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

function isHash(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function packageReadme(project: StudioProject): string {
  return [
    `Studio 2.0 project package: ${project.name}`,
    `Exported: ${nowIso()}`,
    "",
    "Contents:",
    "- project.json: the complete Studio project document.",
    "- assets/: rendered artwork, source media, masks and BEND packages.",
    "- source-states/: editable native documents for Image, Vector, Type, Shapes, Generate and BEND.",
    "- manifest.json: package format/version, entry paths, SHA-256 hashes and limits.",
    "",
    "Import this ZIP with Studio's Project menu. Studio validates every hash before",
    "writing anything. It never overwrites an existing project with the same ID.",
    "",
    "This is editable project state, not a flattened PNG export.",
    "",
  ].join("\n");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ProjectPackageError("ABORTED", "The project package operation was cancelled.");
  }
}
