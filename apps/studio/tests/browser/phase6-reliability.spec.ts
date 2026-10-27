import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";
import {
  openVector,
  publishVector,
  readAssetRecords,
  readNewestProject,
  waitForStudio,
} from "./studio-helpers";
import { makePng, readPngSize } from "../fixtures/png";

interface SeedAsset {
  id: string;
  base64: string;
  mimeType: string;
  kind: string;
  width: number;
  height: number;
  sourceTool?: string;
}

interface SeedLayerInput {
  id: string;
  name: string;
  kind?: string;
  sourceTool?: string;
  assetId?: string;
  renderKind?: "image" | "svg";
  maskAssetId?: string;
  transform?: Record<string, unknown>;
}

async function seedProject(
  page: Page,
  project: Record<string, unknown>,
  assets: SeedAsset[],
): Promise<void> {
  await page.evaluate(
    async ({ project: seededProject, assets: seededAssets }) => {
      const toBytes = (base64: string): Uint8Array => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      };
      const hash = async (bytes: Uint8Array): Promise<string> => {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        );
        return [...new Uint8Array(digest)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      };
      const open = (name: string, upgrade?: (database: IDBDatabase) => void) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => upgrade?.(request.result);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const finish = (transaction: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });

      const assetDb = await open("studio-assets", (database) => {
        for (const storeName of ["assets", "source-states"]) {
          if (!database.objectStoreNames.contains(storeName)) {
            const store = database.createObjectStore(storeName, { keyPath: "id" });
            store.createIndex("byContentHash", "contentHash");
            store.createIndex("byDedupeKey", "dedupeKey");
          }
        }
      });
      const timestamp = new Date().toISOString();
      const transaction = assetDb.transaction("assets", "readwrite");
      const store = transaction.objectStore("assets");
      for (const asset of seededAssets) {
        const bytes = toBytes(asset.base64);
        const contentHash = await hash(bytes);
        store.put({
          id: asset.id,
          bytes,
          contentHash,
          dedupeKey: [contentHash, asset.kind, asset.mimeType, asset.sourceTool ?? "image"].join("|"),
          kind: asset.kind,
          name: `${asset.id}.bin`,
          mimeType: asset.mimeType,
          sourceTool: asset.sourceTool ?? "image",
          width: asset.width,
          height: asset.height,
          createdAt: timestamp,
        });
      }
      await finish(transaction);
      assetDb.close();

      const projectDb = await open("studio-projects", (database) => {
        if (!database.objectStoreNames.contains("projects")) {
          const databaseStore = database.createObjectStore("projects", { keyPath: "id" });
          databaseStore.createIndex("bySavedAt", "savedAt");
        }
      });
      const projectTransaction = projectDb.transaction("projects", "readwrite");
      projectTransaction.objectStore("projects").put({
        id: seededProject.id,
        revision: 1,
        savedAt: new Date(Date.now() + 5_000).toISOString(),
        schemaVersion: 1,
        project: seededProject,
      });
      await finish(projectTransaction);
      projectDb.close();
    },
    { project, assets },
  );
  await waitForStudio(page);
}

function layerTransform(
  width: number,
  height: number,
  x: number,
  y: number,
  overrides: Record<string, number> = {},
): Record<string, unknown> {
  return {
    x,
    y,
    width,
    height,
    scaleX: 1,
    scaleY: 1,
    rotationDegrees: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    flipHorizontal: false,
    flipVertical: false,
    ...overrides,
  };
}

function buildProject(options: {
  id?: string;
  name?: string;
  width: number;
  height: number;
  background?: Record<string, unknown>;
  layers: SeedLayerInput[];
  assets?: SeedAsset[];
  formatId?: string;
  formatLabel?: string;
  aspectRatio?: number;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  const artboardId = "artboard_reliability";
  const layers = options.layers.map((layer, index) => ({
    id: layer.id,
    name: layer.name,
    kind: layer.kind ?? "image",
    sourceTool: layer.sourceTool ?? "image",
    artboardId,
    order: index,
    sourceState: null,
    rendered: layer.assetId
      ? {
          kind: layer.renderKind ?? "image",
          mimeType: layer.renderKind === "svg" ? "image/svg+xml" : "image/png",
          assetId: layer.assetId,
          width: options.width,
          height: options.height,
        }
      : null,
    poster: null,
    transform: layer.transform ?? layerTransform(options.width, options.height, 0, 0),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    mask: layer.maskAssetId
      ? { assetId: layer.maskAssetId, inverted: false, featherPixels: 0 }
      : null,
    clipToArtboard: true,
    metadata: { createdAt: now, updatedAt: now },
  }));
  const assets = (options.assets ?? []).map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    name: `${asset.id}.bin`,
    mimeType: asset.mimeType,
    storage: {
      backend: "indexeddb",
      database: "studio-assets",
      objectStore: "assets",
      key: asset.id,
    },
    byteSize: 1,
    width: asset.width,
    height: asset.height,
    createdAt: now,
    sourceTool: asset.sourceTool ?? "image",
  }));
  return {
    id: options.id ?? "project_reliability",
    name: options.name ?? "Reliability Test",
    schemaVersion: 1,
    format: {
      id: options.formatId ?? "instagram-square",
      label: options.formatLabel ?? "Instagram 1:1",
      width: options.width,
      height: options.height,
      unit: "px",
      aspectRatio: options.aspectRatio ?? options.width / options.height,
      orientation: options.width === options.height ? "square" : "portrait",
    },
    artboards: [
      {
        id: artboardId,
        name: "Artboard 01",
        index: 0,
        width: options.width,
        height: options.height,
        background: options.background ?? { kind: "solid", color: "#ffffff" },
        layerOrder: layers.map((layer) => layer.id),
      },
    ],
    layers,
    assets,
    layerOrder: layers.map((layer) => layer.id),
    metadata: {
      createdAt: now,
      updatedAt: now,
      appVersion: "0.2.0",
      tags: [],
      sourceProjects: [],
    },
  };
}

