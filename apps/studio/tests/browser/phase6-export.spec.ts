import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";
import { waitForStudio } from "./studio-helpers";
import { makePng, readPngSize } from "../fixtures/png";
import { inspectPng } from "../../src/adapters/image/rasterValidation";

async function captureDownload(page: Page, action: () => Promise<void>): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    action(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("Download did not produce a local file.");
  return readFileSync(path);
}

async function samplePixels(
  page: Page,
  png: Buffer,
  points: Array<[number, number]>,
): Promise<Array<[number, number, number, number]>> {
  return page.evaluate(
    async ({ base64, points: requested }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return requested.map(([x, y]) => {
        const data = context.getImageData(x, y, 1, 1).data;
        return [data[0], data[1], data[2], data[3]] as [number, number, number, number];
      });
    },
    { base64: png.toString("base64"), points },
  );
}

async function countTransparentPixels(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 255) count += 1;
    }
    return count;
  }, png.toString("base64"));
}

function solidPng(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  return makePng({ width, height, pixel: () => rgba });
}

test("composition export renders the real stack at native resolution and exports all artboards", async ({
  page,
}) => {
  await waitForStudio(page);

  const red = solidPng(1080, 1350, [220, 30, 30, 255]).toString("base64");
  const blue = solidPng(400, 400, [0, 0, 255, 255]).toString("base64");
  const green = solidPng(400, 400, [0, 255, 0, 255]).toString("base64");
  const yellow = solidPng(200, 200, [255, 220, 0, 255]).toString("base64");
  const purple = solidPng(200, 200, [180, 0, 200, 255]).toString("base64");
  const circle = makePng({
    width: 200,
    height: 200,
    pixel(x, y) {
      const dx = (x - 100) / 80;
      const dy = (y - 100) / 80;
      return dx * dx + dy * dy <= 1 ? [0, 140, 80, 255] : [0, 0, 0, 0];
    },
  }).toString("base64");

  const mask = makePng({
    width: 1080,
    height: 1350,
    pixel(x) {
      return x < 540 ? [255, 255, 255, 255] : [0, 0, 0, 0];
    },
  }).toString("base64");

  await page.evaluate(
    async ({
      red,
      blue,
      green,
      yellow,
      purple,
      circle,
      mask,
    }: Record<string, string>) => {
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
      const assetInputs = [
        { id: "asset_phase6_red", kind: "rendered-image", width: 1080, height: 1350, base64: red, sourceTool: "image" },
        { id: "asset_phase6_blue", kind: "rendered-image", width: 400, height: 400, base64: blue, sourceTool: "image" },
        { id: "asset_phase6_green", kind: "rendered-image", width: 400, height: 400, base64: green, sourceTool: "image" },
        { id: "asset_phase6_yellow", kind: "rendered-image", width: 200, height: 200, base64: yellow, sourceTool: "bend" },
        { id: "asset_phase6_purple", kind: "rendered-image", width: 200, height: 200, base64: purple, sourceTool: "image" },
        { id: "asset_phase6_circle", kind: "rendered-image", width: 200, height: 200, base64: circle, sourceTool: "shapes" },
        { id: "asset_phase6_mask", kind: "other", width: 1080, height: 1350, base64: mask, sourceTool: "image" },
      ] as Array<{
        id: string;
        kind: string;
        width: number;
        height: number;
        base64: string;
        sourceTool: string;
      }>;

      const references: Array<Record<string, unknown>> = [];
      const assetTransaction = assetDb.transaction("assets", "readwrite");
      const store = assetTransaction.objectStore("assets");
      for (const input of assetInputs) {
        const bytes = toBytes(input.base64);
        const contentHash = await hash(bytes);
        const dedupeKey = [contentHash, input.kind, "image/png", input.sourceTool, input.width, input.height].join("|");
        store.put({
          id: input.id,
          bytes,
          contentHash,
          dedupeKey,
          kind: input.kind,
          name: `${input.id}.png`,
          mimeType: "image/png",
          sourceTool: input.sourceTool,
          width: input.width,
          height: input.height,
          createdAt: timestamp,
        });
        references.push({
          id: input.id,
          kind: input.kind,
          name: `${input.id}.png`,
          mimeType: "image/png",
          storage: {
            backend: "indexeddb",
            database: "studio-assets",
            objectStore: "assets",
            key: input.id,
          },
          byteSize: bytes.byteLength,
          width: input.width,
          height: input.height,
          contentHash,
          createdAt: timestamp,
          sourceTool: input.sourceTool,
        });
      }
      await finish(assetTransaction);
      assetDb.close();

      const transform = (x: number, y: number, width: number, height: number) => ({
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
      });
      const rendered = (assetId: string, width: number, height: number, kind = "image") => ({
        kind,
        mimeType: "image/png",
        assetId,
        storage: {
          backend: "indexeddb",
          database: "studio-assets",
          objectStore: "assets",
          key: assetId,
        },
        width,
        height,
      });
      const artboardId = "artboard_phase6_one";
      const transparencyArtboardId = "artboard_phase6_two";
      const layerBase = (id: string, artboard: string, order: number, extra: Record<string, unknown>) => ({
        id,
        name: id,
        kind: "image",
        sourceTool: "image",
        artboardId: artboard,
        order,
        sourceState: null,
        rendered: null,
        poster: null,
        transform: transform(0, 0, 100, 100),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        mask: null,
        clipToArtboard: true,
        metadata: { createdAt: timestamp, updatedAt: timestamp },
        ...extra,
      });

      const layers = [
        layerBase("layer_phase6_red", artboardId, 0, {
          name: "Red background",
          rendered: rendered("asset_phase6_red", 1080, 1350),
          transform: transform(0, 0, 1080, 1350),
        }),
        layerBase("layer_phase6_blue", artboardId, 1, {
          name: "Blue square",
          rendered: rendered("asset_phase6_blue", 400, 400),
          transform: transform(100, 100, 400, 400),
        }),
        layerBase("layer_phase6_green", artboardId, 2, {
          name: "Green overlay",
          rendered: rendered("asset_phase6_green", 400, 400),
          transform: transform(300, 300, 400, 400),
          opacity: 0.5,
        }),
        layerBase("layer_phase6_video", artboardId, 3, {
          name: "BEND poster",
          kind: "video",
          sourceTool: "bend",
          rendered: rendered("asset_phase6_yellow", 200, 200),
          poster: rendered("asset_phase6_yellow", 200, 200),
          transform: transform(700, 900, 200, 200),
          temporal: {
            kind: "video",
            durationSeconds: 3,
            frameRate: 30,
            audioPresent: true,
            audio: "muted",
            container: "mp4",
            codec: "avc1.42001f",
            preview: false,
          },
        }),
        layerBase("layer_phase6_masked", artboardId, 4, {
          name: "Masked purple",
          rendered: rendered("asset_phase6_purple", 200, 200),
          transform: transform(480, 1100, 200, 200),
          mask: { assetId: "asset_phase6_mask", inverted: false, featherPixels: 0 },
        }),
        layerBase("layer_phase6_circle", transparencyArtboardId, 0, {
          name: "Transparent circle",
          sourceTool: "shapes",
          rendered: rendered("asset_phase6_circle", 200, 200),
          transform: transform(440, 575, 200, 200),
        }),
      ];

      const now = new Date().toISOString();
      const project = {
        id: "project_phase6_export_seed",
        name: "Phase 6 Export Seed",
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
        artboards: [
          {
            id: artboardId,
            name: "Artboard 01",
            index: 0,
            width: 1080,
            height: 1350,
            background: { kind: "solid", color: "#ffffff" },
            layerOrder: layers.filter((layer) => layer.artboardId === artboardId).map((layer) => layer.id),
          },
          {
            id: transparencyArtboardId,
            name: "Transparent overlay",
            index: 1,
            width: 1080,
            height: 1350,
            background: { kind: "transparent" },
            layerOrder: layers
              .filter((layer) => layer.artboardId === transparencyArtboardId)
              .map((layer) => layer.id),
          },
        ],
        layers,
        assets: references,
        layerOrder: layers.map((layer) => layer.id),
        metadata: {
          createdAt: now,
          updatedAt: now,
          appVersion: "0.2.0",
          tags: ["phase-6-test"],
          sourceProjects: [],
        },
      };

      const projectDb = await open("studio-projects", (database) => {
        if (!database.objectStoreNames.contains("projects")) {
          const store = database.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("bySavedAt", "savedAt");
        }
      });
      const projectTransaction = projectDb.transaction("projects", "readwrite");
      projectTransaction.objectStore("projects").put({
        id: project.id,
        revision: 1,
        savedAt: new Date(Date.now() + 5_000).toISOString(),
        schemaVersion: 1,
        project,
      });
      await finish(projectTransaction);
      projectDb.close();
    },
    { red, blue, green, yellow, purple, circle, mask },
  );

  await waitForStudio(page);
  const tabs = page.locator(".artboard-tab");
  await expect(tabs).toHaveCount(2);
  await expect(page.getByTestId("artboard-tab-artboard_phase6_one")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByTestId("open-export").click();
  const dialog = page.getByTestId("export-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("1080×1350 px");
  await expect(dialog).toContainText("BEND video layer");
  await expect(dialog).toContainText("saved poster frame");

  const png = await captureDownload(page, async () => {
    await page.getByTestId("export-start").click();
  });
  expect(readPngSize(png)).toEqual({ width: 1080, height: 1350 });
  expect(inspectPng(png).hasAlpha).toBe(true);
  await expect(page.getByTestId("export-success")).toContainText("PNG downloaded");

  const samples = await samplePixels(page, png, [
    [50, 50],
    [150, 150],
    [400, 400],
    [750, 950],
    [500, 1150],
    [640, 1150],
  ]);
  expect(samples[0][0]).toBeGreaterThan(200);
  expect(samples[0][1]).toBeLessThan(60);
  expect(samples[1][2]).toBeGreaterThan(200);
  expect(samples[1][0]).toBeLessThan(40);
  expect(samples[2][0]).toBeLessThan(40);
  expect(samples[2][1]).toBeGreaterThan(90);
  expect(samples[2][1]).toBeLessThan(170);
  expect(samples[2][2]).toBeGreaterThan(90);
  expect(samples[3][0]).toBeGreaterThan(200);
  expect(samples[3][1]).toBeGreaterThan(180);
  expect(samples[3][2]).toBeLessThan(60);
  expect(samples[4][0]).toBeGreaterThan(140);
  expect(samples[4][2]).toBeGreaterThan(160);
  expect(samples[5][0]).toBeGreaterThan(190);
  expect(samples[5][1]).toBeLessThan(60);

  // All artboards: ordered ZIP with a manifest and a genuinely transparent slide.
  await page.getByTestId("export-scope-all").check();
  const zipBytes = await captureDownload(page, async () => {
    await page.getByTestId("export-start").click();
  });
  const zip = await JSZip.loadAsync(zipBytes);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as {
    format: string;
    formatVersion: number;
    background: string;
    artboards: Array<{ file: string; width: number; height: number; sha256: string }>;
  };
  expect(manifest.format).toBe("studio-composition-export");
  expect(manifest.formatVersion).toBe(1);
  expect(manifest.artboards.map((entry) => entry.file)).toEqual([
    "01-artboard-01-1080x1350.png",
    "02-transparent-overlay-1080x1350.png",
  ]);
  expect(Object.keys(zip.files).filter((name) => name.endsWith(".png"))).toHaveLength(2);
  const first = Buffer.from(await zip.file(manifest.artboards[0].file)!.async("uint8array"));
  const second = Buffer.from(await zip.file(manifest.artboards[1].file)!.async("uint8array"));
  expect(readPngSize(first)).toEqual({ width: 1080, height: 1350 });
  expect(readPngSize(second)).toEqual({ width: 1080, height: 1350 });
  expect(await countTransparentPixels(page, first)).toBe(0);
  expect(await countTransparentPixels(page, second)).toBeGreaterThan(1_000_000);
});
