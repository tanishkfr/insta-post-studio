import type { AssetReference, StudioProject, ToolSourceStateReference } from "@studio/contracts";
import type { AssetRepository } from "./assetRepository";
import type { ProjectRepository } from "./projectRepository";

export interface AssetUsageRecord {
  id: string;
  kind: string;
  name: string;
  byteSize: number;
  createdAt: string;
}

export interface AssetUsageAudit {
  dryRun: true;
  scannedAt: string;
  projectsScanned: number;
  assetsScanned: number;
  sourceStatesScanned: number;
  referencedAssetIds: string[];
  missingAssetReferences: string[];
  unreferencedAssets: AssetUsageRecord[];
  referencedSourceStateIds: string[];
  missingSourceStateReferences: string[];
  unreferencedSourceStates: Array<{
    id: string;
    tool: string;
    toolStateVersion: string;
    revision: number;
    updatedAt: string;
  }>;
  totalAssetBytes: number;
  unreferencedAssetBytes: number;
  notes: string[];
}

/**
 * Conservative, read-only asset usage audit. It scans every saved project plus
 * the in-memory/current project, follows source-document asset references, and
 * reports abandoned records without deleting anything. Unknown references are
 * reported as missing, never treated as permission to delete.
 */
export async function auditAssetUsage(options: {
  projects: ProjectRepository;
  assets: AssetRepository;
  currentProject?: StudioProject;
}): Promise<AssetUsageAudit> {
  const records = await options.projects.list();
  const projects: StudioProject[] = records.map((record) => record.project);
  if (
    options.currentProject &&
    !projects.some((project) => project.id === options.currentProject!.id)
  ) {
    projects.push(options.currentProject);
  }

  const referencedAssets = new Set<string>();
  const referencedSources = new Set<string>();
  const sourceReferences = new Map<string, ToolSourceStateReference>();

  for (const project of projects) {
    for (const asset of project.assets) referencedAssets.add(asset.id);
    for (const layer of project.layers) {
      if (layer.rendered?.assetId) referencedAssets.add(layer.rendered.assetId);
      if (layer.poster?.assetId) referencedAssets.add(layer.poster.assetId);
      if (layer.mask?.assetId) referencedAssets.add(layer.mask.assetId);
      if (layer.sourceState) {
        referencedSources.add(layer.sourceState.id);
        sourceReferences.set(layer.sourceState.id, layer.sourceState);
      }
    }
    for (const artboard of project.artboards) {
      if (artboard.background.assetId) referencedAssets.add(artboard.background.assetId);
    }
  }

  const missingAssetReferences: string[] = [];
  for (const reference of sourceReferences.values()) {
    try {
      const payload = await options.assets.getSourceState(reference);
      if (!/json|text|svg/.test(payload.mimeType)) continue;
      const text =
        typeof payload.content === "string"
          ? payload.content
          : new TextDecoder().decode(payload.content);
      const parsed = JSON.parse(text) as unknown;
      collectAssetIds(parsed, referencedAssets);
    } catch {
      // A missing source document is reported below; it cannot license deletion.
    }
  }

  const storedAssets = await options.assets.listAssets();
  const storedSources = await options.assets.listSourceStates();
  const storedAssetIds = new Set(storedAssets.map((asset) => asset.id));
  const storedSourceIds = new Set(storedSources.map((source) => source.id));

  for (const id of referencedAssets) {
    if (!storedAssetIds.has(id)) missingAssetReferences.push(id);
  }
  const missingSourceStateReferences = [...referencedSources].filter(
    (id) => !storedSourceIds.has(id),
  );

  const unreferencedAssets: AssetUsageRecord[] = storedAssets
    .filter((asset) => !referencedAssets.has(asset.id))
    .map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      byteSize: asset.byteSize ?? 0,
      createdAt: asset.createdAt,
    }))
    .sort((left, right) => right.byteSize - left.byteSize);
  const unreferencedSourceStates = storedSources
    .filter((source) => !referencedSources.has(source.id))
    .map((source) => ({
      id: source.id,
      tool: source.tool,
      toolStateVersion: source.toolStateVersion,
      revision: source.revision,
      updatedAt: source.updatedAt,
    }));

  return {
    dryRun: true,
    scannedAt: new Date().toISOString(),
    projectsScanned: projects.length,
    assetsScanned: storedAssets.length,
    sourceStatesScanned: storedSources.length,
    referencedAssetIds: [...referencedAssets].sort(),
    missingAssetReferences,
    unreferencedAssets,
    referencedSourceStateIds: [...referencedSources].sort(),
    missingSourceStateReferences,
    unreferencedSourceStates,
    totalAssetBytes: storedAssets.reduce(
      (total, asset) => total + (asset.byteSize ?? 0),
      0,
    ),
    unreferencedAssetBytes: unreferencedAssets.reduce(
      (total, asset) => total + asset.byteSize,
      0,
    ),
    notes: [
      "Dry run only. No asset, source document or project was deleted.",
      "Every saved project in this browser is scanned, including the current project.",
      "Persisted undo history is not stored in IndexedDB; the current project snapshot is included.",
      "An asset used only by an in-flight editor session may appear unreferenced until it is published.",
      "A missing reference is reported, not treated as permission to delete other records.",
    ],
  };
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
  if (typeof value !== "object" || value === null) return;
  for (const item of Object.values(value as Record<string, unknown>)) {
    collectAssetIds(item, target);
  }
}
