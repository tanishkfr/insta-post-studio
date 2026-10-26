import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../../src/engine/core/project";
import type { BendProject } from "../../src/engine/core/types";
import type { StoredHostCompositionRecord, StoredHostMediaRecord } from "../../src/storage/indexedDb";
import type { BendHostComposition, BendIntegrationAdapter, BendRenderedMedia } from "../../src/integration/contract";

const storage = vi.hoisted(() => ({
  compositions: new Map<string, StoredHostCompositionRecord>(),
  media: new Map<string, StoredHostMediaRecord>(),
  failSave: false,
  failMediaSave: false,
  failMediaKind: null as StoredHostMediaRecord["kind"] | null,
}));

vi.mock("../../src/storage/indexedDb", async () => {
  const actual = await vi.importActual<typeof import("../../src/storage/indexedDb")>("../../src/storage/indexedDb");
  return {
    ...actual,
    loadHostComposition: async (id: string) => {
      const record = storage.compositions.get(id);
      return record ? structuredClone(record) : null;
    },
    listHostCompositions: async () => [...storage.compositions.values()].map((record) => structuredClone(record)),
    saveHostComposition: async (composition: BendHostComposition, expectedRevision?: number) => {
      if (storage.failSave) throw new Error("host quota");
      const current = storage.compositions.get(composition.id);
      const currentRevision = current?.revision ?? 0;
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) return false;
      storage.compositions.set(composition.id, {
        id: composition.id,
        savedAt: Date.now(),
        revision: currentRevision + 1,
        composition: structuredClone(composition),
      });
      return true;
    },
    saveHostMedia: async (media: StoredHostMediaRecord) => {
      if (storage.failMediaSave || storage.failMediaKind === media.kind) throw new Error("media quota");
      storage.media.set(media.id, media);
    },
    loadHostMedia: async (id: string) => storage.media.get(id) ?? null,
    listHostMedia: async () => [...storage.media.values()],
    deleteHostMedia: async (id: string) => {
      storage.media.delete(id);
    },
  };
});

import { getProjectVersion } from "../../src/integration/adapter";
import {
  collectHostMediaIds,
  commitHostLayerEdit,
  createAndPersistHostLayer,
  createHostLayer,
  createMockHostComposition,
  loadHostEditSource,
  sweepAbandonedHostMedia,
} from "../../src/integration/host";
import { HostSourceVersionConflictError, HostUpdateConflictError } from "../../src/integration/errors";

function makeProject(name = "Host source"): BendProject {
  const project = createProject("4:5", name);
  project.canvas = { ...project.canvas, duration: 2 };
  project.timeline = { inPoint: 0, outPoint: 2 };
  return project;
}

function makeMedia(version: string, projectId = "host-project"): BendRenderedMedia {
  return {
    kind: "video",
    blob: new Blob([`video-${version}`], { type: "video/webm" }),
    poster: new Blob([`poster-${version}`], { type: "image/png" }),
    width: 720,
    height: 900,
    fps: 30,
    duration: 2,
    aspectRatio: 0.8,
    mimeType: "video/webm",
    container: "webm",
    codec: "vp8",
    audioPresent: false,
    sourceProjectId: projectId,
    sourceVersion: version,
  };
}

function makeAdapter(version: string, projectId = "host-project"): BendIntegrationAdapter {
  return {
    exportVideo: vi.fn(async () => makeMedia(version, projectId)),
    exportStill: vi.fn(async () => { throw new Error("unused"); }),
    exportEditableProject: vi.fn(async () => ({ blob: new Blob([`package-${version}`]), byteLength: version.length + 8 })),
  };
}

function seedMedia(id: string, kind: StoredHostMediaRecord["kind"], createdAt = 1000): void {
  storage.media.set(id, {
    id,
    kind,
    mimeType: kind === "still" ? "image/png" : kind === "package" ? "application/octet-stream" : "video/webm",
    blob: new Blob([id]),
    createdAt,
    state: "committed",
  });
}

function seedComposition(composition: BendHostComposition, revision = 1): void {
  storage.compositions.set(composition.id, { id: composition.id, savedAt: 1000, revision, composition: structuredClone(composition) });
}

function seedCommittedLayer(projectVersion: string): { composition: BendHostComposition; layer: ReturnType<typeof createHostLayer> } {
  const composition = createMockHostComposition();
  const layer = createHostLayer(makeMedia(projectVersion), "old-video", "old-poster", "old-package");
  seedComposition({ ...composition, layers: [layer] });
  seedMedia("old-video", "video");
  seedMedia("old-poster", "still");
  seedMedia("old-package", "package");
  return { composition, layer };
}

