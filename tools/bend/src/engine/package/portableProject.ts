import { makeId, normalizeProject } from "../core/project";
import type { BendProject, MediaAssetRecord, StoredAssetRecord } from "../core/types";
import { decodeBendPackage, createBendPackage, type BendPackageAssetInput, type DecodedBendPackage } from "./bendPackage";
import { deleteAsset, deleteProjectAndCleanup, loadAsset, loadProject, saveAsset, saveProject } from "../../storage/indexedDb";

export interface RestoredPortableProject {
  project: BendProject;
  assets: Record<string, MediaAssetRecord>;
  urls: Record<string, string>;
  warnings: string[];
  byteLength: number;
}

export async function createEditableProjectPackage(project: BendProject): Promise<{ blob: Blob; byteLength: number }> {
  const inputs: BendPackageAssetInput[] = [];
  for (const asset of Object.values(project.assets)) {
    const stored = await loadAsset(asset.id);
    if (!stored) continue;
    inputs.push({ record: asset, blob: stored.blob });
  }
  const result = await createBendPackage(project, inputs);
  return { blob: result.blob, byteLength: result.byteLength };
}

export async function restoreEditableProjectPackage(input: Blob | ArrayBuffer | Uint8Array, decodedInput?: DecodedBendPackage): Promise<RestoredPortableProject> {
  const decoded = decodedInput ?? await decodeBendPackage(input);
  const existingProject = await loadProject(decoded.project.id);
  const projectId = existingProject ? makeId("project") : decoded.project.id;
  const idMap = new Map<string, string>();
  const assets: Record<string, MediaAssetRecord> = {};
  const urls: Record<string, string> = {};
  const savedAssetIds: string[] = [];
  const warnings: string[] = [];

  try {
    for (const [sourceId, packaged] of Object.entries(decoded.assets)) {
      const current = await loadAsset(sourceId);
      if (current && await sameBlobContent(current.blob, packaged.blob)) {
        // Re-importing the same package is not a new asset revision. Reuse the
        // existing local record so host source revisions stay stable.
        assets[sourceId] = {
          ...decoded.project.assets[sourceId],
          id: sourceId,
          storageKey: current.storageKey,
          size: packaged.blob.size,
          mimeType: packaged.manifest.mimeType,
        };
        urls[sourceId] = URL.createObjectURL(packaged.blob);
        continue;
      }
      const assetId = current ? makeId("asset") : sourceId;
      idMap.set(sourceId, assetId);
      if (current) warnings.push(`Imported ${packaged.manifest.name} as a new local asset because an asset with the same source id has different content.`);
      const record: MediaAssetRecord = {
        ...decoded.project.assets[sourceId],
        id: assetId,
        storageKey: makeId("blob"),
        size: packaged.blob.size,
        mimeType: packaged.manifest.mimeType,
      };
      const stored: StoredAssetRecord = { ...record, blob: packaged.blob };
      await saveAsset(stored);
      savedAssetIds.push(assetId);
      assets[assetId] = record;
      urls[assetId] = URL.createObjectURL(packaged.blob);
    }

    const project = normalizeProject({
      ...decoded.project,
      id: projectId,
      assets: Object.fromEntries(Object.entries(decoded.project.assets).map(([sourceId, asset]) => [idMap.get(sourceId) ?? sourceId, {
        ...asset,
        id: idMap.get(sourceId) ?? sourceId,
        storageKey: assets[idMap.get(sourceId) ?? sourceId]?.storageKey ?? asset.storageKey,
      }])),
      layers: decoded.project.layers.map((layer) => layer.kind === "video" ? { ...layer, assetId: idMap.get(layer.assetId) ?? layer.assetId } : layer),
      soundtrack: decoded.project.soundtrack ? { ...decoded.project.soundtrack, assetId: idMap.get(decoded.project.soundtrack.assetId) ?? decoded.project.soundtrack.assetId } : null,
      metadata: { ...decoded.project.metadata, updatedAt: Date.now() },
    });
    await saveProject(project);
    return { project, assets, urls, warnings, byteLength: decoded.byteLength };
  } catch (error) {
    Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    await Promise.all(savedAssetIds.map((id) => deleteAsset(id).catch(() => undefined)));
    throw error;
  }
}

export async function readEditableProjectPackage(input: Blob | ArrayBuffer | Uint8Array): Promise<DecodedBendPackage> {
  return decodeBendPackage(input);
}

async function sameBlobContent(left: Blob, right: Blob): Promise<boolean> {
  if (left.size !== right.size) return false;
  const [leftBytes, rightBytes] = await Promise.all([
    new Uint8Array(await left.arrayBuffer()),
    new Uint8Array(await right.arrayBuffer()),
  ]);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  for (let index = 0; index < leftBytes.byteLength; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return false;
  }
  return true;
}

export async function deleteRestoredProject(project: BendProject): Promise<void> {
  // A restored project can share asset ids with another saved project or an
  // older history snapshot. Delete only the project, then let the conservative
  // reference scan remove assets that are truly unreachable.
  await deleteProjectAndCleanup(project.id);
}