async function expectNoDownload(page: Page): Promise<void> {
  await page.waitForTimeout(800);
  expect(downloads).toHaveLength(0);
}

const downloads: string[] = [];

test.beforeEach(async ({ page }) => {
  downloads.length = 0;
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
});

const validPng = solidPng(400, 400, [30, 120, 200, 255]);

test("a missing rendered asset fails the export instead of producing an incomplete PNG", async ({
  page,
}) => {
  await waitForStudio(page);
  const project = buildProject({
    width: 1080,
    height: 1080,
    layers: [
      {
        id: "layer_missing",
        name: "Missing artwork",
        assetId: "asset_missing",
        transform: layerTransform(400, 400, 340, 340),
      },
    ],
    assets: [],
  });
  await seedProject(page, project, []);
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-start").click();
  await expect(page.getByTestId("export-error")).toContainText(/missing from local storage/i, {
    timeout: 30_000,
  });
  await expectNoDownload(page);
  const current = await readNewestProject(page);
  expect((current!.project.layers as unknown[]).length).toBe(1);
});

test("a missing mask stops the export instead of silently unmasking the layer", async ({
  page,
}) => {
  await waitForStudio(page);
  const project = buildProject({
    width: 1080,
    height: 1080,
    layers: [
      {
        id: "layer_masked",
        name: "Masked artwork",
        assetId: "asset_purple",
        maskAssetId: "asset_missing_mask",
        transform: layerTransform(400, 400, 340, 340),
      },
    ],
    assets: [{ ...validPng, id: "asset_purple", sourceTool: "image" }],
  });
  await seedProject(page, project, [{ ...validPng, id: "asset_purple", sourceTool: "image" }]);
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-start").click();
  await expect(page.getByTestId("export-error")).toContainText(/mask.*missing|missing.*mask/i, {
    timeout: 30_000,
  });
  await expectNoDownload(page);
});

test("a corrupt SVG asset produces a clear export error and keeps the project", async ({ page }) => {
  await waitForStudio(page);
  const brokenSvg = {
    id: "asset_broken_svg",
    base64: Buffer.from("this is not an SVG document").toString("base64"),
    mimeType: "image/svg+xml",
    kind: "vector",
    width: 1080,
    height: 1080,
    sourceTool: "vector",
  };
  const project = buildProject({
    width: 1080,
    height: 1080,
    layers: [
      {
        id: "layer_broken_svg",
        name: "Broken vector",
        sourceTool: "vector",
        assetId: "asset_broken_svg",
        renderKind: "svg",
        transform: layerTransform(1080, 1080, 0, 0),
      },
    ],
    assets: [brokenSvg],
  });
  await seedProject(page, project, [brokenSvg]);
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-start").click();
  await expect(page.getByTestId("export-error")).toContainText(
    /SVG|could not be decoded|Vector/i,
    { timeout: 30_000 },
  );
  await expectNoDownload(page);
  const current = await readNewestProject(page);
  expect((current!.project.layers as unknown[]).length).toBe(1);
});

