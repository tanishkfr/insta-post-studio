import { ASPECT_PRESETS } from "../engine/core/types";
import { makeId } from "../engine/core/project";
import { createBendIntegrationAdapter, getProjectVersion } from "./adapter";
import type { AspectPreset, BendProject } from "../engine/core/types";
import type { BendHostComposition, BendHostLayer, BendIntegrationAdapter, BendIntegrationProgress, BendRenderedMedia } from "./contract";
import { readEditableProjectPackage, restoreEditableProjectPackage } from "../engine/package/portableProject";
import {
  deleteHostMedia,
  listHostCompositions,
  listHostMedia,
  loadHostComposition,
  loadHostMedia,
  saveHostComposition,
  saveHostMedia,
  type StoredHostCompositionRecord,
  type StoredHostMediaRecord,
} from "../storage/indexedDb";
import {
  BendIntegrationContractError,
  HostSourceMismatchError,
  HostSourceVersionConflictError,
  HostUpdateConflictError,
} from "./errors";
import { assertValidHostComposition, assertValidRenderedMedia } from "./validation";

export const MOCK_HOST_COMPOSITION_ID = "bend-mock-instagram-composition";

export function createMockHostComposition(aspect: AspectPreset = "4:5"): BendHostComposition {
  const dimensions = ASPECT_PRESETS[aspect];
  return {
    integrationVersion: 1,
    id: MOCK_HOST_COMPOSITION_ID,
    aspect,
    width: dimensions.width,
    height: dimensions.height,
    duration: 8,
    layers: [],
    foreground: { id: "foreground-note", text: "foreground / host layer", x: 72, y: 82, scale: 1 },
    updatedAt: Date.now(),
  };
}

export function updateHostAspect(composition: BendHostComposition, aspect: AspectPreset): BendHostComposition {
  const dimensions = ASPECT_PRESETS[aspect];
  return { ...composition, aspect, width: dimensions.width, height: dimensions.height, updatedAt: Date.now() };
}

export function createHostLayer(media: BendRenderedMedia, renderedMediaId: string, posterMediaId: string, editablePackageId: string): BendHostLayer {
  return {
    id: makeId("host-layer"),
    sourceProjectId: media.sourceProjectId,
    sourceVersion: media.sourceVersion,
    renderedMediaId,
    posterMediaId,
    editablePackageId,
    duration: media.duration,
    fps: media.fps,
    width: media.width,
    height: media.height,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    opacity: 1,
    stackingOrder: 0,
    timelineOffset: 0,
    playback: "loop",
    audioPolicy: media.audioPresent ? "source" : "muted",
    editStatus: "committed",
    renderedMimeType: media.mimeType,
    renderedCodec: media.codec ?? null,
    audioPresent: media.audioPresent,
    audioMessage: media.audioMessage,
  };
}

export async function persistHostMedia(
  id: string,
  kind: StoredHostMediaRecord["kind"],
  blob: Blob,
  metadata: Pick<StoredHostMediaRecord, "ownerLayerId" | "sourceVersion"> = {},
): Promise<void> {
  await saveHostMedia({
    id,
    kind,
    mimeType: blob.type || "application/octet-stream",
    blob,
    state: "staged",
    createdAt: Date.now(),
    ...metadata,
  });
}

/**
 * Create a new host layer from a BEND source.
 *
 * Artifacts are written under a unique revision token so a retry can never
 * overwrite the media referenced by an already-committed layer. The composition
 * record is then committed with compare-and-set; a concurrent host edit aborts
 * this request and removes only its own staged artifacts.
 */
