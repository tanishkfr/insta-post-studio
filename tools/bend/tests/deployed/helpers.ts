import { expect, test as base, type Download, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const bypass = process.env.BEND_VERCEL_BYPASS?.trim();

/**
 * The bypass header is used only on the bootstrap request. The resulting JWT
 * cookie is scoped to the Vercel deployment, so page and asset requests never
 * leak the header to third-party URLs.
 */
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    if (bypass) {
      const response = await context.request.get(`${baseURL}/studio`, {
        headers: {
          "x-vercel-protection-bypass": bypass,
          "x-vercel-set-bypass-cookie": "samesitenone",
        },
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect([200, 307], "Vercel protection bypass bootstrap").toContain(response.status());
    }
    await use(context);
  },
});

export { expect };

export async function openStudio(page: Page, route = "/studio"): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 45_000 });
  await page.locator(".canvas-frame canvas").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText("Warming the GPU compositor…").waitFor({ state: "hidden", timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(450);
}

export async function addGenerator(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByRole("heading", { name: `${name} controls`, exact: true })).toBeVisible();
  await expect(page.locator(".canvas-frame canvas")).toBeVisible();
  await page.waitForTimeout(350);
}

export async function importVideo(page: Page, fixture: string): Promise<void> {
  await page.getByLabel("Add local video").setInputFiles(fixture);
  await expect(page.locator(".inspector-layer-type")).toContainText("Imported footage", { timeout: 45_000 });
  await expect(page.locator(".canvas-frame canvas")).toBeVisible();
  await page.waitForTimeout(900);
}

export async function openTab(page: Page, name: "Edit" | "Effects" | "Motion"): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
}

export async function openDisclosure(page: Page, title: string): Promise<void> {
  const disclosure = page.locator("details.inspector-disclosure").filter({
    has: page.locator("summary strong").filter({ hasText: new RegExp(`^${title}$`) }),
  });
  expect(await disclosure.count()).toBe(1);
  if (!(await disclosure.evaluate((element: HTMLDetailsElement) => element.open))) {
    await disclosure.locator("summary").click();
  }
  await expect(disclosure).toHaveJSProperty("open", true);
}

