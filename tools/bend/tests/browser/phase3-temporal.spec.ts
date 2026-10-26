import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openStudio } from "./studio-helpers";

test.describe.configure({ timeout: 300_000 });

const fixture = path.resolve("tests/fixtures/test-pattern.mp4");
const nonzeroTimestampFixture = path.resolve("tests/fixtures/nonzero-video-start.webm");
const effects = [
  { id: "motion-echo", name: "Motion Echo", preset: "Ghost Trail" },
  { id: "time-slice", name: "Time Slice", preset: "Rolling Time" },
  { id: "frame-feedback", name: "Frame Feedback", preset: "Residue" },
  { id: "channel-delay", name: "Channel Delay", preset: "Chromatic Ghost" },
] as const;

async function openFootage(page: import("@playwright/test").Page, source = fixture): Promise<void> {
  await openStudio(page);
  await page.locator('input[aria-label="Choose local video footage"]').setInputFiles(source);
  await expect(page.getByText("Imported footage", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Effects" }).click();
  await expect(page.locator(".inspector-content")).toContainText("Temporal effects");
}

async function addEffect(page: import("@playwright/test").Page, name: string): Promise<void> {
  await page.locator(".temporal-library .effect-library-item").filter({ hasText: name }).click();
  await expect(page.locator(".temporal-stack-row").filter({ hasText: name })).toBeVisible();
}

async function exportVideo(page: import("@playwright/test").Page, outputName: string, durationBounds = { min: 1.9, max: 2.05 }): Promise<{ duration: number; width: number; height: number }> {
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: "Export video" }).click();
  await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 240_000 });
  const video = page.locator(".export-result video");
  await expect(video).toBeVisible();
  const metadata = await video.evaluate((element) => {
    const value = element as HTMLVideoElement;
    return { duration: value.duration, width: value.videoWidth, height: value.videoHeight };
  });
  expect(metadata.duration).toBeGreaterThan(durationBounds.min);
  expect(metadata.duration).toBeLessThanOrEqual(durationBounds.max);
  expect(metadata.width).toBeGreaterThan(0);
  expect(metadata.height).toBeGreaterThan(0);
  const source = await video.getAttribute("src");
  if (!source) throw new Error("BEND temporal export did not expose a blob URL.");
  const bytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), source);
  const directory = path.resolve("output/evidence/phase3");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, outputName), Uint8Array.from(bytes));
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return metadata;
}

test("exposes the four temporal effects, presets, controls, and a persisted stack", async ({ page }) => {
  await openFootage(page);
  const library = page.locator(".temporal-library");
  await expect(library.locator(".effect-library-item")).toHaveCount(5);
  for (const name of ["Motion Echo", "Time Slice", "Channel Delay", "Frame Feedback", "Wave Displacement"]) await expect(library).toContainText(name);

  await addEffect(page, "Motion Echo");
  await page.locator(".temporal-controls .preset-button").filter({ hasText: "Long Exposure" }).click();
  await expect(page.getByLabel("Echo Count value")).toHaveValue("7");
  await page.getByLabel("Echo Count value").fill("5");
  await expect(page.getByLabel("Echo Count value")).toHaveValue("5");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await page.getByRole("button", { name: "Effects" }).click();
  await expect(page.locator(".temporal-stack-row").filter({ hasText: "Motion Echo" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Echo Count value")).toHaveValue("5");
});

test("exports each temporal effect and a two-effect stack from a moving timecode fixture", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Mediabunny video export evidence is collected in Chromium on this host.");
  await openFootage(page);
  const base = await exportVideo(page, "temporal-base.mp4");
  console.log(`[BEND TEMPORAL] base=${JSON.stringify(base)}`);

  for (const effect of effects) {
    await addEffect(page, effect.name);
    await page.locator(".temporal-controls .preset-button").filter({ hasText: effect.preset }).click();
    if (effect.id === "time-slice") await page.getByLabel("Slice Count value").fill("6");
    if (effect.id === "motion-echo") await page.getByLabel("Echo Count value").fill("3");
    if (effect.id === "channel-delay") await page.getByLabel("Intensity value").fill("1");
    const metadata = await exportVideo(page, `${effect.id}.mp4`);
    console.log(`[BEND TEMPORAL] ${effect.id}=${JSON.stringify(metadata)}`);
    await page.getByRole("button", { name: `Remove ${effect.name}` }).click();
    await expect(page.locator(".temporal-stack-row").filter({ hasText: effect.name })).toHaveCount(0);
  }

  await addEffect(page, "Time Slice");
  await page.getByLabel("Slice Count value").fill("4");
  await addEffect(page, "Motion Echo");
  await page.getByLabel("Echo Count value").fill("2");
  await expect(page.locator(".temporal-stack-row")).toHaveCount(2);
  const stacked = await exportVideo(page, "stacked-time-slice-motion-echo.mp4");
  console.log(`[BEND TEMPORAL] stacked=${JSON.stringify(stacked)}`);
});

test("replays Frame Feedback after a backward seek", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Mediabunny video export evidence is collected in Chromium on this host.");
  await openFootage(page);
  await addEffect(page, "Frame Feedback");
  await page.locator(".temporal-controls .preset-button").filter({ hasText: "Residue" }).click();
  const scrubber = page.getByLabel("Timeline scrubber");
  await scrubber.click({ position: { x: 280, y: 14 } });
  await expect(page.locator(".timeline-timecode")).not.toHaveText("0:00.00");
  await scrubber.click({ position: { x: 36, y: 14 } });
  await expect(page.locator(".timeline-timecode")).toHaveText(/0:00\.0[0-9]/);
  const metadata = await exportVideo(page, "frame-feedback-after-backward-seek.mp4");
  console.log(`[BEND TEMPORAL] backward-seek=${JSON.stringify(metadata)}`);
});

test("maps Time Slice against a source with a nonzero presentation timestamp", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Mediabunny video export evidence is collected in Chromium on this host.");
  await openFootage(page, nonzeroTimestampFixture);
  await addEffect(page, "Time Slice");
  await page.getByLabel("Slice Count value").fill("4");
  const metadata = await exportVideo(page, "time-slice-nonzero-source.mp4", { min: 1.1, max: 1.4 });
  console.log(`[BEND TEMPORAL] nonzero-source=${JSON.stringify(metadata)}`);
});
