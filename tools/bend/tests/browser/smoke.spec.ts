import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { openGenerated, openStudio } from "./studio-helpers";

async function captureExportResult(page: import("@playwright/test").Page, outputName: string): Promise<void> {
  const result = page.locator(".export-result video, .export-result img").first();
  const source = await result.getAttribute("src");
  if (!source) throw new Error("BEND export result did not expose a blob URL.");
  const bytes = await page.evaluate(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`BEND export result fetch failed: ${response.status}`);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, source);
  await writeFile(test.info().outputPath(outputName), Uint8Array.from(bytes));
}

async function requestExportDownload(page: import("@playwright/test").Page): Promise<void> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download bend-/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^bend-/);
}

test.describe("BEND browser smoke", () => {
  test("renders the unified studio shell at root", async ({ page }) => {
    await openStudio(page);
    await expect(page.getByRole("heading", { name: /Start with a moving image/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
    await page.screenshot({ path: `output/playwright/${test.info().project.name}-studio.png`, fullPage: true });
  });

  test("records a basic Chromium render baseline", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Baseline is recorded once on the Chromium test machine.");
    await openStudio(page);
    const metrics = await page.evaluate(async () => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const start = performance.now();
      let frames = 0;
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          frames += 1;
          if (now - start >= 1_000) resolve();
          else window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
      });
      return {
        domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd - navigation.startTime) : null,
        loadEventMs: navigation ? Math.round(navigation.loadEventEnd - navigation.startTime) : null,
        callbackFps: frames,
        memoryUsedBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
      };
    });
    console.log(`[BEND PERF] ${JSON.stringify(metrics)}`);
    expect(metrics.callbackFps).toBeGreaterThan(0);
  });

  test("keeps the generated editor usable at a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGenerated(page);
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await page.getByRole("button", { name: "Open controls" }).click();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
    await page.screenshot({ path: `output/playwright/${test.info().project.name}-mobile-editor.png`, fullPage: true });
  });

  test("opens a generated field, edits it, scrubs, and exports a PNG", async ({ page }) => {
    await openGenerated(page);
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();

    await page.getByRole("button", { name: "Fracture", exact: true }).click();
    await page.getByLabel("Signal seed").fill("BROWSER-QA");
    await page.getByLabel("Duration value").fill("0.5");
    await page.getByLabel("Timeline scrubber").click({ position: { x: 270, y: 14 } });
    await expect(page.locator(".timeline-timecode")).not.toHaveText("0:00.00");

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Still frame" }).click();
    await page.getByRole("button", { name: "Export PNG" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 30_000 });

    await captureExportResult(page, "generated-frame.png");
    await requestExportDownload(page);
    await page.screenshot({ path: `output/playwright/${test.info().project.name}-editor.png`, fullPage: true });
  });

  test("renders a short playable browser video export", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Video encoder evidence is collected in Chromium; PNG and import coverage run in both browsers.");
    await openGenerated(page);
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await page.getByLabel("Duration value").fill("0.5");
    await page.getByRole("button", { name: "Export" }).click();
    const exportStartedAt = Date.now();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 60_000 });
    console.log(`[BEND PERF] generated_video_export_ms=${Date.now() - exportStartedAt}`);
    await expect(page.locator(".export-result video")).toBeVisible();

    await captureExportResult(page, "generated-video");
    await requestExportDownload(page);
  });

  test("exports 5, 10, and 15 second compositions", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Long export timing evidence is collected in Chromium.");
    await openGenerated(page);
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    for (const seconds of [5, 10, 15]) {
      await page.getByLabel("Duration value").fill(String(seconds));
      await expect(page.locator(".timeline-duration").first()).toHaveText(`/ 0:${String(seconds).padStart(2, "0")}.00`);
      await page.getByRole("button", { name: "Export" }).click();
      const exportStartedAt = Date.now();
      await page.getByRole("button", { name: "Export video" }).click();
      await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 180_000 });
      const exportMs = Date.now() - exportStartedAt;
      const videoMetadata = await page.locator(".export-result video").evaluate((element) => {
        const video = element as HTMLVideoElement;
        return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
      });
      console.log(`[BEND PERF] long_export=${JSON.stringify({ seconds, exportMs, ...videoMetadata })}`);
      await captureExportResult(page, `long-${seconds}.mp4`);
      await requestExportDownload(page);
      await page.getByRole("button", { name: "Done" }).click();
    }
  });

  test("exports the full canvas size when high quality is selected", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "High-resolution encoder evidence is collected in Chromium.");
    await openGenerated(page);
    await page.getByLabel("Duration value").fill("0.5");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: /Canvas 1080 × 1350/ }).click();
    const exportStartedAt = Date.now();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 120_000 });
    const videoMetadata = await page.locator(".export-result video").evaluate((element) => {
      const video = element as HTMLVideoElement;
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    });
    console.log(`[BEND PERF] high_quality_export=${JSON.stringify({ exportMs: Date.now() - exportStartedAt, ...videoMetadata })}`);
    expect(videoMetadata.width).toBe(1080);
    expect(videoMetadata.height).toBe(1350);
    await captureExportResult(page, "high-quality.mp4");
    await requestExportDownload(page);
  });

  test("cancels an active export and returns to the editor", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Canvas encoder cancellation evidence is collected in Chromium.");
    await openGenerated(page);
    await page.getByLabel("Duration value").fill("15");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByRole("button", { name: "Cancel export" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Cancel export" }).click();
    await expect(page.getByText("Export cancelled.", { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("persists a generated project across a browser reload", async ({ page }) => {
    await openGenerated(page);
    await page.getByLabel("Project name").fill("Persistence QA");
    await page.getByLabel("Signal seed").fill("PERSIST-01");
    await expect(page.getByText("Saved locally", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByLabel("Project name")).toHaveValue("Persistence QA", { timeout: 10_000 });
    await expect(page.getByLabel("Signal seed")).toHaveValue("PERSIST-01");
  });

  test("keeps timeline keyboard seeking and focus behavior usable", async ({ page }) => {
    await openGenerated(page);
    const scrubber = page.getByLabel("Timeline scrubber");
    await scrubber.focus();
    await expect(scrubber).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".timeline-timecode")).not.toHaveText("0:00.00");
    await page.keyboard.press("Home");
    await expect(page.locator(".timeline-timecode")).toHaveText("0:00.00");
    const exportButton = page.getByRole("button", { name: "Export" });
    await exportButton.focus();
    await expect(exportButton).toBeFocused();
  });

  test("operates clip movement and trimming from the keyboard", async ({ page }) => {
    await openStudio(page);
    await page.locator('input[aria-label="Choose local video footage"]').setInputFiles(path.resolve("tests/fixtures/test-pattern.mp4"));
    const clip = page.locator(".timeline-clip").first();
    await clip.focus();
    const startBefore = await clip.getAttribute("aria-label");
    await clip.press("ArrowRight");
    await expect(clip).not.toHaveAttribute("aria-label", startBefore ?? "");

    const trimStart = page.getByRole("slider", { name: /Trim start/ });
    await trimStart.focus();
    const trimBefore = await trimStart.getAttribute("aria-valuenow");
    await trimStart.press("ArrowRight");
    await expect(trimStart).not.toHaveAttribute("aria-valuenow", trimBefore ?? "");
  });

  test("returns focus to the export trigger after the dialog closes", async ({ page }) => {
    await openGenerated(page);
    const exportButton = page.getByRole("button", { name: "Export" });
    await exportButton.click();
    await expect(page.getByRole("button", { name: "Close export dialog" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(exportButton).toBeFocused();
  });

  test("moves and trims independent timeline clips", async ({ page }) => {
    await openStudio(page);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/test-pattern.mp4"));
    await expect(page.getByText("Imported footage", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="file"]').first().setInputFiles([]);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/test-pattern.webm"));
    await expect(page.locator(".timeline-clip")).toHaveCount(2, { timeout: 30_000 });

    const clips = page.locator(".timeline-clip");
    const firstClip = clips.first();
    const firstBefore = await firstClip.getAttribute("aria-label");
    const firstBox = await firstClip.boundingBox();
    if (!firstBox) throw new Error("The first timeline clip has no layout box.");
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(firstBox.x + firstBox.width / 2 + Math.max(40, firstBox.width * 0.25), firstBox.y + firstBox.height / 2);
    await page.mouse.up();
    await expect(firstClip).not.toHaveAttribute("aria-label", firstBefore ?? "");

    const firstEnd = clips.first().locator(".clip-trim-end");
    const firstEndBox = await firstEnd.boundingBox();
    if (!firstEndBox) throw new Error("The first clip trim handle has no layout box.");
    await page.mouse.move(firstEndBox.x + firstEndBox.width / 2, firstEndBox.y + firstEndBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(firstEndBox.x - Math.max(25, firstEndBox.width * 4), firstEndBox.y + firstEndBox.height / 2);
    await page.mouse.up();

    const secondStart = clips.nth(1).locator(".clip-trim-start");
    const secondStartBox = await secondStart.boundingBox();
    if (!secondStartBox) throw new Error("The second clip trim handle has no layout box.");
    await page.mouse.move(secondStartBox.x + secondStartBox.width / 2, secondStartBox.y + secondStartBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondStartBox.x + Math.max(25, secondStartBox.width * 4), secondStartBox.y + secondStartBox.height / 2);
    await page.mouse.up();
    await expect(clips.nth(0)).toHaveAttribute("aria-label", /lasts at|lasts/);
    await expect(clips.nth(1)).toHaveAttribute("aria-label", /lasts at|lasts/);
  });

  test("imports local WebM footage and enables Wave Displacement", async ({ page }) => {
    await openStudio(page);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/test-pattern.webm"));
    await expect(page.getByText("Imported footage", { exact: true })).toBeVisible();
    await expect(page.getByText(/320 × 240 · 2\.00s/)).toBeVisible();
    await expect(page.getByText("Warming the GPU compositor…")).toBeHidden({ timeout: 30_000 });

    await page.getByRole("button", { name: "Effects" }).click();
    const toggle = page.getByRole("button", { name: "Toggle Wave Displacement" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: `output/playwright/${test.info().project.name}-video-effects.png`, fullPage: true });
  });

  test("composes two imported clips with a Signal Field and exports the stack", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The multi-layer encoder path is measured in Chromium; layer controls run in both browsers.");
    await openStudio(page);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/constant-24.mp4"));
    await expect(page.getByText("Imported footage", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="file"]').first().setInputFiles([]);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/constant-30.mp4"));
    await expect(page.locator(".timeline-track")).toHaveCount(2, { timeout: 30_000 });

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await expect(page.locator(".timeline-track")).toHaveCount(3);
    await expect(page.locator(".layer-select")).toHaveCount(3);

    await page.locator(".layer-select").first().click();
    await page.getByLabel("Opacity value").fill("0.65");
    await page.getByLabel("Out value").fill("1");
    await page.getByRole("button", { name: "Effects" }).click();
    await page.getByRole("button", { name: "Toggle Wave Displacement" }).click();
    await expect(page.getByRole("button", { name: "Toggle Wave Displacement" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();

    await page.getByRole("button", { name: "Export" }).click();
    const exportStartedAt = Date.now();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 90_000 });
    console.log(`[BEND PERF] multi_layer_export_ms=${Date.now() - exportStartedAt}`);
    await expect(page.getByText(/Video-only/)).toBeVisible();
    await page.screenshot({ path: `output/playwright/${test.info().project.name}-multi-layer.png`, fullPage: true });
  });

  test("retains compatible source audio after a trim", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Audio encoding evidence is collected in Chromium where the Mediabunny MP4 path is available.");
    await openStudio(page);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
    await expect(page.getByText(/Source audio detected/)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Out value").fill("1");
    await page.getByRole("button", { name: "Export" }).click();
    const exportStartedAt = Date.now();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 90_000 });
    console.log(`[BEND PERF] audio_export_ms=${Date.now() - exportStartedAt}`);
    await expect(page.getByText("Source audio included", { exact: true })).toBeVisible();
    await captureExportResult(page, "audio-export.mp4");
    await requestExportDownload(page);
  });

  test("exports video-only when the source layer is muted", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Muted-audio encoder evidence is collected in Chromium.");
    await openStudio(page);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
    await expect(page.getByText(/Source audio detected/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Mute Imported footage" }).click();
    await expect(page.getByRole("button", { name: "Unmute Imported footage" })).toBeVisible();
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Video-only · Source audio is muted/)).toBeVisible();
    await captureExportResult(page, "muted-export.mp4");
    await requestExportDownload(page);
  });

  test("exports imported footage after trim, transform, and displacement", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Imported-video export evidence is collected in Chromium; import and effect controls run in both browsers.");
    await openStudio(page);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/test-pattern.webm"));
    await expect(page.getByText(/320 × 240 · 2\.00s/)).toBeVisible();
    await expect(page.getByText("Warming the GPU compositor…")).toBeHidden({ timeout: 30_000 });

    await page.getByLabel("Canvas format").selectOption("1:1");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Scale value").fill("1.2");
    await page.getByLabel("Out value").fill("1");
    await page.getByRole("button", { name: "Effects" }).click();
    const toggle = page.getByRole("button", { name: "Toggle Wave Displacement" });
    await toggle.click();
    await page.getByLabel("Intensity value").fill("0.65");
    await expect(page.locator(".timeline-duration").first()).toHaveText("/ 0:01.00");

    await page.getByRole("button", { name: "Export" }).click();
    const exportStartedAt = Date.now();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 60_000 });
    console.log(`[BEND PERF] imported_video_export_ms=${Date.now() - exportStartedAt}`);
    await captureExportResult(page, "imported-video");
    await requestExportDownload(page);
  });
});