export async function selectLayer(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Select ${name}`, exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Inspector" }).getByRole("heading", { name, exact: true })).toBeVisible();
}

export async function selectTimelineLayer(page: Page, index: number): Promise<void> {
  await page.locator(".timeline-track .track-label").nth(index).click();
}

export async function scrub(page: Page, fraction: number): Promise<void> {
  const scrubber = page.getByLabel("Timeline scrubber");
  const box = await scrubber.boundingBox();
  if (!box) throw new Error("Timeline scrubber is not visible.");
  await page.mouse.click(box.x + Math.max(1, Math.min(box.width - 1, box.width * fraction)), box.y + 8);
  await page.waitForTimeout(200);
}

export async function canvasHash(page: Page): Promise<string> {
  const data = await page.locator(".canvas-frame canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
  return createHash("sha256").update(data).digest("hex");
}

/**
 * The compositor renders asynchronously (especially temporal/stateful effects).
 * Wait until the canvas render marker has been stable long enough to compare
 * screenshots without reading a stale WebGL frame.
 */
export async function waitForCanvasStable(page: Page, stableMs = 600, timeout = 30_000): Promise<void> {
  const started = Date.now();
  await page.waitForTimeout(100);
  await page.waitForFunction(() => document.querySelector(".canvas-frame canvas")?.getAttribute("data-rendering") === "false", undefined, { timeout }).catch(() => undefined);
  let previous: string | null = null;
  let stableSince = 0;
  while (Date.now() - started < timeout) {
    const state = await page.locator(".canvas-frame canvas").evaluate((canvas) => ({
      marker: canvas.getAttribute("data-render-ms"),
      rendering: canvas.getAttribute("data-rendering"),
    }));
    if (state.rendering === "false" && state.marker && state.marker === previous) {
      if (Date.now() - stableSince >= stableMs) return;
    } else {
      previous = state.marker;
      stableSince = Date.now();
    }
    await page.waitForTimeout(150);
  }
  throw new Error("Timed out waiting for the canvas compositor to settle.");
}

export async function currentTime(page: Page): Promise<string> {
  return page.locator(".timeline-timecode").innerText();
}

export async function exportStill(page: Page): Promise<Download> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export composition" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Current still" }).click();
  await dialog.getByRole("button", { name: "Export still PNG" }).click();
  await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download bend-/ }).click();
  const download = await downloadPromise;
  await dialog.getByRole("button", { name: "Done" }).click();
  return download;
}

export async function exportVideo(page: Page, options: { quality?: "preview" | "high"; range?: "full" | "loop"; seamless?: boolean; timeout?: number } = {}): Promise<Download> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export composition" });
  await dialog.waitFor();
  if (options.quality === "preview") await dialog.getByRole("button", { name: /Quick preview/i }).click();
  if (options.range === "loop") {
    await dialog.getByRole("button", { name: /Loop \/ work range/ }).click();
    if (options.seamless) await dialog.getByLabel(/Seamless repeat/).check();
  }
  const button = options.range === "loop"
    ? options.seamless ? /Export seamless loop/ : /Export range/
    : /Export social video/;
  await dialog.getByRole("button", { name: button }).click();
  await expect(page.getByText(/Export (complete|validated)/)).toBeVisible({ timeout: options.timeout ?? 240_000 });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download bend-/ }).click();
  const download = await downloadPromise;
  await dialog.getByRole("button", { name: "Done" }).click();
  return download;
}

export async function saveDownload(download: Download, directory: string): Promise<string> {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, download.suggestedFilename());
  await download.saveAs(target);
  return target;
}

export async function readStoredProjects(page: Page): Promise<Array<{ id: string; savedAt: number; revision?: number; project: Record<string, unknown> }>> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bend-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("projects")) return [];
      const transaction = database.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").getAll();
      return await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as Array<{ id: string; savedAt: number; revision?: number; project: Record<string, unknown> }>);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

export async function waitForSavedProject(page: Page, predicate: (project: Record<string, unknown>) => boolean, timeout = 20_000): Promise<Record<string, unknown>> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const records = await readStoredProjects(page);
    const match = records.map((record) => record.project).find(predicate);
    if (match) return match;
    await page.waitForTimeout(250);
  }
  throw new Error("Timed out waiting for the project to be persisted in IndexedDB.");
}

export async function readStoredAssetIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bend-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("assets")) return [];
      const transaction = database.transaction("assets", "readonly");
      const request = transaction.objectStore("assets").getAllKeys();
      return await new Promise<string[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result.map(String).sort());
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

export async function removeStoredAsset(page: Page, assetId: string): Promise<void> {
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
}

export async function installStorageQuotaFault(page: Page): Promise<void> {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function patchedPut(...args) {
      if (this.name === "projects") {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      return original.apply(this, args as Parameters<IDBObjectStore["put"]>);
    };
    (window as unknown as { __bendRestoreQuotaFault: () => void }).__bendRestoreQuotaFault = () => {
      IDBObjectStore.prototype.put = original;
    };
  });
}

export async function restoreStorageQuotaFault(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __bendRestoreQuotaFault?: () => void }).__bendRestoreQuotaFault?.());
}

export function fixturePath(name: string): string {
  const generated = path.resolve("output/fixtures", name);
  if (fs.existsSync(generated)) return generated;
  const standard = path.resolve("tests/fixtures", name);
  if (fs.existsSync(standard)) return standard;
  throw new Error(`Missing test fixture ${name}. Run tests/fixtures/generate-phase7-fixtures.ps1 for Phase 7 media.`);
}

export async function expectNoUnexpectedRequests(page: Page, allowedOrigin: string): Promise<void> {
  const failures: string[] = [];
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(allowedOrigin)) failures.push(`${request.url()} :: ${request.failure()?.errorText}`);
  });
  const foreign = new Set<string>();
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return;
    const origin = new URL(url).origin;
    if (origin !== allowedOrigin) foreign.add(origin);
  });
  await page.waitForTimeout(250);
  expect(failures, "same-origin request failures").toEqual([]);
  expect([...foreign], "unexpected third-party origins").toEqual([]);
}
