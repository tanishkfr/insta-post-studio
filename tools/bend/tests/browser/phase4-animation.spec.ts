import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openStudio } from "./studio-helpers";

test.describe.configure({ timeout: 900_000 });

const evidenceDirectory = path.resolve("output/evidence/phase4");

async function openGenerated(page: import("@playwright/test").Page): Promise<void> {
  await openStudio(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Signal Field" }).click();
  await expect(page.locator(".canvas-frame canvas")).toBeVisible({ timeout: 30_000 });
}

async function captureVideo(page: import("@playwright/test").Page, filename: string): Promise<{ duration: number; width: number; height: number; mime: string }> {
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: "Export video" }).click();
  await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 600_000 });
  const video = page.locator(".export-result video");
  const metadata = await video.evaluate((element) => {
    const source = element as HTMLVideoElement;
    return { duration: source.duration, width: source.videoWidth, height: source.videoHeight };
  });
  const mime = await page.locator(".export-result p").first().textContent() ?? "";
  const source = await video.getAttribute("src");
  if (!source) throw new Error("Phase 4 export did not expose a blob URL.");
  const bytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), source);
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(path.join(evidenceDirectory, filename), Uint8Array.from(bytes));
  return { ...metadata, mime };
}

test("edits keyframes, modulation, timeline tracks, recipes, and reload persistence", async ({ page }) => {
  await openGenerated(page);
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await expect(page.getByLabel("Scale value")).toBeVisible();
  await page.getByRole("button", { name: "Set keyframe for Scale" }).click();
  await expect(page.locator(".animation-track-row")).toHaveCount(1);
  await page.getByLabel("Timeline scrubber").click({ position: { x: 240, y: 14 } });
  await page.getByLabel("Scale value").fill("1.35");
  await expect(page.locator(".timeline-keyframe")).toHaveCount(2);
  await page.getByRole("button", { name: "Add modulation for Scale" }).click();
  await expect(page.getByLabel("Waveform")).toBeVisible();
  await page.getByLabel("Waveform").selectOption("smooth-noise");
  await page.getByLabel("Mode").selectOption("multiply");
  await expect(page.getByRole("region", { name: "Motion recipes" })).toBeVisible();
  await expect(page.locator(".recipe-list-item")).toHaveCount(6);
  await expect(page.locator(".recipe-preview canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Apply / replace" }).click();
  await expect(page.locator(".recipe-message")).toContainText("Applied");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: "output/playwright/phase4-animation-recipes.png", fullPage: true });
  await page.reload();
  await expect(page.locator(".canvas-frame canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await expect(page.locator(".animation-track-row")).toHaveCount(1);
  await expect(page.locator(".timeline-keyframe")).toHaveCount(3);
});

test("Gate Zero A: exports a ten-second 720p temporal composition", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Temporal video evidence uses the verified Chromium encoder path.");
  await openGenerated(page);
  await page.getByLabel("Duration value").fill("10");
  await page.getByRole("button", { name: "Effects" }).click();
  await page.locator(".temporal-library .effect-library-item").filter({ hasText: "Time Slice" }).click();
  await page.getByLabel("Slice Count value").fill("4");
  await page.locator(".temporal-library .effect-library-item").filter({ hasText: "Motion Echo" }).click();
  await page.getByLabel("Echo Count value").fill("2");
  const result = await captureVideo(page, "gate-zero-a-temporal-10s.mp4");
  console.log(`[BEND GATE ZERO] ${JSON.stringify({ gate: "A", frames: Math.round(result.duration * 30), ...result })}`);
  expect(result.duration).toBeGreaterThan(9.9);
  expect(result.duration).toBeLessThanOrEqual(10.05);
  expect(result.width).toBe(720);
  expect(result.height).toBe(900);
  await page.getByRole("button", { name: "Done" }).click();
});

test("Gate Zero B/C: exports temporal footage with audio and records WebM capability", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Audio and encoder evidence uses the verified Chromium path.");
  await openStudio(page);
  await page.locator('input[aria-label="Choose local video footage"]').setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.getByText(/Source audio detected/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Effects" }).click();
  await page.locator(".temporal-library .effect-library-item").filter({ hasText: "Time Slice" }).click();
  await page.getByLabel("Slice Count value").fill("4");
  const capabilities = await page.evaluate(() => ({
    webmVp9: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus"),
    webm: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm"),
    mp4: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4"),
  }));
  console.log(`[BEND GATE ZERO] ${JSON.stringify({ gate: "C", capabilities })}`);
  expect(capabilities.webm || capabilities.webmVp9).toBe(true);
  const result = await captureVideo(page, "gate-zero-b-temporal-audio.mp4");
  const audioStatus = await page.locator(".export-audio-status").textContent();
  console.log(`[BEND GATE ZERO] ${JSON.stringify({ gate: "B", audioStatus, ...result })}`);
  expect(audioStatus).toContain("Source audio included");
  expect(result.duration).toBeGreaterThan(0.9);
  await page.getByRole("button", { name: "Done" }).click();
});

test("Gate Zero D: measures 2, 5, and 10 second generated exports", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Performance matrix uses the verified Chromium encoder path.");
  await openGenerated(page);
  const measurements: Array<Record<string, number | string>> = [];
  for (const seconds of [2, 5, 10]) {
    await page.getByLabel("Duration value").fill(String(seconds));
    const before = await page.evaluate(() => ({ heapUsedBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? -1 }));
    const startedAt = Date.now();
    const result = await captureVideo(page, `gate-zero-d-${seconds}s.mp4`);
    const after = await page.evaluate(() => ({ heapUsedBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? -1 }));
    const measurement = { seconds, exportMs: Date.now() - startedAt, frames: Math.round(result.duration * 30), width: result.width, height: result.height, heapBefore: before.heapUsedBytes, heapAfter: after.heapUsedBytes };
    measurements.push(measurement);
    console.log(`[BEND GATE ZERO] ${JSON.stringify({ gate: "D", ...measurement })}`);
    await page.getByRole("button", { name: "Done" }).click();
  }
  expect(measurements).toHaveLength(3);
  expect(measurements.map((measurement) => measurement.seconds)).toEqual([2, 5, 10]);
});