describe("host revision persistence", () => {
  beforeEach(() => {
    storage.compositions.clear();
    storage.media.clear();
    storage.failSave = false;
    storage.failMediaSave = false;
    storage.failMediaKind = null;
  });

  it("removes staged media when a new host composition cannot be committed", async () => {
    const composition = createMockHostComposition();
    const project = makeProject();
    storage.failSave = true;

    await expect(createAndPersistHostLayer(composition, project, {}, makeAdapter(getProjectVersion(project), project.id))).rejects.toThrow("host quota");
    expect(storage.compositions.has(composition.id)).toBe(false);
    expect(storage.media.size).toBe(0);
  });

  it("refuses to add a layer to a host composition changed in another context", async () => {
    const composition = createMockHostComposition();
    const project = makeProject();
    seedComposition({ ...composition, updatedAt: composition.updatedAt + 1 });

    await expect(createAndPersistHostLayer(composition, project, {}, makeAdapter(getProjectVersion(project), project.id))).rejects.toBeInstanceOf(HostUpdateConflictError);
    expect(storage.media.size).toBe(0);
  });

  it("preserves the previous committed revision on failure and cleans it after success", async () => {
    const project = makeProject();
    const version = getProjectVersion(project);
    const { composition, layer: previous } = seedCommittedLayer(version);
    const committed = structuredClone(storage.compositions.get(composition.id)!.composition);
    storage.failSave = true;

    await expect(commitHostLayerEdit({ compositionId: composition.id, layerId: previous.id, project, assetUrls: {}, adapter: makeAdapter(version, project.id) })).rejects.toThrow("host quota");
    expect(storage.compositions.get(composition.id)?.composition).toEqual(committed);
    expect(storage.media.has("old-video")).toBe(true);
    expect(storage.media.has("old-poster")).toBe(true);
    expect(storage.media.has("old-package")).toBe(true);
    expect(storage.media.size).toBe(3);

    storage.failSave = false;
    const updated = await commitHostLayerEdit({ compositionId: composition.id, layerId: previous.id, project, assetUrls: {}, adapter: makeAdapter(version, project.id) });
    const nextLayer = updated.layers[0];
    expect(nextLayer?.sourceVersion).toBe(version);
    expect(nextLayer?.transform).toEqual(previous.transform);
    expect(updated.foreground).toEqual(committed.foreground);
    expect(storage.media.has("old-video")).toBe(false);
    expect(storage.media.has("old-poster")).toBe(false);
    expect(storage.media.has("old-package")).toBe(false);
    expect(storage.media.size).toBe(3);
  });

  it("rejects a stale source revision before rendering anything", async () => {
    const project = makeProject();
    const { composition, layer } = seedCommittedLayer(getProjectVersion(project));
    const adapter = makeAdapter(getProjectVersion(project), project.id);

    await expect(commitHostLayerEdit({
      compositionId: composition.id,
      layerId: layer.id,
      project,
      assetUrls: {},
      expectedSourceVersion: "stale-version",
      adapter,
    })).rejects.toBeInstanceOf(HostSourceVersionConflictError);
    expect(adapter.exportVideo).not.toHaveBeenCalled();
    expect(storage.media.size).toBe(3);
  });

  it("never overwrites committed artifacts when the same source revision is retried", async () => {
    const project = makeProject();
    const version = getProjectVersion(project);
    const { composition, layer } = seedCommittedLayer(version);
    storage.failSave = true;

    await expect(commitHostLayerEdit({
      compositionId: composition.id,
      layerId: layer.id,
      project,
      assetUrls: {},
      expectedSourceVersion: version,
      adapter: makeAdapter(version, project.id),
    })).rejects.toThrow("host quota");

    expect(storage.media.get("old-video")?.blob.size).toBeGreaterThan(0);
    expect(storage.media.has("old-poster")).toBe(true);
    expect(storage.media.has("old-package")).toBe(true);
    expect(storage.media.size).toBe(3);
  });

  it("aborts a stale composition commit and removes only its staged artifacts", async () => {
    const project = makeProject();
    const version = getProjectVersion(project);
    const { composition, layer } = seedCommittedLayer(version);
    const adapter = makeAdapter(version, project.id);
    adapter.exportVideo = vi.fn(async () => {
      const current = storage.compositions.get(composition.id);
      if (current) {
        storage.compositions.set(composition.id, {
          ...current,
          revision: (current.revision ?? 0) + 1,
          composition: { ...current.composition, updatedAt: current.composition.updatedAt + 1 },
        });
      }
      return makeMedia(version, project.id);
    });

    await expect(commitHostLayerEdit({
      compositionId: composition.id,
      layerId: layer.id,
      project,
      assetUrls: {},
      expectedSourceVersion: version,
      adapter,
    })).rejects.toBeInstanceOf(HostUpdateConflictError);

    expect(storage.media.has("old-video")).toBe(true);
    expect(storage.media.has("old-poster")).toBe(true);
    expect(storage.media.has("old-package")).toBe(true);
    expect(storage.media.size).toBe(3);
  });

  it("preserves every host-owned property during an update", async () => {
    const project = makeProject();
    const version = getProjectVersion(project);
    const composition = createMockHostComposition();
    const previous = {
      ...createHostLayer(makeMedia(version), "old-video", "old-poster", "old-package"),
      transform: { x: 120, y: -80, scale: 1.25, rotation: 12 },
      opacity: 0.72,
      stackingOrder: 3,
      timelineOffset: 1.5,
      playback: "hold-last-frame" as const,
      audioPolicy: "muted" as const,
    };
    const unrelated = createHostLayer(makeMedia("unrelated"), "u-video", "u-poster", "u-package");
    seedComposition({ ...composition, layers: [previous, unrelated] });
    ["old-video", "old-poster", "old-package", "u-video", "u-poster", "u-package"].forEach((id) => seedMedia(id, id.includes("poster") ? "still" : id.includes("package") ? "package" : "video"));

    const updated = await commitHostLayerEdit({ compositionId: composition.id, layerId: previous.id, project, assetUrls: {}, adapter: makeAdapter(version, project.id) });
    const next = updated.layers.find((layer) => layer.id === previous.id);
    expect(next).toMatchObject({
      id: previous.id,
      transform: previous.transform,
      opacity: previous.opacity,
      stackingOrder: previous.stackingOrder,
      timelineOffset: previous.timelineOffset,
      playback: previous.playback,
      audioPolicy: previous.audioPolicy,
    });
    expect(updated.layers.find((layer) => layer.id === unrelated.id)).toEqual(unrelated);
    expect(updated.foreground).toEqual(composition.foreground);
  });

  it("does not delete media that another host layer still references", async () => {
    const project = makeProject();
    const version = getProjectVersion(project);
    const composition = createMockHostComposition();
    const shared = createHostLayer(makeMedia(version), "shared-video", "shared-poster", "shared-package");
    const other = { ...createHostLayer(makeMedia(version), "shared-video", "shared-poster", "shared-package"), id: "other-layer" };
    seedComposition({ ...composition, layers: [shared, other] });
    seedMedia("shared-video", "video");
    seedMedia("shared-poster", "still");
    seedMedia("shared-package", "package");

    await commitHostLayerEdit({ compositionId: composition.id, layerId: shared.id, project, assetUrls: {}, adapter: makeAdapter(version, project.id) });
    expect(storage.media.has("shared-video")).toBe(true);
    expect(storage.media.has("shared-poster")).toBe(true);
    expect(storage.media.has("shared-package")).toBe(true);
    expect(collectHostMediaIds([...storage.compositions.values()])).toContain("shared-video");
  });

  it.each(["video", "still", "package"] as const)("rolls back every staged artifact when %s storage fails", async (kind) => {
    const project = makeProject();
    const version = getProjectVersion(project);
    const { composition, layer } = seedCommittedLayer(version);
    storage.failMediaKind = kind;

    await expect(commitHostLayerEdit({
      compositionId: composition.id,
      layerId: layer.id,
      project,
      assetUrls: {},
      adapter: makeAdapter(version, project.id),
    })).rejects.toThrow("media quota");

    expect(storage.compositions.get(composition.id)?.revision).toBe(1);
    expect(storage.media.has("old-video")).toBe(true);
    expect(storage.media.has("old-poster")).toBe(true);
    expect(storage.media.has("old-package")).toBe(true);
    expect(storage.media.size).toBe(3);
  });

  it("reports a missing editable package instead of opening a partial layer", async () => {
    const project = makeProject();
    const { composition, layer } = seedCommittedLayer(getProjectVersion(project));
    storage.media.delete("old-package");

    await expect(loadHostEditSource(composition.id, layer.id, layer.sourceVersion)).rejects.toThrow("editable BEND source package is missing");
  });

  it("removes only old, unreferenced media during cleanup", async () => {
    const composition = createMockHostComposition();
    const layer = createHostLayer(makeMedia("v"), "keep-video", "keep-poster", "keep-package");
    seedComposition({ ...composition, layers: [layer] });
    seedMedia("keep-video", "video");
    seedMedia("keep-poster", "still");
    seedMedia("keep-package", "package");
    seedMedia("old-orphan", "video", 1000);
    seedMedia("new-orphan", "video", 9000);

    const removed = await sweepAbandonedHostMedia(5000, 10000);
    expect(removed).toEqual(["old-orphan"]);
    expect(storage.media.has("new-orphan")).toBe(true);
    expect(storage.media.has("keep-video")).toBe(true);
  });
});
