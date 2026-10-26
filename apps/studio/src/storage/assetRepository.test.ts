import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createStudioProject } from "../project/defaultProject";
import {
  AssetIntegrityError,
  AssetRepository,
  MissingAssetError,
} from "./assetRepository";
import { ObjectUrlRegistry } from "./objectUrls";

const svgBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#236F72"/></svg>',
);

describe("AssetRepository", () => {
  it("stores and retrieves binary assets with content integrity", async () => {
    const repo = new AssetRepository(new IDBFactory());
    const reference = await repo.putAsset({
      bytes: svgBytes,
      kind: "vector",
      name: "Artwork",
      mimeType: "image/svg+xml",
      sourceTool: "vector",
      width: 100,
      height: 100,
    });

    expect(reference.storage.backend).toBe("indexeddb");
    expect(reference.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const loaded = await repo.getAsset(reference.id);
    expect(new TextDecoder().decode(loaded.bytes)).toContain("#236F72");
    expect(loaded.reference.contentHash).toBe(reference.contentHash);
    repo.close();
  });

  it("deduplicates identical asset content", async () => {
    const repo = new AssetRepository(new IDBFactory());
    const input = {
      bytes: svgBytes,
      kind: "vector" as const,
      name: "Artwork",
      mimeType: "image/svg+xml",
      sourceTool: "vector" as const,
      width: 100,
      height: 100,
    };
    const first = await repo.putAsset(input);
    const second = await repo.putAsset({ ...input, name: "Same artwork" });
    expect(second.id).toBe(first.id);
    repo.close();
  });

  it("stores independent source-state revisions and keeps old revisions readable", async () => {
    const repo = new AssetRepository(new IDBFactory());
    const first = await repo.putSourceState({
      tool: "vector",
      toolStateVersion: "1.0.0",
      mimeType: "application/vnd.studio.vector+json",
      content: JSON.stringify({ seed: 1 }),
      revision: 1,
    });
    const second = await repo.putSourceState({
      tool: "vector",
      toolStateVersion: "1.0.0",
      mimeType: "application/vnd.studio.vector+json",
      content: JSON.stringify({ seed: 2 }),
      revision: 2,
    });

    expect(second.id).not.toBe(first.id);
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect((await repo.getSourceState(first)).content).toBe('{"seed":1}');
    expect((await repo.getSourceState(second)).content).toBe('{"seed":2}');
    repo.close();
  });

  it("reports missing assets and source states without throwing", async () => {
    const repo = new AssetRepository(new IDBFactory());
    const project = createStudioProject({ id: "project_missing" });
    project.layers.push({
      id: "layer_missing",
      name: "Missing",
      kind: "vector",
      sourceTool: "vector",
      artboardId: project.artboards[0].id,
      order: 0,
      rendered: {
        kind: "svg",
        mimeType: "image/svg+xml",
        assetId: "asset_missing",
      },
      sourceState: {
        id: "source_missing",
        tool: "vector",
        toolStateVersion: "1.0.0",
        mimeType: "application/vnd.studio.vector+json",
        storage: {
          backend: "indexeddb",
          database: "studio-assets",
          objectStore: "source-states",
          key: "source_missing",
        },
        updatedAt: new Date().toISOString(),
        revision: 1,
        contentHash: "0".repeat(64),
      },
      transform: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotationDegrees: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        flipHorizontal: false,
        flipVertical: false,
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      mask: null,
      clipToArtboard: true,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    project.artboards[0].layerOrder = ["layer_missing"];

    const report = await repo.inspectProjectAssets(project);
    expect(report.missingAssetIds).toEqual(["asset_missing"]);
    expect(report.missingSourceStateIds).toEqual(["source_missing"]);
    expect(report.integrityErrors).toEqual([]);
    await expect(repo.getAssetBytes("asset_missing")).rejects.toBeInstanceOf(
      MissingAssetError,
    );
    repo.close();
  });

  it("detects corrupted source state content", async () => {
    const factory = new IDBFactory();
    const repo = new AssetRepository(factory);
    const reference = await repo.putSourceState({
      tool: "vector",
      toolStateVersion: "1.0.0",
      mimeType: "application/vnd.studio.vector+json",
      content: JSON.stringify({ seed: 3 }),
      revision: 1,
    });
    repo.close();

    await new Promise<void>((resolve, reject) => {
      const request = factory.open("studio-assets", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("source-states", "readwrite");
        const store = tx.objectStore("source-states");
        const storageKey = reference.storage.backend === "indexeddb"
          ? reference.storage.key
          : reference.id;
        const get = store.get(storageKey);
        get.onsuccess = () => {
          const record = get.result;
          record.bytes = new TextEncoder().encode('{"seed":999}');
          store.put(record);
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const reopened = new AssetRepository(factory);
    await expect(reopened.getSourceState(reference)).rejects.toBeInstanceOf(
      AssetIntegrityError,
    );
    reopened.close();
  });
});

describe("ObjectUrlRegistry", () => {
  it("creates one URL per key and revokes it after the last release", () => {
    const registry = new ObjectUrlRegistry();
    const blob = new Blob([svgBytes], { type: "image/svg+xml" });
    const first = registry.acquire("asset_1", blob);
    const second = registry.acquire("asset_1", blob);
    expect(second).toBe(first);
    registry.release("asset_1");
    expect(registry.has("asset_1")).toBe(true);
    registry.release("asset_1");
    expect(registry.has("asset_1")).toBe(false);
    registry.dispose();
  });
});