test("cancelling a multi-artboard ZIP export downloads nothing and leaves the project intact", async ({
  page,
}) => {
  await waitForStudio(page);
  const now = new Date().toISOString();
  const dot = solidPng(200, 200, [20, 140, 100, 255]);
  const asset = {
    id: "asset_dot",
    base64: dot.base64,
    mimeType: dot.mimeType,
    kind: "rendered-image",
    width: 200,
    height: 200,
    sourceTool: "image",
  };
  const artboards = Array.from({ length: 40 }, (_, index) => ({
    id: `artboard_bulk_${index}`,
    name: `Slide ${String(index + 1).padStart(2, "0")}`,
    index,
    width: 1080,
    height: 1350,
    background: { kind: "solid", color: "#ffffff" },
    layerOrder: [`layer_bulk_${index}`],
  }));
  const layers = artboards.map((artboard, index) => ({
    id: `layer_bulk_${index}`,
    name: `Dot ${index + 1}`,
    kind: "image",
    sourceTool: "image",
    artboardId: artboard.id,
    order: 0,
    sourceState: null,
    rendered: {
      kind: "image",
      mimeType: "image/png",
      assetId: "asset_dot",
      width: 200,
      height: 200,
    },
    poster: null,
    transform: layerTransform(200, 200, 440, 575),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    mask: null,
    clipToArtboard: true,
    metadata: { createdAt: now, updatedAt: now },
  }));
  const project = {
    id: "project_bulk",
    name: "Bulk Carousel",
    schemaVersion: 1,
    format: {
      id: "instagram-4-5",
      label: "Instagram 4:5",
      width: 1080,
      height: 1350,
      unit: "px",
      aspectRatio: 0.8,
      orientation: "portrait",
    },
    artboards,
    layers,
    assets: [
      {
        id: "asset_dot",
        kind: "rendered-image",
        name: "dot.png",
        mimeType: "image/png",
        storage: {
          backend: "indexeddb",
          database: "studio-assets",
          objectStore: "assets",
          key: "asset_dot",
        },
        width: 200,
        height: 200,
        createdAt: now,
        sourceTool: "image",
      },
    ],
    layerOrder: layers.map((layer) => layer.id),
    metadata: {
      createdAt: now,
      updatedAt: now,
      appVersion: "0.2.0",
      tags: [],
      sourceProjects: [],
    },
  };
  await seedProject(page, project, [asset]);
  await expect(page.locator(".artboard-tab")).toHaveCount(40);
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-scope-all").check();
  await page.getByTestId("export-start").click();
  await expect(page.getByTestId("export-cancel")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("export-cancel").click();
  await expect(page.getByText(/Export cancelled/)).toBeVisible({ timeout: 30_000 });
  await expectNoDownload(page);
  const current = await readNewestProject(page);
  expect((current!.project.artboards as unknown[]).length).toBe(40);
});

test("a storage-quota failure during import leaves the current project unchanged", async ({
  page,
}) => {
  await waitForStudio(page);
  const before = await readNewestProject(page);
  const packageBytes = await buildMinimalPackage();

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { __restoreProjectPut: () => void }).__restoreProjectPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...argumentsList: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "projects") {
        throw new DOMException("Simulated quota failure", "QuotaExceededError");
      }
      return original.apply(this, argumentsList);
    };
  });

  await page.getByTestId("open-project-data").click();
  await page.getByTestId("import-project-package-input").setInputFiles({
    name: "quota.zip",
    mimeType: "application/zip",
    buffer: packageBytes,
  });
  await expect(page.getByTestId("project-package-error")).toContainText(
    /existing project was not changed|quota|project could not be saved/i,
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    (window as unknown as { __restoreProjectPut?: () => void }).__restoreProjectPut?.();
  });
  const after = await readNewestProject(page);
  expect(after!.id).toBe(before!.id);
  expect((after!.project.layers as unknown[]).length).toBe(0);

  await page.getByTestId("import-project-package-input").setInputFiles({
    name: "quota.zip",
    mimeType: "application/zip",
    buffer: packageBytes,
  });
  await expect(page.getByTestId("project-package-success")).toContainText("Project imported", {
    timeout: 60_000,
  });
  const imported = await readNewestProject(page);
  expect(imported!.id).not.toBe(before!.id);
  expect((imported!.project.layers as unknown[]).length).toBe(1);
});

