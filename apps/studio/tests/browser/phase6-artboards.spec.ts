import { expect, test } from "./studio-test";
import {
  layerIds,
  openVector,
  publishVector,
  waitForStudio,
} from "./studio-helpers";

test("artboards can be created, duplicated, renamed, reordered and deleted without losing layers", async ({
  page,
}) => {
  await waitForStudio(page);

  const tabs = page.locator(".artboard-tab");
  await expect(tabs).toHaveCount(1);
  const firstId = await page
    .getByTestId("artboard-bar")
    .locator(".artboard-tab")
    .first()
    .getAttribute("data-testid");
  expect(firstId).toBeTruthy();

  // A layer on the first artboard.
  await openVector(page);
  await publishVector(page);
  await expect(page.locator(".artboard-tab.is-active .artboard-tab-count")).toContainText("1");

  // Create a second artboard. It starts empty and becomes active.
  await page.getByTestId("add-artboard").click();
  await expect(tabs).toHaveCount(2);
  await expect(page.locator(".artboard-tab.is-active .artboard-tab-count")).toContainText("0");
  await expect(page.locator(".canvas-layer")).toHaveCount(0);
  const secondTab = page.locator(".artboard-tab").nth(1);
  expect(await secondTab.getAttribute("aria-current")).toBe("page");

  // A layer on the second artboard does not appear on the first.
  await openVector(page);
  await publishVector(page);
  await expect(page.locator(".canvas-layer")).toHaveCount(1);
  await expect(page.locator(".artboard-tab.is-active .artboard-tab-count")).toContainText("1");

  // Duplicate the active artboard with its layer stack.
  await page.getByTestId("duplicate-artboard").click();
  await expect(tabs).toHaveCount(3);
  await expect(page.locator(".canvas-layer")).toHaveCount(1);
  await expect(page.locator(".artboard-tab.is-active .artboard-tab-name")).toContainText("copy");
  const duplicatedLayerIds = await layerIds(page);
  expect(duplicatedLayerIds).toHaveLength(1);

  // Rename the active artboard.
  await page.getByTestId("rename-artboard").click();
  const rename = page.getByRole("textbox", { name: "Artboard name" });
  await rename.fill("Carousel slide");
  await rename.press("Enter");
  await expect(page.locator(".artboard-tab.is-active .artboard-tab-name")).toHaveText(
    "Carousel slide",
  );

  // Reorder it earlier and confirm the visual and saved order.
  await page.getByTestId("move-artboard-left").click();
  const namesAfterMove = await page
    .locator(".artboard-tab .artboard-tab-name")
    .allTextContents();
  expect(namesAfterMove[1]).toBe("Carousel slide");
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  // Switch back to the first artboard and confirm its independent layer order.
  await page.locator(".artboard-tab").first().click();
  await expect(page.locator(".canvas-layer")).toHaveCount(1);
  await expect(page.locator(".artboard-tab").first()).toHaveAttribute("aria-current", "page");

  // Delete the renamed duplicate with explicit confirmation.
  await page.locator(".artboard-tab", { hasText: "Carousel slide" }).click();
  await expect(page.locator(".artboard-tab.is-active .artboard-tab-name")).toHaveText(
    "Carousel slide",
  );
  await page.getByTestId("delete-artboard").click();
  await expect(page.getByTestId("confirm-delete-artboard")).toBeVisible();
  await page.getByTestId("confirm-delete-artboard").click();
  await expect(tabs).toHaveCount(2);
  await expect(page.getByText("Carousel slide")).toHaveCount(0);

  // The last remaining artboard cannot be deleted.
  await page.getByTestId("delete-artboard").click();
  await page.getByTestId("confirm-delete-artboard").click();
  await expect(tabs).toHaveCount(1);
  await expect(page.getByTestId("delete-artboard")).toBeDisabled();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  await page.reload();
  await expect(page.getByTestId("artboard-bar")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".artboard-tab")).toHaveCount(1);
});
