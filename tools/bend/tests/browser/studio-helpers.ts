import { expect, type Page } from "@playwright/test";
import path from "node:path";

export async function openStudio(page: Page, route = "/"): Promise<void> {
  await page.goto(route);
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
}

export async function openGenerated(page: Page): Promise<void> {
  await openStudio(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Signal Field" }).click();
  await expect(page.getByRole("heading", { name: "Signal Field", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".canvas-frame canvas")).toBeVisible({ timeout: 30_000 });
}

export async function openFootage(page: Page, fixture: string): Promise<void> {
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles(path.resolve(fixture));
  await expect(page.locator(".inspector-layer-type")).toContainText("Imported footage", { timeout: 30_000 });
}
