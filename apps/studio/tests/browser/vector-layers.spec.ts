import { expect, test } from "./studio-test";
import path from "node:path";
import {
  cancelVector,
  layerIds,
  layerRowOrder,
  openVector,
  openVectorForLayer,
  publishVector,
  saveStudio,
  selectLayer,
  setVectorSeed,
  vectorFrame,
  waitForStudio,
} from "./studio-helpers";

const evidence = (name: string) =>
  path.resolve(process.cwd(), "../../docs/evidence/phase-1", name);

async function createVectorLayer(page: import("@playwright/test").Page, seed: number) {
  await openVector(page);
  await setVectorSeed(vectorFrame(page), seed);
  await publishVector(page);
  const ids = await layerIds(page);
  return ids[ids.length - 1];
}

test("Journey C: layer reorder, hide, cancel, undo/redo and reload stay consistent", async ({
  page,
}) => {
  await waitForStudio(page);

  const firstId = await createVectorLayer(page, 1001);
  const secondId = await createVectorLayer(page, 2002);
  await expect(page.getByTestId("canvas-layer")).toHaveCount(2);
  await saveStudio(page);

  const secondName = await page
    .locator(`[data-testid="layer-row-${secondId}"] .layer-name-text`)
    .innerText();
  const firstName = await page
    .locator(`[data-testid="layer-row-${firstId}"] .layer-name-text`)
    .innerText();
  expect(secondName).toContain("2002");
  expect(firstName).toContain("1001");

  // Top-of-stack second layer moves down.
  await selectLayer(page, secondId);
  await page.getByRole("button", { name: `Move layer ${secondName} down` }).click();
  await expect.poll(() => layerRowOrder(page)).toEqual([firstId, secondId]);

  // Hide the second layer, undo, redo.
  await selectLayer(page, secondId);
  await page.getByRole("button", { name: `Hide layer ${secondName}` }).click();
  await expect(
    page.locator(`[data-testid="layer-row-${secondId}"]`),
  ).toHaveClass(/is-hidden/);
  await expect(
    page.locator(`.canvas-layer[data-layer-id="${secondId}"]`),
  ).toHaveCSS("display", "none");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.locator(`.canvas-layer[data-layer-id="${secondId}"]`),
  ).not.toHaveCSS("display", "none");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(
    page.locator(`.canvas-layer[data-layer-id="${secondId}"]`),
  ).toHaveCSS("display", "none");

  // Complete a Vector edit, then cancel it. The saved source must not change.
  await selectLayer(page, firstId);
  await openVectorForLayer(page, firstId);
  await setVectorSeed(vectorFrame(page), 9999);
  await expect(page.getByTestId("vector-editor")).toContainText("Unpublished edits");
  await cancelVector(page);
  await openVectorForLayer(page, firstId);
  await expect(vectorFrame(page).locator("#f_seed")).toHaveValue("1001");
  await cancelVector(page);

  await selectLayer(page, secondId);
  await openVectorForLayer(page, secondId);
  await expect(vectorFrame(page).locator("#f_seed")).toHaveValue("2002");
  await setVectorSeed(vectorFrame(page), 2003);
  await publishVector(page, "Update layer");
  await expect(page.getByTestId("canvas-layer")).toHaveCount(2);
  await expect(
    page.locator(`[data-testid="layer-row-${secondId}"]`),
  ).toHaveClass(/is-hidden/);
  await expect(
    page.locator(`.canvas-layer[data-layer-id="${secondId}"]`),
  ).toHaveCSS("display", "none");
  expect(await layerRowOrder(page)).toEqual([firstId, secondId]);

  await saveStudio(page);
  await page.screenshot({ path: evidence("07-layer-management.png") });

  const storedOrder = await layerRowOrder(page);
  expect(storedOrder).toEqual([firstId, secondId]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("canvas-layer")).toHaveCount(2);
  expect(await layerRowOrder(page)).toEqual([firstId, secondId]);
  await expect(
    page.locator(`[data-testid="layer-row-${secondId}"]`),
  ).toHaveClass(/is-hidden/);
  await expect(
    page.locator(`.canvas-layer[data-layer-id="${secondId}"]`),
  ).toHaveCSS("display", "none");

  await selectLayer(page, firstId);
  await expect(page.getByLabel(/^X/)).toBeVisible();
  await openVectorForLayer(page, firstId);
  await expect(vectorFrame(page).locator("#f_seed")).toHaveValue("1001");
  await cancelVector(page);

  await selectLayer(page, secondId);
  await openVectorForLayer(page, secondId);
  await expect(vectorFrame(page).locator("#f_seed")).toHaveValue("2003");
  await cancelVector(page);

  await expect(page.getByTestId("canvas-layer")).toHaveCount(2);
});