export async function createAndPersistHostLayer(
  composition: BendHostComposition,
  project: BendProject,
  assetUrls: Record<string, string>,
  adapter: BendIntegrationAdapter = createBendIntegrationAdapter(),
  onProgress?: (progress: BendIntegrationProgress) => void,
  signal?: AbortSignal,
): Promise<BendHostComposition> {
  assertValidHostComposition(composition);
  const current = await loadHostComposition(composition.id);
  if (current && current.composition.updatedAt !== composition.updatedAt) {
    throw new HostUpdateConflictError();
  }
  const base = current?.composition ?? composition;
  const expectedRevision = current?.revision ?? 0;

  const media = await adapter.exportVideo(project, assetUrls, onProgress, signal);
  assertValidRenderedMedia(media, project);
  ensureNotAborted(signal);
  const editablePackage = await adapter.exportEditableProject(project, onProgress);
  ensureNotAborted(signal);

  const layerId = makeId("host-layer");
  const token = makeId("revision");
  const ids = revisionMediaIds(layerId, token);
  try {
    await persistMediaSet(ids, media, editablePackage.blob, layerId, media.sourceVersion, onProgress);
    ensureNotAborted(signal);
    const layer = { ...createHostLayer(media, ids.video, ids.poster, ids.package), id: layerId };
    const nextComposition: BendHostComposition = {
      ...base,
      duration: Math.max(base.duration, media.duration),
      layers: [...base.layers, layer],
      updatedAt: Date.now(),
    };
    const committed = await saveHostComposition(nextComposition, expectedRevision);
    if (!committed) throw new HostUpdateConflictError();
    return nextComposition;
  } catch (error) {
    await deleteStagedHostMedia(Object.values(ids));
    throw error;
  }
}

export async function loadHostEditSource(
  compositionId: string,
  layerId: string,
  expectedSourceVersion?: string,
): Promise<{
  composition: BendHostComposition;
  layer: BendHostLayer;
  restored: Awaited<ReturnType<typeof restoreEditableProjectPackage>>;
  sourceVersion: string;
}> {
  const record = await loadHostComposition(compositionId);
  if (!record) throw new Error("The host composition is not available locally.");
  assertValidHostComposition(record.composition);
  const layer = record.composition.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error("The selected BEND layer is no longer present in the host composition.");
  if (expectedSourceVersion && layer.sourceVersion !== expectedSourceVersion) {
    throw new HostSourceVersionConflictError(expectedSourceVersion, layer.sourceVersion);
  }
  const packageMedia = await loadHostMedia(layer.editablePackageId);
  if (!packageMedia) throw new Error("The editable BEND source package is missing from the host composition.");
  const decodedPackage = await readEditableProjectPackage(packageMedia.blob);
  const packagedSourceVersion = getProjectVersion(decodedPackage.project);
  if (packagedSourceVersion !== layer.sourceVersion) {
    throw new HostSourceMismatchError("The editable BEND package does not match this layer's committed source revision.");
  }
  const restored = await restoreEditableProjectPackage(packageMedia.blob, decodedPackage);
  return { composition: record.composition, layer, restored, sourceVersion: packagedSourceVersion };
}

/**
 * Commit an updated render for an existing host layer.
 *
 * Only BEND-owned fields are replaced. Host transform, opacity, stacking,
 * timeline offset, playback policy, audio policy, host-layer id, and unrelated
 * layers remain untouched. A failed or stale update leaves the previous
 * committed artifacts intact.
 */
export async function commitHostLayerEdit(options: {
  compositionId: string;
  layerId: string;
  project: BendProject;
  assetUrls: Record<string, string>;
  expectedSourceVersion?: string;
  adapter?: BendIntegrationAdapter;
  onProgress?: (progress: BendIntegrationProgress) => void;
  signal?: AbortSignal;
}): Promise<BendHostComposition> {
  const record = await loadHostComposition(options.compositionId);
  if (!record) throw new Error("The host composition is not available locally.");
  assertValidHostComposition(record.composition);
  const previous = record.composition.layers.find((candidate) => candidate.id === options.layerId);
  if (!previous) throw new Error("The selected BEND layer is no longer present in the host composition.");
  if (options.expectedSourceVersion && previous.sourceVersion !== options.expectedSourceVersion) {
    throw new HostSourceVersionConflictError(options.expectedSourceVersion, previous.sourceVersion);
  }

  const adapter = options.adapter ?? createBendIntegrationAdapter();
  const media = await adapter.exportVideo(options.project, options.assetUrls, options.onProgress, options.signal);
  assertValidRenderedMedia(media, options.project);
  ensureNotAborted(options.signal);
  const editablePackage = await adapter.exportEditableProject(options.project, options.onProgress);
  if (!editablePackage.blob || editablePackage.blob.size <= 0) {
    throw new BendIntegrationContractError("The editable BEND source package is empty.");
  }
  ensureNotAborted(options.signal);

  const token = makeId("revision");
  const ids = revisionMediaIds(previous.id, token);
  try {
    await persistMediaSet(ids, media, editablePackage.blob, previous.id, media.sourceVersion, options.onProgress);
    ensureNotAborted(options.signal);

    const nextLayer: BendHostLayer = {
      ...previous,
      sourceProjectId: media.sourceProjectId,
      sourceVersion: media.sourceVersion,
      renderedMediaId: ids.video,
      posterMediaId: ids.poster,
      editablePackageId: ids.package,
      duration: media.duration,
      fps: media.fps,
      width: media.width,
      height: media.height,
      renderedMimeType: media.mimeType,
      renderedCodec: media.codec ?? null,
      audioPresent: media.audioPresent,
      audioMessage: media.audioMessage,
      editStatus: "committed",
    };
    const composition: BendHostComposition = {
      ...record.composition,
      duration: Math.max(record.composition.duration, media.duration),
      layers: record.composition.layers.map((candidate) => candidate.id === previous.id ? nextLayer : candidate),
      updatedAt: Date.now(),
    };
    const committed = await saveHostComposition(composition, record.revision ?? 0);
    if (!committed) throw new HostUpdateConflictError();
    void cleanupUnreferencedHostMedia([previous.renderedMediaId, previous.posterMediaId, previous.editablePackageId]).catch(() => undefined);
    return composition;
  } catch (error) {
    await deleteStagedHostMedia(Object.values(ids));
    throw error;
  }
}

