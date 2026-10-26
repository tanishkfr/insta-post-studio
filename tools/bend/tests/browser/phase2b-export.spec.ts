import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openGenerated } from "./studio-helpers";

test.describe.configure({ timeout: 300_000 });

const generators = [
  { id: "signal-field", name: "Signal Field" },
  { id: "liquid", name: "Liquid" },
  { id: "flow", name: "Flow" },
  { id: "refraction", name: "Refraction" },
] as const;

test("verifies five-second Phase 2B generator exports and saved-project reopen", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "The verified Phase 2B video encoder path is Chromium-only on this host.");
  await openGenerated(page);
  await page.getByLabel("Duration value").fill("5");
  await expect(page.locator(".timeline-duration").first()).toHaveText("/ 0:05.00");

  const evidenceDirectory = path.resolve("output/evidence/phase2b");
  await mkdir(evidenceDirectory, { recursive: true });

  for (const generator of generators) {
    await page.getByRole("button", { name: `${generator.name} generator` }).click();
    await expect(page.getByRole("heading", { name: `${generator.name} controls` })).toBeVisible();
    await page.getByLabel("Duration value").fill("5");
    await expect(page.locator(".timeline-duration").first()).toHaveText("/ 0:05.00");

    if (generator.id === "liquid") {
      await page.getByLabel("Timeline scrubber").click({ position: { x: 360, y: 14 } });
      await page.getByLabel("Timeline scrubber").click({ position: { x: 32, y: 14 } });
    }

    const exportBlob = async (suffix: string): Promise<void> => {
      await page.getByRole("button", { name: "Export" }).click();
      await page.getByRole("button", { name: "Export video" }).click();
      await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 240_000 });
      const video = page.locator(".export-result video");
      await expect(video).toBeVisible();
      const metadata = await video.evaluate((element) => {
        const source = element as HTMLVideoElement;
        return { duration: source.duration, width: source.videoWidth, height: source.videoHeight };
      });
      expect(metadata.duration).toBeGreaterThan(4.9);
      expect(metadata.duration).toBeLessThanOrEqual(5.05);
      expect(metadata.width).toBe(720);
      expect(metadata.height).toBe(900);
      const source = await video.getAttribute("src");
      if (!source) throw new Error("Phase 2B export did not expose a blob URL.");
      const bytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), source);
      const outputPath = path.join(evidenceDirectory, `${generator.id}-${suffix}.mp4`);
      await writeFile(outputPath, Uint8Array.from(bytes));
      console.log(`[BEND GATE ZERO] ${JSON.stringify({ generator: generator.id, outputPath, ...metadata })}`);
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };

    await exportBlob(generator.id === "liquid" ? "before" : "main");
    if (generator.id === "liquid") await exportBlob("after-seek");

    await page.reload();
    await expect(page.locator(".canvas-frame canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: `${generator.name} controls` })).toBeVisible({ timeout: 30_000 });
  }

  console.log(`[BEND GATE ZERO] evidence=${testInfo.outputDir}`);
});
