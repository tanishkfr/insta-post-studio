import { expect, test } from "./studio-test";
import {
  chooseFormat,
  imageFrame,
  openImage,
  openType,
  publishActiveTool,
  readNewestProject,
  setRange,
  typeFrame,
  waitForImageReady,
  waitForStudio,
  waitForTypeReady,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

async function createImageLayer(page: import("@playwright/test").Page): Promise<string> {
  await chooseFormat(page, "instagram-square");
  await openImage(page);
  const frame = imageFrame(page);
  await frame.locator("#file").setInputFiles({
    name: "reliability.png",
    mimeType: "image/png",
    buffer: makePng({ width: 400, height: 400 }),
  });
  await expect(frame.locator("#hn")).toHaveValue("reliability");
  await publishActiveTool(page);
  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  return String(layers[0].id);
}

test("a missing source photo blocks Image restore without deleting the layer", async ({ page }) => {
  await waitForStudio(page);
  const layerId = await createImageLayer(page);
  const project = await readNewestProject(page);
  const layer = (project?.project.layers as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === layerId,
  );
  const photoAssetId = String(
    (layer!.sourceState as { contentHash?: string }).contentHash ??
      (layer!.rendered as { assetId?: string }).assetId,
  );
  const sourceContents = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-assets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const transaction = database.transaction("source-states", "readonly");
      const request = transaction.objectStore("source-states").getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return records.map((record) => new TextDecoder().decode(record.bytes as Uint8Array));
  });
  const photoReference = JSON.parse(sourceContents[0]) as {
    photo: { assetId: string };
  };
  expect(photoAssetId).toBeTruthy();

  await page.evaluate(async (assetId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-assets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("assets", "readwrite");
      transaction.objectStore("assets").delete(assetId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, photoReference.photo.assetId);

  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await expect(page.getByTestId("image-editor")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/missing from local storage/i, {
    timeout: 20_000,
  });
  await page.getByTestId("image-editor").getByRole("button", { name: "Back to canvas" }).click();
  await expect(page.locator(`.canvas-layer[data-layer-id="${layerId}"]`)).toBeVisible();
});

test("unsupported Image source version is rejected before opening the iframe", async ({ page }) => {
  await waitForStudio(page);
  const layerId = await createImageLayer(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-assets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("source-states", "readwrite");
      const store = transaction.objectStore("source-states");
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        for (const record of getAll.result) {
          record.toolStateVersion = "9.9.9";
          store.put(record);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await expect(page.getByTestId("image-editor")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/Unsupported Image source state/, {
    timeout: 20_000,
  });
  await page.getByTestId("image-editor").getByRole("button", { name: "Back to canvas" }).click();
  await expect(page.locator(`.canvas-layer[data-layer-id="${layerId}"]`)).toBeVisible();
});

test("a failed full-resolution render leaves no new Image layer", async ({ page }) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-square");
  await openImage(page);
  const frame = imageFrame(page);
  await frame.locator("#file").setInputFiles({
    name: "render-fail.png",
    mimeType: "image/png",
    buffer: makePng({ width: 300, height: 300 }),
  });
  await expect(frame.locator("#hn")).toHaveValue("render-fail");
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe[title="Image editor"]') as HTMLIFrameElement;
    const contentWindow = iframe.contentWindow as unknown as {
      HTMLCanvasElement: typeof HTMLCanvasElement;
      __restoreToBlob?: () => void;
    };
    const original = contentWindow.HTMLCanvasElement.prototype.toBlob;
    contentWindow.__restoreToBlob = () => {
      contentWindow.HTMLCanvasElement.prototype.toBlob = original;
    };
    contentWindow.HTMLCanvasElement.prototype.toBlob = function (
      callback: BlobCallback,
    ) {
      callback(null);
    };
  });
  await page.getByRole("button", { name: "Add to composition" }).click();
  await expect(page.getByRole("alert")).toContainText(/PNG encoding failed/i, {
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe[title="Image editor"]') as HTMLIFrameElement;
    const contentWindow = iframe.contentWindow as unknown as { __restoreToBlob?: () => void };
    contentWindow.__restoreToBlob?.();
  });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(0);
});

