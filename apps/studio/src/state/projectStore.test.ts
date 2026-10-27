import type { SharedLayer, StudioProject } from "@studio/contracts";
import { createIdentityTransform } from "@studio/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createStudioProject } from "../project/defaultProject";
import { createProjectStore, synchronizeLayerOrder } from "./projectStore";

function makeLayer(project: StudioProject, name: string): SharedLayer {
  const artboard = project.artboards[0];
  return {
    id: `layer_${name.toLowerCase().replace(/\s+/g, "_")}`,
    name,
    kind: "vector",
    sourceTool: "vector",
    artboardId: artboard.id,
    order: 0,
    sourceState: null,
    rendered: null,
    transform: createIdentityTransform(400, 400),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    mask: null,
    clipToArtboard: true,
    metadata: {
      createdAt: "2026-10-26T00:00:00.000Z",
      updatedAt: "2026-10-26T00:00:00.000Z",
    },
  };
}

describe("project store", () => {
  let project: StudioProject;

  beforeEach(() => {
    project = createStudioProject({
      id: "project_test",
      name: "Test project",
      formatId: "instagram-4-5",
    });
  });

  it("keeps artboard order, layer.order and project.layerOrder in sync", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "One"));
    store.getState().addLayer(makeLayer(store.getState().project, "Two"));

    const state = store.getState();
    const artboard = state.project.artboards[0];
    expect(artboard.layerOrder).toHaveLength(2);
    expect(artboard.layerOrder).toEqual(state.project.layerOrder);
    expect(
      state.project.layers
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((layer) => layer.name),
    ).toEqual(["One", "Two"]);
  });

  it("repairs a stale layer order during synchronization", () => {
    const layer = makeLayer(project, "Orphaned");
    const stale: StudioProject = {
      ...project,
      layers: [{ ...layer, order: 9 }],
      artboards: [{ ...project.artboards[0], layerOrder: [] }],
      layerOrder: [],
    };
    const repaired = synchronizeLayerOrder(stale);

    expect(repaired.artboards[0].layerOrder).toEqual([layer.id]);
    expect(repaired.layerOrder).toEqual([layer.id]);
    expect(repaired.layers[0].order).toBe(0);
  });

  it("supports transforms, visibility, lock and opacity with undo/redo", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "Artwork"));
    const layerId = store.getState().selectedLayerId!;

    store.getState().updateLayer(layerId, {
      visible: false,
      locked: true,
      opacity: 0.42,
      transform: {
        ...store.getState().project.layers[0].transform,
        x: 120,
        y: 80,
        width: 620,
        height: 620,
        rotationDegrees: 15,
      },
    });

    let layer = store.getState().project.layers[0];
    expect(layer.visible).toBe(false);
    expect(layer.locked).toBe(true);
    expect(layer.opacity).toBe(0.42);
    expect(layer.transform.x).toBe(120);
    expect(store.getState().past).toHaveLength(2);

    store.getState().undo();
    layer = store.getState().project.layers[0];
    expect(layer.visible).toBe(true);
    expect(layer.transform.x).toBe(0);

    store.getState().redo();
    layer = store.getState().project.layers[0];
    expect(layer.visible).toBe(false);
    expect(layer.transform.rotationDegrees).toBe(15);
  });

  it("duplicates and deletes layers without breaking order or references", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "Base"));
    const sourceId = store.getState().selectedLayerId!;
    const duplicateId = store.getState().duplicateLayer(sourceId);

    expect(duplicateId).toBeTruthy();
    expect(store.getState().project.layers).toHaveLength(2);
    expect(store.getState().project.artboards[0].layerOrder).toEqual([
      sourceId,
      duplicateId,
    ]);
    expect(store.getState().selectedLayerId).toBe(duplicateId);

    store.getState().deleteLayer(sourceId);
    expect(store.getState().project.layers).toHaveLength(1);
    expect(store.getState().project.artboards[0].layerOrder).toEqual([duplicateId]);
    expect(store.getState().project.layerOrder).toEqual([duplicateId]);
  });

  it("reorders from the visual stack and restores order through undo", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "Bottom"));
    const bottomId = store.getState().selectedLayerId!;
    store.getState().addLayer(makeLayer(store.getState().project, "Top"));
    const topId = store.getState().selectedLayerId!;

    expect(store.getState().project.layerOrder).toEqual([bottomId, topId]);
    store.getState().moveLayer(topId, "down");
    expect(store.getState().project.layerOrder).toEqual([topId, bottomId]);
    expect(store.getState().project.artboards[0].layerOrder).toEqual([topId, bottomId]);

    store.getState().undo();
    expect(store.getState().project.layerOrder).toEqual([bottomId, topId]);
  });

  it("updates format globally and resizes the artboard", () => {
    const store = createProjectStore(project);
    store.getState().setFormat("instagram-story");
    expect(store.getState().project.format.id).toBe("instagram-story");
    expect(store.getState().project.format.width).toBe(1080);
    expect(store.getState().project.format.height).toBe(1920);
    expect(store.getState().project.artboards[0].height).toBe(1920);
  });

  it("updates layer artwork in one commit and keeps the layer identity/transform", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "Artwork"));
    const layer = store.getState().project.layers[0];
    const originalTransform = structuredClone(layer.transform);
    const sourceState = {
      id: "source_1",
      tool: "vector" as const,
      toolStateVersion: "1.0.0",
      mimeType: "application/vnd.studio.vector+json",
      storage: {
        backend: "indexeddb" as const,
        database: "studio-assets",
        objectStore: "source-states",
        key: "source_1",
      },
      updatedAt: "2026-10-26T00:00:00.000Z",
      revision: 1,
    };
    const rendered = {
      kind: "svg" as const,
      mimeType: "image/svg+xml",
      assetId: "asset_1",
    };
    const storeStateBefore = store.getState().past.length;

    store.getState().applyLayerArtwork({
      layerId: layer.id,
      sourceState,
      rendered,
      renderedAsset: {
        id: "asset_1",
        kind: "vector",
        name: "Vector artwork",
        mimeType: "image/svg+xml",
        storage: {
          backend: "indexeddb",
          database: "studio-assets",
          objectStore: "assets",
          key: "asset_1",
        },
        createdAt: "2026-10-26T00:00:00.000Z",
        sourceTool: "vector",
      },
    });

    const updated = store.getState().project.layers[0];
    expect(updated.id).toBe(layer.id);
    expect(updated.transform).toEqual(originalTransform);
    expect(updated.sourceState?.revision).toBe(1);
    expect(updated.rendered?.assetId).toBe("asset_1");
    expect(store.getState().project.assets).toHaveLength(1);
    expect(store.getState().past.length).toBe(storeStateBefore + 1);
  });

  it("derives tool version from source state and replaces namespaced mode tags", () => {
    const store = createProjectStore(project);
    const layer = makeLayer(project, "Type artwork");
    layer.kind = "typography";
    layer.sourceTool = "typography";
    layer.metadata.tags = ["typography", "type-mode:library", "custom"];
    store.getState().addLayer(layer);
    const sourceState = {
      id: "source_type",
      tool: "typography" as const,
      toolStateVersion: "1.0.0",
      mimeType: "application/vnd.studio.typography+json",
      storage: {
        backend: "indexeddb" as const,
        database: "studio-assets",
        objectStore: "source-states",
        key: "source_type",
      },
      updatedAt: "2026-10-26T00:00:00.000Z",
      revision: 2,
    };
    store.getState().applyLayerArtwork({
      layerId: layer.id,
      sourceState,
      rendered: {
        kind: "image",
        mimeType: "image/png",
        assetId: "asset_type",
      },
      renderedAsset: {
        id: "asset_type",
        kind: "rendered-image",
        name: "type.png",
        mimeType: "image/png",
        storage: {
          backend: "indexeddb",
          database: "studio-assets",
          objectStore: "assets",
          key: "asset_type",
        },
        createdAt: "2026-10-26T00:00:00.000Z",
        sourceTool: "typography",
      },
      sourceAssets: [
        {
          id: "asset_photo",
          kind: "source-image",
          name: "photo.png",
          mimeType: "image/png",
          storage: {
            backend: "indexeddb",
            database: "studio-assets",
            objectStore: "assets",
            key: "asset_photo",
          },
          createdAt: "2026-10-26T00:00:00.000Z",
          sourceTool: "image",
        },
      ],
      tags: ["typography", "phase-2", "type-mode:custom"],
    });
    const updated = store.getState().project.layers.find((item) => item.id === layer.id)!;
    expect(updated.metadata.toolVersion).toBe("typography@1.0.0");
    expect(updated.metadata.tags).toContain("type-mode:custom");
    expect(updated.metadata.tags).not.toContain("type-mode:library");
    expect(updated.metadata.tags).toContain("custom");
    expect(store.getState().project.assets.map((asset) => asset.id)).toEqual(
      expect.arrayContaining(["asset_type", "asset_photo"]),
    );
  });

  it("rolls back a failed publish commit without leaving a duplicate layer", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "Existing"));
    const before = store.getState().project;
    const beforePast = store.getState().past.length;
    store.getState().addLayer(makeLayer(store.getState().project, "Pending"));
    expect(store.getState().project.layers).toHaveLength(2);
    store.getState().rollbackLastCommit();
    expect(store.getState().project).toEqual(before);
    expect(store.getState().project.layers).toHaveLength(1);
    expect(store.getState().past).toHaveLength(beforePast);
    expect(store.getState().future).toHaveLength(0);
  });

  it("adds generated backgrounds behind existing layers in one commit", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "Foreground"));
    const background = makeLayer(store.getState().project, "Background");
    background.kind = "generated-layout";
    background.sourceTool = "generate";
    store.getState().addLayer(background, [], { position: "back" });
    expect(store.getState().project.artboards[0].layerOrder).toEqual([
      background.id,
      "layer_foreground",
    ]);
  });

  it("applies a Generate layout as one undoable action and never moves locked layers", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "Headline"));
    const headlineId = store.getState().selectedLayerId!;
    store.getState().addLayer(makeLayer(store.getState().project, "Locked"));
    const lockedId = store.getState().selectedLayerId!;
    store.getState().updateLayer(lockedId, { locked: true });
    const before = store.getState().project.layers.map((layer) => ({
      id: layer.id,
      transform: structuredClone(layer.transform),
    }));
    const pastBefore = store.getState().past.length;

    const applied = store.getState().applyGeneratedLayout(project.artboards[0].id, [
      {
        hostLayerId: headlineId,
        centerXPercent: 50,
        centerYPercent: 30,
        widthPercent: 60,
        aspectHOverW: 0.5,
        rotationDegrees: -4,
      },
      {
        hostLayerId: lockedId,
        centerXPercent: 20,
        centerYPercent: 80,
        widthPercent: 30,
        aspectHOverW: 1,
        rotationDegrees: 12,
      },
    ]);

    expect(applied).toBe(1);
    expect(store.getState().past.length).toBe(pastBefore + 1);
    const headline = store.getState().project.layers.find((layer) => layer.id === headlineId)!;
    expect(headline.transform.rotationDegrees).toBe(-4);
    expect(headline.transform.width).toBe(648);
    expect(headline.transform.height).toBe(324);
    const locked = store.getState().project.layers.find((layer) => layer.id === lockedId)!;
    expect(locked.transform).toEqual(
      before.find((layer) => layer.id === lockedId)!.transform,
    );

    store.getState().undo();
    expect(
      store.getState().project.layers.find((layer) => layer.id === headlineId)!.transform,
    ).toEqual(before.find((layer) => layer.id === headlineId)!.transform);
  });

  it("creates, duplicates, renames, reorders and deletes artboards with independent layer graphs", () => {
    const store = createProjectStore(project);
    store.getState().addLayer(makeLayer(project, "One"));
    const firstArtboardId = store.getState().project.artboards[0].id;

    const secondArtboardId = store.getState().addArtboard();
    expect(store.getState().activeArtboardId).toBe(secondArtboardId);
    expect(store.getState().project.artboards).toHaveLength(2);

    const secondLayer = {
      ...makeLayer(store.getState().project, "Two"),
      artboardId: secondArtboardId,
    };
    store.getState().addLayer(secondLayer);
    const firstArtboard = store
      .getState()
      .project.artboards.find((artboard) => artboard.id === firstArtboardId)!;
    const secondArtboard = store
      .getState()
      .project.artboards.find((artboard) => artboard.id === secondArtboardId)!;
    expect(firstArtboard.layerOrder).toHaveLength(1);
    expect(secondArtboard.layerOrder).toHaveLength(1);

    const copyId = store.getState().duplicateArtboard(secondArtboardId)!;
    expect(copyId).toBeTruthy();
    expect(store.getState().activeArtboardId).toBe(copyId);
    expect(store.getState().project.artboards).toHaveLength(3);
    const copy = store
      .getState()
      .project.artboards.find((artboard) => artboard.id === copyId)!;
    expect(copy.layerOrder).toHaveLength(1);
    expect(copy.layerOrder).not.toEqual(secondArtboard.layerOrder);
    const copiedLayers = store
      .getState()
      .project.layers.filter((layer) => layer.artboardId === copyId);
    expect(copiedLayers).toHaveLength(1);
    expect(copiedLayers.every((layer) => layer.artboardId === copyId)).toBe(true);

    store.getState().renameArtboard(copyId, "Carousel slide");
    expect(
      store.getState().project.artboards.find((artboard) => artboard.id === copyId)!.name,
    ).toBe("Carousel slide");

    store.getState().reorderArtboard(copyId, "left");
    const ordered = store
      .getState()
      .project.artboards.slice()
      .sort((left, right) => left.index - right.index)
      .map((artboard) => artboard.name);
    expect(ordered[1]).toBe("Carousel slide");

    expect(store.getState().deleteArtboard(copyId)).toBe(true);
    expect(store.getState().project.artboards).toHaveLength(2);
    expect(
      store.getState().project.layers.every((layer) => layer.artboardId !== copyId),
    ).toBe(true);
    expect(store.getState().deleteArtboard(secondArtboardId)).toBe(true);
    expect(store.getState().project.artboards).toHaveLength(1);
    expect(store.getState().deleteArtboard(firstArtboardId)).toBe(false);
  });
});
