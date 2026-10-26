import { expect, test } from "@playwright/test";
import { openGenerated, openStudio } from "./studio-helpers";

test.describe("BEND Phase 5.1A unified studio", () => {
  test("opens the studio directly at root and on the legacy studio route", async ({ page }) => {
    await openStudio(page, "/");
    await expect(page.getByRole("heading", { name: "Start with a moving image." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open First Study" })).toBeVisible();

    await openStudio(page, "/studio");
    await expect(page.getByRole("heading", { name: "Start with a moving image." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload footage" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remix footage" })).toHaveCount(0);
  });

  test("keeps add, edit, effects, and motion in one workspace", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("menu", { name: "Add to composition" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Add video" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Signal Field" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Open First Study" })).toHaveCount(0);

    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await expect(page.getByRole("heading", { name: "Signal Field", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mute Signal Field" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Signal Field" })).toBeVisible();
    await page.getByRole("button", { name: "Effects", exact: true }).click();
    await expect(page.getByText("Temporal effects", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Motion", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Keyframes and modulation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  });

  test("restores the example composition from the empty canvas", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Open First Study" }).click();
    await expect(page.getByRole("heading", { name: "BEND / First Study" })).toBeVisible();
    await expect(page.locator(".timeline-clip")).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole("heading", { name: "BEND / First Study" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".timeline-clip")).toHaveCount(2);
  });

  test("keeps the shell within tablet and mobile widths", async ({ page }) => {
    await openGenerated(page);
    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const dimensions = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
      expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.width);
    }
  });
});
