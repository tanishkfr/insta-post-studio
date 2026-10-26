import { expect, test } from "@playwright/test";
import path from "node:path";
import { openGenerated, openStudio } from "./studio-helpers";

test.describe.configure({ timeout: 180_000 });

test("runs ten repeated export/close cycles and records cleanup proxies", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Cleanup benchmark runs on the verified Chromium encoder path.");
  await openGenerated(page);
  await page.getByLabel("Duration value").fill("0.5");
  await expect(page.locator(".canvas-frame canvas")).toBeVisible();

  const before = await readResourceProxies(page);
  const durations: number[] = [];
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Still frame" }).click();
    const startedAt = Date.now();
    await page.getByRole("button", { name: "Export PNG" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 30_000 });
    durations.push(Date.now() - startedAt);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const after = await readResourceProxies(page);
  console.log(`[BEND PERF] cleanup_cycles=${JSON.stringify({ before, after, durations, medianMs: median(durations) })}`);
  expect(after.canvasCount).toBe(1);
  expect(after.hiddenVideoCount).toBe(0);
  expect(after.dialogCount).toBe(0);
});

test("measures imported 720p footage with Wave Displacement", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Imported encoder benchmark runs on Chromium.");
  await openStudio(page);
  await page.locator('input[aria-label="Choose local video footage"]').setInputFiles(path.resolve("tests/fixtures/performance-720p.mp4"));
  await expect(page.getByText(/1280 × 720 · 2\.00s/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Effects" }).click();
  await page.getByRole("button", { name: "Toggle Wave Displacement" }).click();
  const before = await readResourceProxies(page);
  await page.getByRole("button", { name: "Export" }).click();
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Export video" }).click();
  await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 120_000 });
  const exportMs = Date.now() - startedAt;
  const videoMetadata = await page.locator(".export-result video").evaluate((element) => {
    const video = element as HTMLVideoElement;
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  });
  const after = await readResourceProxies(page);
  console.log(`[BEND PERF] imported_720p_wave=${JSON.stringify({ before, after, exportMs, videoMetadata })}`);
  expect(videoMetadata.width).toBe(720);
  expect(videoMetadata.height).toBe(900);
  await page.getByRole("button", { name: "Done" }).click();
});

test("releases hidden video elements after importing and removing multiple clips", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Resource lifecycle benchmark runs on Chromium.");
  await openStudio(page);
  const firstFixture = path.resolve("tests/fixtures/test-pattern.mp4");
  const secondFixture = path.resolve("tests/fixtures/test-pattern.webm");
  await page.locator('input[aria-label="Choose local video footage"]').setInputFiles(firstFixture);
  await page.locator('input[aria-label="Import local video"]').setInputFiles(secondFixture);
  await page.locator('input[aria-label="Import local video"]').setInputFiles(firstFixture);
  await expect(page.locator(".timeline-clip")).toHaveCount(3, { timeout: 30_000 });
  const before = await readResourceProxies(page);
  const removeButtons = page.getByRole("button", { name: /Remove Imported footage/ });
  while (await removeButtons.count()) await removeButtons.last().click();
  await expect(page.locator(".timeline-clip")).toHaveCount(0);
  const after = await readResourceProxies(page);
  console.log(`[BEND PERF] import_remove_cycles=${JSON.stringify({ before, after })}`);
  expect(after.hiddenVideoCount).toBe(0);
  expect(after.canvasCount).toBe(1);
});

async function readResourceProxies(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    canvasCount: document.querySelectorAll("canvas").length,
    hiddenVideoCount: document.querySelectorAll("video[aria-hidden='true']").length,
    dialogCount: document.querySelectorAll("[role='dialog']").length,
    heapUsedBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