test("a failed project write rolls back an Image update to the previous durable revision", async ({
  page,
}) => {
  await waitForStudio(page);
  const layerId = await createImageLayer(page);
  const before = await readNewestProject(page);
  const beforeLayer = (before?.project.layers as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === layerId,
  );
  const beforeHash = String(
    (beforeLayer!.sourceState as { contentHash?: string }).contentHash,
  );

  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  const frame = imageFrame(page);
  await frame.getByRole("tab", { name: "Edit" }).click();
  await setRange(frame, '#ctrls .row:has-text("Brightness") input.rng', 0.5);

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
        throw new DOMException("Simulated project write failure", "QuotaExceededError");
      }
      return original.apply(this, argumentsList);
    };
  });

  await page.getByRole("button", { name: "Update layer" }).click();
  await expect(page.getByRole("alert")).toContainText(/previous durable layer was preserved/i, {
    timeout: 30_000,
  });
  await page.evaluate(() => {
    (window as unknown as { __restoreProjectPut?: () => void }).__restoreProjectPut?.();
  });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  const afterRollback = await readNewestProject(page);
  const rolledBackLayer = (afterRollback?.project.layers as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === layerId,
  );
  expect(
    String((rolledBackLayer!.sourceState as { contentHash?: string }).contentHash),
  ).toBe(beforeHash);
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  const afterReload = await readNewestProject(page);
  const reloadedLayer = (afterReload?.project.layers as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === layerId,
  );
  expect(
    String((reloadedLayer!.sourceState as { contentHash?: string }).contentHash),
  ).toBe(beforeHash);
});

test("a failed source-asset write leaves the previous Image revision intact", async ({ page }) => {
  await waitForStudio(page);
  const layerId = await createImageLayer(page);
  const before = await readNewestProject(page);
  const beforeLayer = (before?.project.layers as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === layerId,
  );
  const beforeHash = String(
    (beforeLayer!.sourceState as { contentHash?: string }).contentHash,
  );

  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  await imageFrame(page).getByRole("tab", { name: "Edit" }).click();
  await setRange(
    imageFrame(page),
    '#ctrls .row:has-text("Brightness") input.rng',
    0.45,
  );

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { __restoreAssetPut: () => void }).__restoreAssetPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...argumentsList: Parameters<IDBObjectStore["put"]>
    ) {
      throw new DOMException("Simulated asset write failure", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Update layer" }).click();
  await expect(page.getByRole("alert")).toContainText(/could not publish/i, {
    timeout: 30_000,
  });
  await page.evaluate(() => {
    (window as unknown as { __restoreAssetPut?: () => void }).__restoreAssetPut?.();
  });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  const after = await readNewestProject(page);
  const afterLayer = (after?.project.layers as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === layerId,
  );
  expect(
    String((afterLayer!.sourceState as { contentHash?: string }).contentHash),
  ).toBe(beforeHash);
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
});

test("Type Library font load failure is reported and the layer remains", async ({ page }) => {
  // This test intentionally removes the bundled font data to exercise the
  // preserved loader's failure path. Those 404/load errors are expected here;
  // every other console error remains guarded.
  test.info().annotations.push(
    { type: "allow-console-error", description: "status of 404" },
    { type: "allow-console-error", description: "HTTP 404" },
  );
  await waitForStudio(page);
  await openType(page);
  const library = typeFrame(page);
  await expect(library.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await library.locator(".font-row", { hasText: "Goozette" }).click();
  await library.locator("#text").fill("FONT FAIL");
  await publishActiveTool(page);
  const project = await readNewestProject(page);
  const layerId = String((project?.project.layers as Array<Record<string, unknown>>)[0].id);

  await page.route("**/tools/typography/fonts-data.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: "window.FONT_DATA = {};",
    });
  });
  await page.route("**/tools/typography/fonts/*", async (route) => {
    await route.fulfill({ status: 404, body: "not found" });
  });
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await expect(page.getByTestId("type-editor")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/could not be loaded/i, {
    timeout: 60_000,
  });
  await page.getByTestId("type-editor").getByRole("button", { name: "Back to canvas" }).click();
  await expect(page.locator(`.canvas-layer[data-layer-id="${layerId}"]`)).toBeVisible();
  await page.unroute("**/tools/typography/fonts-data.js");
  await page.unroute("**/tools/typography/fonts/*");
});
