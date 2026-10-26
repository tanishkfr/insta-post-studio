import { describe, expect, it } from "vitest";
import { createStudioProject } from "../project/defaultProject";
import { createBendVideoLayer } from "../adapters/session/layerFactory";
import { createProjectStore } from "./projectStore";

function setup() {
  const project = createStudioProject({
    id: "project_bend_test",
    name: "BEND test",
    formatId: "instagram-4-5",
  });
  const store = createProjectStore(project);
  const sourceState = {
    id: "source_bend_1",
    tool: "bend" as const,
    toolStateVersion: "1.0.0",
    mimeType: "application/vnd.studio.bend+json",
    storage: {
      backend: "indexeddb" as const,
      database: "studio-assets",
      objectStore: "source-states",
      key: "source_bend_1",
    },
    updatedAt: "2026-10-27T00:00:00.000Z",
    revision: 1,
    contentHash: "a".repeat(64),
  };
  const videoAsset = {
    id: "asset_video",
    kind: "video" as const,
    name: "bend.mp4",
    mimeType: "video/mp4",
    storage: {
      backend: "indexeddb" as const,
      database: "studio-assets",
      objectStore: "assets",
      key: "asset_video",
    },
    byteSize: 100,
    width: 720,
    height: 900,
    durationSeconds: 3,
    contentHash: "b".repeat(64),
    createdAt: "2026-10-27T00:00:00.000Z",
    sourceTool: "bend" as const,
  };
  const posterAsset = {
    ...videoAsset,
    id: "asset_poster",
    kind: "rendered-image" as const,
    name: "bend-cover.png",
    mimeType: "image/png",
    width: 1080,
    height: 1350,
  };
  const layer = createBendVideoLayer({
    project,
    artboardId: project.artboards[0].id,
    capture: {
      sourceState,
      rendered: {
        kind: "video",
        mimeType: "video/mp4",
        assetId: videoAsset.id,
        storage: videoAsset.storage,
        width: 720,
        height: 900,
        durationSeconds: 3,
        contentHash: videoAsset.contentHash,
      },
      poster: {
        kind: "image",
        mimeType: "image/png",
        assetId: posterAsset.id,
        storage: posterAsset.storage,
        width: 1080,
        height: 1350,
        contentHash: posterAsset.contentHash,
      },
      temporal: {
        kind: "video",
        durationSeconds: 3,
        frameRate: 30,
        playback: "loop",
        audio: "muted",
        preview: true,
        container: "mp4",
        codec: "avc",
        audioPresent: false,
        bendSequenceId: "project-bend",
      },
      suggestedName: "BEND · 4:5",
      tags: ["bend", "temporal"],
    },
  });
  store.getState().addLayer(layer, [videoAsset, posterAsset]);
  return { store, layer, videoAsset, posterAsset, sourceState };
}

describe("BEND host layer store", () => {
  it("creates one video layer with a poster, temporal metadata and no kind widening", () => {
    const { store, layer } = setup();
    const stored = store.getState().project.layers[0];
    expect(stored.kind).toBe("video");
    expect(stored.sourceTool).toBe("bend");
    expect(stored.poster?.assetId).toBe("asset_poster");
    expect(stored.temporal).toMatchObject({
      kind: "video",
      durationSeconds: 3,
      frameRate: 30,
      audio: "muted",
      preview: true,
    });
    expect(stored.transform.width).toBe(1080);
    expect(stored.transform.height).toBe(1350);
    expect(layer.id).toBe(stored.id);
  });

  it("updates the same layer identity while retaining host transform/visibility/stacking", () => {
    const { store, layer, videoAsset, posterAsset, sourceState } = setup();
    store.getState().updateLayer(layer.id, {
      visible: false,
      opacity: 0.65,
      transform: { ...layer.transform, x: 42, y: 18, width: 640, height: 800 },
    });
    const before = store.getState().project.layers.find((candidate) => candidate.id === layer.id)!;
    store.getState().applyLayerArtwork({
      layerId: layer.id,
      sourceState: { ...sourceState, revision: 2, id: "source_bend_2" },
      rendered: {
        kind: "video",
        mimeType: "video/mp4",
        assetId: "asset_video_2",
        storage: videoAsset.storage,
        width: 1080,
        height: 1350,
        durationSeconds: 4,
      },
      renderedAsset: { ...videoAsset, id: "asset_video_2" },
      poster: {
        kind: "image",
        mimeType: "image/png",
        assetId: "asset_poster_2",
        storage: posterAsset.storage,
        width: 1080,
        height: 1350,
      },
      temporal: {
        kind: "video",
        durationSeconds: 4,
        frameRate: 30,
        playback: "loop",
        audio: "muted",
        preview: false,
        container: "mp4",
        codec: "avc",
        audioPresent: true,
      },
      tags: ["bend", "quality:final"],
    });
    const after = store.getState().project.layers.find((candidate) => candidate.id === layer.id)!;
    expect(after.id).toBe(layer.id);
    expect(after.transform).toEqual(before.transform);
    expect(after.visible).toBe(false);
    expect(after.opacity).toBe(0.65);
    expect(after.order).toBe(before.order);
    expect(after.sourceState?.revision).toBe(2);
    expect(after.poster?.assetId).toBe("asset_poster_2");
    expect(after.temporal).toMatchObject({ preview: false, durationSeconds: 4, audioPresent: true });
    expect(store.getState().project.layers).toHaveLength(1);
  });
});
