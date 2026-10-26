import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";
import { openGenerated, openStudio } from "./studio-helpers";

async function expectAccessible(page: Page, surface: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const summary = results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`).join("\n");
  expect(results.violations, `${surface} accessibility violations\n${summary}`).toEqual([]);
}

test.describe("BEND accessibility audit", () => {
  test("direct studio has no automated WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible();
    await expectAccessible(page, "direct studio");
  });

  test("legacy studio route has no automated WCAG 2.2 AA violations", async ({ page }) => {
    await openStudio(page, "/studio");
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
    await expectAccessible(page, "legacy studio route");
  });

  test("generated editor and mobile inspector have no automated violations", async ({ page }) => {
    await openGenerated(page);
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await expectAccessible(page, "generated editor");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open controls" }).click();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
    await expectAccessible(page, "mobile inspector");
  });

  test("timeline, inspector, and export dialog have no automated violations", async ({ page }) => {
    await openGenerated(page);
    await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
    await expectAccessible(page, "timeline and inspector");

    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("dialog", { name: "Export composition" })).toBeVisible();
    await expectAccessible(page, "export dialog");
  });

  test("loaded footage and effects inspector have no automated violations", async ({ page }) => {
    await openStudio(page);
    await page.locator('input[aria-label="Add local video"]').setInputFiles(path.resolve("tests/fixtures/test-pattern.mp4"));
    await expect(page.locator(".inspector-layer-type")).toContainText("Imported footage", { timeout: 30_000 });
    await page.getByRole("button", { name: "Effects" }).click();
    await expectAccessible(page, "loaded footage and effects inspector");
  });

  test("unsupported import error has an accessible alert", async ({ page }) => {
    await openStudio(page);
    await page.locator('input[aria-label="Choose local video footage"]').setInputFiles({
      name: "unsupported.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a video"),
    });
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("not supported");
    await expectAccessible(page, "unsupported import error");
  });
});
