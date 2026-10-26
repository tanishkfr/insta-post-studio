import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Maintained Studio 2.0 smoke suite. Historical phase2a1/2b/3/4/5 specs are
 * retained for archaeology but are not part of the current gate because they
 * encode removed selectors and the pre-Studio-2.0 interaction model.
 */
async function openStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".canvas-frame canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByText("Warming the GPU compositor…").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
}

test.describe("Studio 2.0 local smoke", () => {
  test("keeps the full Add menu reachable on a short viewport", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Add to composition" });
    await expect(menu).toBeVisible();
    const metrics = await menu.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        top: box.top,
        bottom: box.bottom,
        viewportHeight: window.innerHeight,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
      };
    });
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    expect(["auto", "scroll"]).toContain(metrics.overflowY);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    const lastItem = menu.getByRole("menuitem").last();
    await lastItem.scrollIntoViewIfNeeded();
    const itemBox = await lastItem.boundingBox();
    expect(itemBox).not.toBeNull();
    expect(itemBox!.y).toBeGreaterThanOrEqual(metrics.top - 1);
    expect(itemBox!.y + itemBox!.height).toBeLessThanOrEqual(metrics.bottom + 1);
  });

  test("creates a signal field and downloads a PNG still", async ({ page }, testInfo) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await expect(page.getByRole("heading", { name: "Signal Field controls", exact: true })).toBeVisible();
    await page.getByRole("group", { name: "Signal Field preset" }).getByRole("button", { name: "Fracture", exact: true }).click();
    await page.getByLabel("Signal seed").fill("STUDIO2-SMOKE");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await dialog.getByRole("button", { name: "Current still" }).click();
    await dialog.getByRole("button", { name: "Export still PNG" }).click();
    await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 60_000 });
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download bend-/ }).click();
    const download = await downloadPromise;
    const target = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(target);
    const bytes = fs.readFileSync(target);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    await dialog.getByRole("button", { name: "Done" }).click();
  });

  test("imports footage, trims, and restores the project after reload", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Codec fixture coverage is exercised in the cross-browser deployed smoke suite.");
    await openStudio(page);
    await page.getByLabel("Add local video").setInputFiles(path.resolve("tests/fixtures/test-pattern.mp4"));
    await expect(page.locator(".inspector-title")).toHaveText("test-pattern", { timeout: 30_000 });
    await page.getByLabel("Out value", { exact: true }).fill("1.5");
    await page.getByLabel("Out value", { exact: true }).press("Enter");
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 15_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".timeline-track")).toHaveCount(1);
    await expect(page.getByLabel("Out value", { exact: true })).toHaveValue("1.5");
  });

  test("supports loop-handle and timeline keyboard input", async ({ page }) => {
    await openStudio(page);
    await page.getByLabel("Timeline scrubber").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".timeline-timecode")).not.toHaveText("0:00.00");
    await page.getByRole("button", { name: "Loop Off" }).click();
    const loopEnd = page.getByRole("slider", { name: "Drag loop end" });
    const before = Number(await loopEnd.getAttribute("aria-valuenow"));
    await loopEnd.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => Number(await loopEnd.getAttribute("aria-valuenow"))).toBeLessThan(before);
  });

  test("keeps inspector navigation visible while editing scrolled sections", async ({ page }) => {
    await openStudio(page);
    await page.locator('input[aria-label="Add local video"]').setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
    await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });
    await page.locator(".sequence-clip-hit").first().click();
    await expect(page.getByRole("tab", { name: "Edit", exact: true })).toBeVisible();
    await page.locator(".editor-inspector").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole("tab", { name: "Edit", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Effects", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Motion", exact: true })).toBeVisible();
  });

  test("keeps the project library open when First Study is cancelled", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await expect(page.getByRole("heading", { name: "Signal Field controls", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open project library" }).click();
    const library = page.getByRole("dialog", { name: "Your projects" });
    await expect(library).toBeVisible();
    await library.getByRole("button", { name: "Open First Study" }).click();
    const confirmation = page.getByRole("dialog", { name: "Open First Study?" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Keep working" }).click();
    await expect(confirmation).toBeHidden();
    await expect(library).toBeVisible();
    await library.getByRole("button", { name: "Close project library" }).click();
    await expect(library).toBeHidden();
  });

  test("keeps the mobile studio shell free of horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStudio(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Open controls" }).click();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  });
});
