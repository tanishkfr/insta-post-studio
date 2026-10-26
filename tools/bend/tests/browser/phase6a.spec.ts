import { expect, test } from "@playwright/test";
import path from "node:path";

test.describe.configure({ timeout: 180_000 });

test("round-trips a BEND layer through the local host without losing host placement", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Phase 6A video handoff uses the verified Chromium encoder path.");
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/integration");
  await expect(page.getByRole("heading", { name: /Place BEND/ })).toBeVisible();
  await page.getByRole("button", { name: "Add BEND layer" }).click();
  await expect(page.locator(".host-video-layer")).toHaveCount(1, { timeout: 120_000 });
  await expect.poll(() => page.locator(".host-video-layer").evaluate((element) => (element as HTMLVideoElement).videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);

  await page.getByRole("combobox", { name: "Host canvas format" }).selectOption("1:1");
  await setHostRange(page, "X position", 120);
  await setHostRange(page, "Y position", -80);
  await setHostRange(page, "Scale", 1.25);
  await setHostRange(page, "Opacity", 0.72);
  await page.getByLabel("Playback").selectOption("hold-last-frame");
  await page.getByRole("button", { name: "Raise BEND layer" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator(".host-layer-row")).toHaveCount(1, { timeout: 30_000 });
  const before = await readHostPlacement(page);
  const sourceVersionBefore = await page.locator(".host-layer-row").getAttribute("data-source-version");

  await page.getByRole("button", { name: "Edit in BEND" }).click();
  await expect(page).toHaveURL(/\/studio\/edit\?hostSession=/, { timeout: 30_000 });
  await expect(page.locator(".canvas-frame canvas")).toBeVisible({ timeout: 30_000 });
  const seed = page.getByLabel(/Refraction seed/);
  await expect(seed).toBeVisible();
  await seed.fill("PHASE6A-BROWSER");
  await page.getByRole("button", { name: "Update Post" }).click();
  await expect(page.getByRole("heading", { name: /Place BEND/ })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".host-layer-row")).toHaveCount(1, { timeout: 30_000 });

  const after = await readHostPlacement(page);
  const sourceVersionAfter = await page.locator(".host-layer-row").getAttribute("data-source-version");
  expect(sourceVersionAfter).not.toBe(sourceVersionBefore);
  expect(after).toEqual(before);
  await expect(page.locator(".host-foreground")).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test("restores an editable package in a fresh context and exposes save recovery", async ({ page, browser, browserName }) => {
  test.skip(browserName !== "chromium", "Phase 6A package/browser flow uses the verified Chromium path.");
  await page.goto("/studio");
  await page.locator('input[aria-label="Choose local video footage"]').setInputFiles(path.resolve("tests/fixtures/test-pattern.webm"));
  await expect(page.getByText("Imported footage", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Source/ }).click(),
  ]);
  const packageBuffer = await readDownload(download);
  const freshContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const freshPage = await freshContext.newPage();
    await freshPage.goto("/studio");
    await freshPage.getByLabel("Import editable BEND project").setInputFiles({ name: download.suggestedFilename(), mimeType: "application/vnd.bend.project", buffer: packageBuffer });
    await expect(freshPage.getByText("Imported footage", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(freshPage.getByText("Warming the GPU compositor…", { exact: true })).toBeHidden({ timeout: 30_000 });
    await expect(freshPage.locator(".canvas-frame canvas")).toBeVisible();

    await freshPage.evaluate(() => {
      const originalPut = IDBObjectStore.prototype.put;
      (window as typeof window & { __bendFailProjectWrite?: boolean }).__bendFailProjectWrite = true;
      IDBObjectStore.prototype.put = function (...args) {
        const target = window as typeof window & { __bendFailProjectWrite?: boolean };
        if (this.name === "projects" && target.__bendFailProjectWrite) {
          target.__bendFailProjectWrite = false;
          throw new DOMException("Quota exceeded during Phase 6A browser verification.", "QuotaExceededError");
        }
        return originalPut.apply(this, args as Parameters<IDBObjectStore["put"]>);
      };
    });
    await freshPage.getByLabel("Project name").fill("Browser persistence recovery");
    await expect(freshPage.getByText("Save failed", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(freshPage.getByRole("button", { name: "Download recovery copy" })).toBeVisible();
  } finally {
    await freshContext.close();
  }
});

async function setHostRange(page: import("@playwright/test").Page, label: string, value: number): Promise<void> {
  await page.getByLabel(label).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await page.waitForTimeout(150);
}

async function readHostPlacement(page: import("@playwright/test").Page) {
  return page.locator(".host-inspector").evaluate((element) => ({
    x: (element.querySelector('input[aria-label="X position"]') as HTMLInputElement | null)?.value,
    y: (element.querySelector('input[aria-label="Y position"]') as HTMLInputElement | null)?.value,
    scale: (element.querySelector('input[aria-label="Scale"]') as HTMLInputElement | null)?.value,
    opacity: (element.querySelector('input[aria-label="Opacity"]') as HTMLInputElement | null)?.value,
    playback: (element.querySelector("#host-playback") as HTMLSelectElement | null)?.value,
    stackingOrder: element.closest(".integration-board")?.querySelector(".host-layer-row")?.getAttribute("data-stacking-order"),
  }));
}

async function readDownload(download: import("@playwright/test").Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The browser did not expose the editable package stream.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
