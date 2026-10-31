import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  bendFrame,
  chooseFormat,
  openBend,
  publishBend,
  waitForBendReady,
  waitForStudio,
} from "./studio-helpers";

test("production bundle serves the complete BEND editor from its nested route", async ({
  page,
}) => {
  await page.goto("/tools/bend/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Signal Field/ }).click();
  await expect(
    page.getByRole("heading", { name: "Signal Field controls", exact: true }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".canvas-frame canvas")).toBeVisible();
});

test("production Studio publishes through the nested BEND bridge", async ({ page }) => {
  const evidenceDir = test.info().outputPath("evidence");
  mkdirSync(evidenceDir, { recursive: true });
  await waitForStudio(page);
  await chooseFormat(page, "instagram-square");
  await openBend(page);
  const frame = bendFrame(page);
  await frame
    .locator('input[aria-label="Add local video"]')
    .setInputFiles("../../tools/bend/tests/fixtures/test-pattern.mp4");
  await expect(frame.locator(".sequence-clip").first()).toBeVisible({ timeout: 60_000 });
  await publishBend(page);
  const layer = page.locator('[data-testid="canvas-layer"][data-layer-kind="video"]').first();
  await expect(layer).toBeVisible();
  await expect(layer.locator("img.raster-artwork")).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDir, "01-production-nested-route.png"),
    fullPage: true,
  });
});
