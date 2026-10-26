import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { openStudio } from "./studio-helpers";

test.describe.configure({ timeout: 180_000 });

test("exports VFR and nonzero-start fixtures through timestamp-based decoding", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Timestamp export evidence runs on Chromium's Mediabunny path.");
  const fixtures = [
    { name: "vfr-irregular", path: "tests/fixtures/vfr-irregular.mp4", duration: /0\.97s/, expectedDuration: 0.966667 },
    { name: "nonzero-video-start", path: "tests/fixtures/nonzero-video-start.webm", duration: /1\.25s/, expectedDuration: 1.25 },
  ];
  for (const fixture of fixtures) {
    await openStudio(page);
    await page.locator('input[aria-label="Choose local video footage"]').setInputFiles(path.resolve(fixture.path));
    await expect(page.getByText(fixture.duration, { exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Warming the GPU compositor…")).toBeHidden({ timeout: 30_000 });
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 120_000 });
    const metadata = await page.locator(".export-result video").evaluate((element) => {
      const video = element as HTMLVideoElement;
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    });
    console.log(`[BEND TIMING] ${fixture.name}=${JSON.stringify(metadata)}`);
    expect(metadata.duration).toBeCloseTo(fixture.expectedDuration, 3);
    const resultUrl = await page.locator(".export-result video").getAttribute("src");
    expect(resultUrl).toMatch(/^blob:/);
    if (!resultUrl) throw new Error("BEND export result did not expose a blob URL.");
    const outputBytes = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    }, resultUrl);
    await writeFile(test.info().outputPath(`${fixture.name}-export.mp4`), Uint8Array.from(outputBytes));
    await page.getByRole("button", { name: /Download bend-/ }).click();
    await page.getByRole("button", { name: "Done" }).click();
  }
});