export async function loadHostVideoUrl(layer: BendHostLayer): Promise<string> {
  const media = await loadHostMedia(layer.renderedMediaId);
  if (!media) throw new Error("The rendered BEND layer media is missing from the host composition.");
  return URL.createObjectURL(media.blob);
}

export function collectHostMediaIds(compositions: Array<Pick<StoredHostCompositionRecord, "composition">>): Set<string> {
  const referenced = new Set<string>();
  for (const record of compositions) {
    for (const layer of record.composition.layers) {
      referenced.add(layer.renderedMediaId);
      referenced.add(layer.posterMediaId);
      referenced.add(layer.editablePackageId);
    }
  }
  return referenced;
}

/**
 * Delete artifacts only after checking every stored host composition. Shared
 * media, or media referenced by a layer that was not updated, is preserved.
 */
export async function cleanupUnreferencedHostMedia(ids: Iterable<string>): Promise<string[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  const compositions = await listHostCompositions();
  const referenced = collectHostMediaIds(compositions);
  const deletable = unique.filter((id) => !referenced.has(id));
  await Promise.all(deletable.map((id) => deleteHostMedia(id)));
  return deletable;
}

/**
 * Remove abandoned staged artifacts that no composition references. The age
 * threshold protects an update that is still being written in another tab.
 */
export async function sweepAbandonedHostMedia(minAgeMs = 60 * 60 * 1000, now = Date.now()): Promise<string[]> {
  const compositions = await listHostCompositions();
  const referenced = collectHostMediaIds(compositions);
  const media = await listHostMedia();
  const abandoned = media.filter((record) => {
    if (referenced.has(record.id)) return false;
    const createdAt = record.createdAt;
    return createdAt === undefined || now - createdAt >= Math.max(0, minAgeMs);
  });
  await Promise.all(abandoned.map((record) => deleteHostMedia(record.id)));
  return abandoned.map((record) => record.id);
}

function revisionMediaIds(layerId: string, token: string): { video: string; poster: string; package: string } {
  return {
    video: `host-video-${layerId}-${token}`,
    poster: `host-still-${layerId}-${token}`,
    package: `host-package-${layerId}-${token}`,
  };
}

async function persistMediaSet(
  ids: { video: string; poster: string; package: string },
  media: BendRenderedMedia,
  packageBlob: Blob,
  ownerLayerId: string,
  sourceVersion: string,
  onProgress?: (progress: BendIntegrationProgress) => void,
): Promise<void> {
  const metadata = { ownerLayerId, sourceVersion };
  onProgress?.({ phase: "storage", completed: 0, total: 3, label: "Saving host layer" });
  await persistHostMedia(ids.video, "video", media.blob, metadata);
  await persistHostMedia(ids.poster, "still", media.poster, metadata);
  await persistHostMedia(ids.package, "package", packageBlob, metadata);
  onProgress?.({ phase: "storage", completed: 3, total: 3, label: "Host layer saved" });
}

async function deleteStagedHostMedia(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteHostMedia(id).catch(() => undefined)));
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("BEND host update cancelled.", "AbortError");
}