test("the asset audit reports abandoned records without deleting them", async ({ page }) => {
  await waitForStudio(page);
  await openVector(page);
  await publishVector(page);
  const orphan = solidPng(120, 120, [200, 20, 20, 255]);
  await page.evaluate(
    async (asset) => {
      const binary = atob(asset.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const digest = await crypto.subtle.digest(
        "SHA-256",
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
      const contentHash = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("studio-assets", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("assets", "readwrite");
      transaction.objectStore("assets").put({
        id: "asset_orphan_audit",
        bytes,
        contentHash,
        dedupeKey: `${contentHash}|rendered-image|image/png|image|120|120`,
        kind: "rendered-image",
        name: "orphan.png",
        mimeType: "image/png",
        sourceTool: "image",
        width: 120,
        height: 120,
        createdAt: new Date().toISOString(),
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { base64: orphan.base64 },
  );

  await page.getByTestId("open-project-data").click();
  await page.getByTestId("run-asset-audit").click();
  const result = page.getByTestId("asset-audit-result");
  await expect(result).toBeVisible();
  const unreferenced = result.locator("dl > div", { hasText: "Unreferenced assets" });
  await expect(unreferenced.locator("dd")).toHaveText("1");
  await expect(result).toContainText("orphan.png");
  await expect(result).toContainText("Dry run only");
  expect((await readAssetRecords(page)).some((asset) => asset.id === "asset_orphan_audit")).toBe(
    true,
  );
});

test("a stale second tab cannot overwrite a newer project revision", async ({ page }) => {
  await waitForStudio(page);
  const second = await page.context().newPage();
  await waitForStudio(second);

  await page.getByRole("textbox", { name: "Project name" }).fill("Tab One");
  await page.getByRole("textbox", { name: "Project name" }).blur();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  await second.getByRole("textbox", { name: "Project name" }).fill("Tab Two");
  await second.getByRole("textbox", { name: "Project name" }).blur();
  await expect(second.locator(".storage-banner")).toContainText("Project save failed", {
    timeout: 30_000,
  });

  const durable = await readNewestProject(page);
  expect(durable!.project.name).toBe("Tab One");
  await second.reload();
  await expect(second.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Tab One",
    { timeout: 20_000 },
  );
  await second.close();
});

function solidPng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): { base64: string; mimeType: string; kind: string; width: number; height: number } {
  return {
    base64: makePng({ width, height, pixel: () => rgba }).toString("base64"),
    mimeType: "image/png",
    kind: "rendered-image",
    width,
    height,
  };
}

async function buildMinimalPackage(): Promise<Buffer> {
  const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
  const png = makePng({
    width: 200,
    height: 200,
    pixel() {
      return [12, 140, 200, 255];
    },
  });
  const now = new Date().toISOString();
  const assetId = "asset_min_package";
  const project = {
    id: "project_min_package",
    name: "Minimal portable project",
    schemaVersion: 1,
    format: {
      id: "instagram-square",
      label: "Instagram 1:1",
      width: 1080,
      height: 1080,
      unit: "px",
      aspectRatio: 1,
      orientation: "square",
    },
    artboards: [
      {
        id: "artboard_min_package",
        name: "Artboard 01",
        index: 0,
        width: 1080,
        height: 1080,
        background: { kind: "solid", color: "#ffffff" },
        layerOrder: ["layer_min_package"],
      },
    ],
    layers: [
      {
        id: "layer_min_package",
        name: "Portable square",
        kind: "image",
        sourceTool: "image",
        artboardId: "artboard_min_package",
        order: 0,
        sourceState: null,
        rendered: {
          kind: "image",
          mimeType: "image/png",
          assetId,
          width: 200,
          height: 200,
        },
        poster: null,
        transform: layerTransform(200, 200, 440, 440),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        mask: null,
        clipToArtboard: true,
        metadata: { createdAt: now, updatedAt: now },
      },
    ],
    assets: [
      {
        id: assetId,
        kind: "rendered-image",
        name: "square.png",
        mimeType: "image/png",
        storage: {
          backend: "indexeddb",
          database: "studio-assets",
          objectStore: "assets",
          key: assetId,
        },
        byteSize: png.byteLength,
        width: 200,
        height: 200,
        contentHash: sha256(png),
        createdAt: now,
        sourceTool: "image",
      },
    ],
    layerOrder: ["layer_min_package"],
    metadata: {
      createdAt: now,
      updatedAt: now,
      appVersion: "0.2.0",
      tags: [],
      sourceProjects: [],
    },
  };
  const projectBytes = Buffer.from(JSON.stringify(project));
  const manifest = {
    format: "studio-project-package",
    formatVersion: 1,
    schemaVersion: 1,
    projectId: project.id,
    projectName: project.name,
    appVersion: "0.2.0",
    exportedAt: now,
    project: {
      path: "project.json",
      byteLength: projectBytes.byteLength,
      sha256: sha256(projectBytes),
    },
    assets: [
      {
        id: assetId,
        path: `assets/${assetId}`,
        kind: "rendered-image",
        name: "square.png",
        mimeType: "image/png",
        sourceTool: "image",
        byteLength: png.byteLength,
        contentHash: sha256(png),
        width: 200,
        height: 200,
        createdAt: now,
      },
    ],
    sourceStates: [],
    totals: { assets: 1, sourceStates: 0, uncompressedBytes: png.byteLength + projectBytes.byteLength },
    limits: {
      maxPackageBytes: 200 * 1024 * 1024,
      maxEntries: 600,
      maxEntryBytes: 80 * 1024 * 1024,
      maxTotalUncompressedBytes: 400 * 1024 * 1024,
    },
    notes: [],
  };
  const zip = new JSZip();
  zip.file("project.json", projectBytes);
  zip.file(`assets/${assetId}`, png);
  zip.file("manifest.json", JSON.stringify(manifest));
  return zip.generateAsync({ type: "nodebuffer" });
}
