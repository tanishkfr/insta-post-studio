import { expect, test } from "@playwright/test";

test("studio shell renders and tool navigation is interactive", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Canvas workspace" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Untitled Project");
  await expect(page.getByRole("heading", { name: "Layers", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inspector", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Empty square canvas placeholder" })).toBeVisible();

  await page.getByRole("button", { name: /Shapes/ }).click();
  await expect(page.getByRole("heading", { name: "Shapes workspace" })).toBeVisible();
  await expect(page.getByText(/not mounted in Phase 0/)).toBeVisible();
});
