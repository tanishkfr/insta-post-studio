import { expect, test, fixturePath, importVideo, openStudio, saveDownload } from "./helpers";
import fs from "node:fs";
import path from "node:path";

const evidenceDirectory = path.resolve("output/evidence/phase7-0/deployed-tests");

async function saveNamedFile(download: import("@playwright/test").Download, target: string): Promise<void> {
  await download.saveAs(target);
}

test.describe("deployed export matrix", () => {
  test("exports full-quality MP4 with source audio, a PNG still, a partial range, and a muted video-only result @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await page.getByLabel("Out value", { exact: true }).fill("2");
    await page.getByLabel("Out value", { exact: true }).press("Enter");
    await expect(page.locator(".timeline-duration").first()).toHaveText("/ 0:02.00");

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await expect(dialog.getByRole("button", { name: /High quality/ })).toHaveAttribute("aria-pressed", "true");
    const started = Date.now();
    await dialog.getByRole("button", { name: /Export social video/ }).click();
    await expect(page.getByText(/Export (complete|validated)/)).toBeVisible({ timeout: 300_000 });
    const elapsed = Date.now() - started;
    const resultText = await dialog.locator(".export-result").innerText();
    expect(resultText).toMatch(/video\/mp4/i);
    expect(resultText).toMatch(/Mixed timeline audio included/i);
    const videoMetadata = await dialog.locator(".export-result video").evaluate(async (video) => {
      const element = video as HTMLVideoElement;
      if (element.readyState < 1) await new Promise<void>((resolve) => element.addEventListener("loadedmetadata", () => resolve(), { once: true }));
      return { duration: element.duration, width: element.videoWidth, height: element.videoHeight };
    });
    expect(videoMetadata.duration).toBeGreaterThan(1.9);
    expect(videoMetadata.duration).toBeLessThan(2.2);
    expect(videoMetadata.width).toBe(1080);
    expect(videoMetadata.height).toBe(1350);
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download bend-/ }).click();
    const download = await downloadPromise;
    const file = await saveDownload(download, path.join(evidenceDirectory, testInfo.project.name));
    const bytes = fs.readFileSync(file);
    expect(bytes.byteLength).toBeGreaterThan(50_000);
    expect(bytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
    await dialog.getByRole("button", { name: "Done" }).click();
    testInfo.annotations.push({ type: "full-quality-export", description: `${elapsed} ms, ${bytes.byteLength} bytes, ${videoMetadata.width}x${videoMetadata.height}` });

    // Partial work range.
    await page.getByLabel("Loop start seconds").fill("0.5");
    await page.getByLabel("Loop end seconds").fill("1.5");
    await page.getByRole("button", { name: "Loop Off" }).click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const rangeDialog = page.getByRole("dialog", { name: "Export composition" });
    await rangeDialog.getByRole("button", { name: /Quick preview/i }).click();
    await rangeDialog.getByRole("button", { name: /Loop \/ work range/ }).click();
    await rangeDialog.getByRole("button", { name: "Export range" }).click();
    await expect(page.getByText(/Export (complete|validated)/)).toBeVisible({ timeout: 180_000 });
    const rangeDownloadPromise = page.waitForEvent("download");
    await rangeDialog.getByRole("button", { name: /Download bend-/ }).click();
    const rangeDownload = await rangeDownloadPromise;
    expect(rangeDownload.suggestedFilename()).toMatch(/-0\.50-1\.50\.(mp4|webm)$/);
    const rangeFile = await saveDownload(rangeDownload, path.join(evidenceDirectory, testInfo.project.name));
    expect(fs.statSync(rangeFile).size).toBeGreaterThan(5_000);
    await rangeDialog.getByRole("button", { name: "Done" }).click();

    // Mute the primary source and export the range again.
    await page.locator('.inspector-layer-actions button[aria-label^="Mute "]').click();
    await page.getByLabel("Loop end seconds").fill("1");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const mutedDialog = page.getByRole("dialog", { name: "Export composition" });
    await mutedDialog.getByRole("button", { name: /Quick preview/i }).click();
    await mutedDialog.getByRole("button", { name: /Loop \/ work range/ }).click();
    await mutedDialog.getByRole("button", { name: "Export range" }).click();
    await expect(page.getByText(/Export (complete|validated)/)).toBeVisible({ timeout: 180_000 });
    const mutedResult = await mutedDialog.locator(".export-result").innerText();
    expect(mutedResult).toMatch(/Video-only/i);
    const mutedDownloadPromise = page.waitForEvent("download");
    await mutedDialog.getByRole("button", { name: /Download bend-/ }).click();
    const mutedDownload = await mutedDownloadPromise;
    await saveNamedFile(mutedDownload, path.join(evidenceDirectory, testInfo.project.name, `muted-${mutedDownload.suggestedFilename()}`));
    await mutedDialog.getByRole("button", { name: "Done" }).click();
  });

  test("exports a mirrored seamless loop for analytic generators and reports the mirroring policy @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await page.getByLabel("Loop start seconds").fill("1");
    await page.getByLabel("Loop end seconds").fill("2.5");
    await page.getByRole("button", { name: "Loop Off" }).click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await dialog.getByRole("button", { name: /Quick preview/i }).click();
    await dialog.getByRole("button", { name: /Loop \/ work range/ }).click();
    const seamless = dialog.getByLabel(/Seamless repeat/);
    await expect(seamless).toBeEnabled();
    await seamless.check();
    await expect(dialog.getByText(/Mirrored \(ping-pong\) time map/i)).toBeVisible();
    await dialog.getByRole("button", { name: "Export seamless loop" }).click();
    await expect(page.getByText(/Export (complete|validated)/)).toBeVisible({ timeout: 180_000 });
    const text = await dialog.locator(".export-result").innerText();
    expect(text).toMatch(/Video-only/i);
    expect(text).toMatch(/mirrored time|seamless repeat/i);
    const metadata = await dialog.locator(".export-result video").evaluate(async (video) => {
      const element = video as HTMLVideoElement;
      if (element.readyState < 1) await new Promise<void>((resolve) => element.addEventListener("loadedmetadata", () => resolve(), { once: true }));
      return { duration: element.duration };
    });
    expect(metadata.duration).toBeGreaterThan(1.3);
    expect(metadata.duration).toBeLessThan(1.8);
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download bend-/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-1\.00-2\.50\.(mp4|webm)$/);
    await saveDownload(download, path.join(evidenceDirectory, testInfo.project.name));
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "seamless-export.png"), fullPage: true });
  });

  test("reports an injected unsupported-encoder failure and recovers on retry @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await page.getByRole("group", { name: "Signal Field generator controls" }).getByLabel("Duration value").fill("1");
    await page.getByRole("group", { name: "Signal Field generator controls" }).getByLabel("Duration value").press("Enter");
    await page.evaluate(() => {
      const scope = window as unknown as { __bendEncoders?: { VideoEncoder: unknown; MediaRecorder: unknown } };
      scope.__bendEncoders = { VideoEncoder: window.VideoEncoder, MediaRecorder: window.MediaRecorder };
      Object.defineProperty(window, "VideoEncoder", { value: undefined, configurable: true });
      Object.defineProperty(window, "MediaRecorder", { value: undefined, configurable: true });
    });
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await dialog.getByRole("button", { name: /Export social video/ }).click();
    await expect(dialog.getByRole("alert")).toContainText(/cannot encode|encoder|WebCodecs/i, { timeout: 60_000 });
    testInfo.annotations.push({ type: "fault-injection", description: "VideoEncoder and MediaRecorder removed for the first export attempt." });
    await dialog.getByRole("button", { name: "Close export dialog" }).click();
    await page.evaluate(() => {
      const scope = window as unknown as { __bendEncoders?: { VideoEncoder: unknown; MediaRecorder: unknown } };
      if (scope.__bendEncoders) {
        Object.defineProperty(window, "VideoEncoder", { value: scope.__bendEncoders.VideoEncoder, configurable: true });
        Object.defineProperty(window, "MediaRecorder", { value: scope.__bendEncoders.MediaRecorder, configurable: true });
      }
    });
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const retryDialog = page.getByRole("dialog", { name: "Export composition" });
    await retryDialog.getByRole("button", { name: /Export social video/ }).click();
    await expect(page.getByText(/Export (complete|validated)/)).toBeVisible({ timeout: 120_000 });
    const downloadPromise = page.waitForEvent("download");
    await retryDialog.getByRole("button", { name: /Download bend-/ }).click();
    const download = await downloadPromise;
    const file = await saveDownload(download, path.join(evidenceDirectory, testInfo.project.name));
    expect(fs.statSync(file).size).toBeGreaterThan(1_000);
    await retryDialog.getByRole("button", { name: "Done" }).click();
  });

  test("cancels an in-flight high-quality export and completes a retry without a stale download @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await page.getByLabel("Out value", { exact: true }).fill("2");
    await page.getByLabel("Out value", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await dialog.getByRole("button", { name: /Export social video/ }).click();
    await expect(dialog.getByRole("progressbar", { name: "Export progress" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await dialog.getByRole("button", { name: "Cancel export" }).click();
    await expect(dialog.getByText("Export cancelled.")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("button", { name: "Retry export" })).toBeVisible();
    await expect(dialog.locator(".export-result video")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Retry export" }).click();
    await expect(page.getByText(/Export (complete|validated)/)).toBeVisible({ timeout: 300_000 });
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download bend-/ }).click();
    const download = await downloadPromise;
    const file = await saveDownload(download, path.join(evidenceDirectory, testInfo.project.name));
    expect(fs.statSync(file).size).toBeGreaterThan(50_000);
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "cancel-retry.png"), fullPage: true });
  });
});
