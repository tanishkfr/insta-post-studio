import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { openGenerated } from "./studio-helpers";

async function saveExportResult(page: import("@playwright/test").Page, outputName: string): Promise<void> {
  const result = page.locator(".export-result video, .export-result img").first();
  const source = await result.getAttribute("src");
  if (!source) throw new Error("BEND export result did not expose a blob URL.");
  const bytes = await page.evaluate(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`BEND export result fetch failed: ${response.status}`);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, source);
  await writeFile(`output/playwright/${outputName}`, Uint8Array.from(bytes));
}

test.describe("BEND Phase 5.1D direct manipulation", () => {
  test("exposes transform, animation-aware appearance, and crop controls", async ({ page }) => {
    await openGenerated(page);
    await expect(page.locator(".canvas-selection")).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto-Key" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Opacity value")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anchor middle center" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Flip horizontal" }).click();
    await page.getByRole("button", { name: "Anchor top left" }).click();
    await page.getByLabel("Brightness value").fill("0.2");
    await expect(page.getByLabel("Brightness value")).toHaveValue("0.2");

    await page.getByRole("button", { name: "Crop on canvas" }).click();
    await expect(page.getByRole("button", { name: "Confirm crop" })).toBeVisible();
    await expect(page.locator(".crop-handle")).toHaveCount(8);
    const cropBefore = await page.locator(".crop-footer").innerText();
    const eastHandle = page.locator(".crop-handle.handle-e");
    const eastBox = await eastHandle.boundingBox();
    if (!eastBox) throw new Error("Crop east handle has no layout box.");
    await page.mouse.move(eastBox.x + eastBox.width / 2, eastBox.y + eastBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(eastBox.x - Math.max(16, eastBox.width * 2), eastBox.y + eastBox.height / 2);
    await page.mouse.up();
    await expect(page.locator(".crop-footer")).not.toHaveText(cropBefore);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Crop on canvas" })).toBeVisible();

    await page.screenshot({ path: `output/playwright/${test.info().project.name}-phase5-1d-controls.png`, fullPage: true });
  });

  test("supports a direct move and responsive controls without horizontal overflow", async ({ page }) => {
    await openGenerated(page);
    const frame = page.locator(".canvas-frame");
    const frameBox = await frame.boundingBox();
    if (!frameBox) throw new Error("Canvas frame has no layout box.");
    const positionX = page.getByLabel("Position X value");
    const before = await positionX.inputValue();
    await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + frameBox.width / 2 + 36, frameBox.y + frameBox.height / 2 + 18);
    await page.mouse.up();
    await expect(positionX).not.toHaveValue(before);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open controls" }).click();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `output/playwright/${test.info().project.name}-phase5-1d-mobile.png`, fullPage: true });
  });

  test("exports a directly edited still frame through the shared renderer", async ({ page }) => {
    await openGenerated(page);
    await page.getByRole("button", { name: "Flip horizontal" }).click();
    await page.getByLabel("Brightness value").fill("0.2");
    await page.getByRole("button", { name: "1:1", exact: true }).click();

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Still frame" }).click();
    await page.getByRole("button", { name: "Export PNG" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".export-result img")).toBeVisible();
    await saveExportResult(page, "chromium-phase5-1d-edited.png");
    await page.getByRole("button", { name: "Done" }).click();
  });

  test("exports a directly transformed short video in Chromium", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Video encoder evidence is collected in Chromium.");
    await openGenerated(page);
    await page.getByRole("button", { name: "Rotate clockwise 90 degrees" }).click();
    await page.getByLabel("Contrast value").fill("0.2");
    await page.getByLabel("Duration value").fill("0.5");

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Export video" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".export-result video")).toBeVisible();
    await saveExportResult(page, "chromium-phase5-1d-edited.mp4");
  });
});
