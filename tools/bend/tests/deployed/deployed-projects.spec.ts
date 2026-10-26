import { expect, test, addGenerator, canvasHash, fixturePath, importVideo, openStudio, readStoredAssetIds, readStoredProjects, saveDownload, waitForCanvasStable, waitForSavedProject } from "./helpers";
import fs from "node:fs";
import path from "node:path";

const evidenceDirectory = path.resolve("output/evidence/phase7-0/deployed-tests");

async function bootstrapContext(context: import("@playwright/test").BrowserContext, baseURL: string): Promise<void> {
  const bypass = process.env.BEND_VERCEL_BYPASS?.trim();
  if (!bypass) return;
  await context.request.get(`${baseURL}/studio`, {
    headers: {
      "x-vercel-protection-bypass": bypass,
      "x-vercel-set-bypass-cookie": "samesitenone",
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
}

test.describe("deployed projects, packages, and data safety", () => {
  test("round-trips an editable package with its source media into a fresh browser context and reimports it without duplicating assets @full", async ({ page, browser, baseURL }, testInfo) => {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await page.getByLabel("Project name").fill("Phase 7 Portable");
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await page.getByRole("tab", { name: "Effects", exact: true }).click();
    await page.locator(".temporal-library .effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await waitForCanvasStable(page);
    const beforeHash = await canvasHash(page);
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.locator(".project-download-button").click();
    const download = await downloadPromise;
    const packagePath = await saveDownload(download, path.join(evidenceDirectory, testInfo.project.name));
    expect(download.suggestedFilename()).toMatch(/^bend-.*\.bendpkg$/);
    const packageBytes = fs.readFileSync(packagePath);
    expect(packageBytes.byteLength).toBeGreaterThan(1_000);
    expect(packageBytes.subarray(0, 4).toString("latin1")).toContain("BEND");

    const fresh = await browser.newContext({ acceptDownloads: true });
    await bootstrapContext(fresh, baseURL!);
    const freshPage = await fresh.newPage();
    await openStudio(freshPage);
    await expect(freshPage.getByRole("heading", { name: "Start with a moving image." })).toBeVisible();
    await freshPage.getByLabel("Open project package").setInputFiles(packagePath);
    const preview = freshPage.getByRole("dialog", { name: /^Open .+\?$/ });
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toContainText("Canvas");
    await expect(preview).toContainText("Media");
    await preview.getByRole("button", { name: "Open editable project" }).click();
    await expect(freshPage.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(freshPage.getByLabel("Project name")).toHaveValue("Phase 7 Portable");
    await expect(freshPage.locator(".timeline-track")).toHaveCount(2);
    await expect(freshPage.locator(".canvas-frame canvas")).toBeVisible();
    await expect(freshPage.getByText(/package restored/i)).toBeVisible();
    await expect(freshPage.getByText(/Editable package unavailable/)).toHaveCount(0);
    await expect(freshPage.locator(".save-status")).toHaveText("Saved locally", { timeout: 30_000 });
    await waitForCanvasStable(freshPage);
    expect(await canvasHash(freshPage)).not.toBe("");

    // Re-importing the same package must reuse identical assets, not create new IDs.
    const idsBefore = await readStoredAssetIds(freshPage);
    expect(idsBefore.length).toBeGreaterThan(0);
    await freshPage.getByRole("button", { name: "Open project library" }).click();
    await freshPage.getByLabel("Open project package").setInputFiles(packagePath);
    const secondPreview = freshPage.getByRole("dialog", { name: /^Open .+\?$/ });
    await expect(secondPreview).toBeVisible();
    await secondPreview.getByRole("button", { name: "Open editable project" }).click();
    await expect(freshPage.getByText(/package restored/i)).toBeVisible();
    const idsAfter = await readStoredAssetIds(freshPage);
    expect(idsAfter).toEqual(idsBefore);
    const records = await readStoredProjects(freshPage);
    expect(records.some((record) => record.project.name === "Phase 7 Portable")).toBe(true);
    await freshPage.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "package-roundtrip.png"), fullPage: true });
    await fresh.close();
  });

  test("loads an older stored document with missing 5.5 fields and restores safe defaults without losing media @full", async ({ page }) => {
    await openStudio(page);
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await scrubTo(page, 0.3);
    await waitForCanvasStable(page);
    const before = await canvasHash(page);
    const mutated = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("bend-local");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const records = await new Promise<Array<Record<string, any>>>((resolve, reject) => {
          const request = database.transaction("projects", "readonly").objectStore("projects").getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const record = records[0];
        if (!record) throw new Error("expected a saved project");
        delete record.project.loop;
        for (const layer of record.project.layers) {
          delete layer.blendMode;
          delete layer.mask;
        }
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("projects", "readwrite");
          transaction.objectStore("projects").put(record);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        return record.project.name as string;
      } finally {
        database.close();
      }
    });
    expect(mutated).toBeTruthy();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await expect(page.locator(".timeline-track")).toHaveCount(1);
    await scrubTo(page, 0.3);
    await waitForCanvasStable(page);
    const after = await canvasHash(page);
    expect(after).toBe(before);
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    const saved = await waitForSavedProject(page, (project) => Boolean(project.loop) && Array.isArray(project.layers));
    expect(saved.loop).toEqual(expect.objectContaining({ enabled: false }));
    const layer = (saved.layers as Array<Record<string, unknown>>)[0];
    expect(layer.blendMode).toBe("normal");
    expect(layer.mask).toEqual(expect.objectContaining({ type: "none" }));
  });

  test("recovers from missing media, allows hidden-layer export, and relinks without losing the edit @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await page.getByLabel("Out value", { exact: true }).fill("3");
    await page.getByLabel("Out value", { exact: true }).press("Enter");
    await waitForSavedProject(page, (project) => {
      const layers = project.layers as Array<Record<string, unknown>> | undefined;
      return Array.isArray(layers) && layers.length === 1 && layers[0]?.trimEnd === 3;
    });
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    const records = await readStoredProjects(page);
    const layer = (records[0].project.layers as Array<Record<string, any>>)[0];
    const assetId = layer.assetId as string;
    await page.evaluate(async (id) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("bend-local");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("assets", "readwrite");
          transaction.objectStore("assets").delete(id);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
      } finally {
        database.close();
      }
    }, assetId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/video source.*need relinking/i)).toBeVisible();
    await expect(page.locator(".timeline-track")).toHaveCount(1);
    await expect(page.getByLabel("Out value", { exact: true })).toHaveValue("3");

    // A visible missing source blocks export with an actionable message.
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await dialog.getByRole("button", { name: "Current still" }).click();
    await dialog.getByRole("button", { name: "Export still PNG" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /missing from local storage/i })).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("button", { name: "Close export dialog" }).click();

    // Hiding the unresolved layer lets the rest of the composition export.
    await page.locator('.inspector-layer-actions button[aria-label^="Hide "]').click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialogAgain = page.getByRole("dialog", { name: "Export composition" });
    await dialogAgain.getByRole("button", { name: "Current still" }).click();
    await dialogAgain.getByRole("button", { name: "Export still PNG" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 60_000 });
    const downloadPromise = page.waitForEvent("download");
    await dialogAgain.getByRole("button", { name: /Download bend-/ }).click();
    const png = await downloadPromise;
    const pngPath = await saveDownload(png, path.join(evidenceDirectory, testInfo.project.name));
    expect(fs.statSync(pngPath).size).toBeGreaterThan(1000);
    await dialogAgain.getByRole("button", { name: "Done" }).click();

    // Relink restores the same asset identity and the original edit.
    await page.locator(".missing-media-banner").getByRole("button", { name: /^Relink / }).click();
    await page.getByLabel("Choose replacement media").setInputFiles(fixturePath("bend-portrait-916.mp4"));
    await expect(page.getByText(/need relinking/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "missing-media-recovered.png"), fullPage: true });
  });

  test("reports an injected local-storage quota failure and retries the newest edit successfully @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function patchedPut(...args) {
        if (this.name === "projects") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        return original.apply(this, args as Parameters<IDBObjectStore["put"]>);
      };
      (window as unknown as { __restoreBendQuota: () => void }).__restoreBendQuota = () => { IDBObjectStore.prototype.put = original; };
    });
    await page.getByLabel("Project name").fill("Quota failure");
    await expect(page.locator(".save-status")).toContainText("Save failed", { timeout: 15_000 });
    await expect(page.getByText(/Local save failed/i)).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".save-status")).toContainText("Save failed", { timeout: 15_000 });
    await page.evaluate(() => (window as unknown as { __restoreBendQuota?: () => void }).__restoreBendQuota?.());
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    await expect(page.getByText(/Local save failed/i)).toHaveCount(0);
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "quota-recovered.png"), fullPage: true });
  });
});

async function scrubTo(page: import("@playwright/test").Page, fraction: number): Promise<void> {
  const scrubber = page.getByLabel("Timeline scrubber");
  const box = await scrubber.boundingBox();
  if (!box) return;
  await page.mouse.click(box.x + box.width * fraction, box.y + 8);
  await page.waitForTimeout(250);
}
