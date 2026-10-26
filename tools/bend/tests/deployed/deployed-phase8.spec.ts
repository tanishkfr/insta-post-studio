import path from "node:path";
import fs from "node:fs";
import { expect, test, openStudio } from "./helpers";

test.describe("Phase 8.0 deployed short-form studio", () => {
  test("opens directly, survives refresh, and renders a procedural composition @smoke", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await expect(page.getByRole("heading", { name: "Signal Field controls", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".sequence-editor")).toBeVisible();
    await expect(page.getByRole("group", { name: "Clip editing actions" })).toBeVisible();
    await expect(page.locator(".sequence-music-empty")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".sequence-editor")).toBeVisible();
  });

  test("imports multiple shots, splits, transitions, adds music, saves, reloads, and exports @full", async ({ page }, testInfo) => {
    test.skip(!["chrome", "edge"].includes(testInfo.project.name), "Full media encode acceptance runs on Chromium-based deployed projects.");
    test.setTimeout(180_000);
    await openStudio(page);
    await page.getByLabel("Add local video").setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
    await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 45_000 });
    await page.locator(".sequence-clip-hit").first().click();
    const ruler = page.getByLabel("Timeline scrubber");
    await ruler.scrollIntoViewIfNeeded();
    const box = await ruler.boundingBox();
    if (!box) throw new Error("Timeline ruler is not visible");
    await page.mouse.click(box.x + box.width * 0.5, box.y + 10);
    await page.getByRole("button", { name: /Split selected clip/ }).click();
    await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 15_000 });

    await page.locator(".sequence-clip-hit").nth(1).click();
    await page.locator('.inspector-panel[aria-hidden="false"] summary').filter({ hasText: "Transition in" }).click();
    await page.locator(".transition-section").getByRole("button", { name: "Apply transition" }).click();
    await expect(page.locator(".sequence-transition")).toHaveCount(1);

    await page.locator('.inspector-panel[aria-hidden="false"] summary').filter({ hasText: "Speed and time" }).click();
    const speed = page.locator('.clip-timing-section input[aria-label="Speed value"]');
    await speed.fill("1.5");
    await speed.blur();

    await page.getByLabel("Add local soundtrack").setInputFiles(path.resolve("tests/fixtures/music-bed-4s.mp3"));
    await expect(page.locator(".sequence-music-clip")).toHaveCount(1, { timeout: 45_000 });
    await page.getByRole("button", { name: "Set cover", exact: true }).click();
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 30_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 45_000 });
    await expect(page.locator(".sequence-transition")).toHaveCount(1);
    await expect(page.locator(".sequence-music-clip")).toHaveCount(1);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await dialog.getByRole("button", { name: /Quick preview/ }).click();
    await dialog.getByRole("button", { name: /Export social video|Export range/ }).click();
    await expect(page.getByText(/Export validated/)).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText(/Mixed timeline audio included/)).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download bend-/ }).click();
    const download = await downloadPromise;
    const target = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(target);
    expect(fs.statSync(target).size).toBeGreaterThan(10_000);
  });

  test("mobile shell keeps the sequence surface usable @mobile", async ({ page }) => {
    await openStudio(page);
    await expect(page.locator(".sequence-editor")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Open controls" }).click();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  });
});
