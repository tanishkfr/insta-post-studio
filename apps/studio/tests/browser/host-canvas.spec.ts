import { expect, test } from "./studio-test";
import path from "node:path";
import {
  layerIds,
  openVector,
  publishVector,
  saveStudio,
  selectLayer,
  setVectorSeed,
  vectorFrame,
  waitForStudio,
} from "./studio-helpers";

const evidence = (name: string) =>
  path.resolve(process.cwd(), "../../docs/evidence/phase-1", name);

test("host canvas: rename, duplicate, delete, drag/resize and persist", async ({ page }) => {
  await waitForStudio(page);
  await openVector(page);
  await setVectorSeed(vectorFrame(page), 3131);
  await publishVector(page);
  const layerId = (await layerIds(page))[0];

  // Rename from the layer panel.
  const row = page.locator(`[data-testid="layer-row-${layerId}"]`);
  await row.locator(".layer-name-button").dblclick();
  const rowNameInput = row.getByLabel("Layer name");
  await rowNameInput.fill("Campaign artwork");
  await rowNameInput.press("Enter");
  await expect(row.locator(".layer-name-text")).toHaveText("Campaign artwork");
  await expect(
    page.locator(".inspector-content").getByLabel("Layer name"),
  ).toHaveValue("Campaign artwork");

  // Duplicate and delete without changing the original asset references.
  await page.getByRole("button", { name: "Duplicate selected layer" }).click();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(2);
  await expect(page.locator("[data-testid^='layer-row-']")).toHaveCount(2);
  await page.getByRole("button", { name: "Delete selected layer" }).click();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await expect(
    page.locator(`.canvas-layer[data-layer-id="${layerId}"]`),
  ).toHaveCount(1);

  // Direct canvas move.
  await selectLayer(page, layerId);
  const xInput = page.getByLabel(/^X/);
  const yInput = page.getByLabel(/^Y/);
  const initialX = Number(await xInput.inputValue());
  const initialY = Number(await yInput.inputValue());
  const layerBox = await page.locator(".canvas-layer").boundingBox();
  expect(layerBox).not.toBeNull();
  await page.mouse.move(layerBox!.x + layerBox!.width / 2, layerBox!.y + layerBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    layerBox!.x + layerBox!.width / 2 + 50,
    layerBox!.y + layerBox!.height / 2 + 35,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(async () => Number(await xInput.inputValue())).toBeGreaterThan(initialX);
  await expect.poll(async () => Number(await yInput.inputValue())).toBeGreaterThan(initialY);

  // Direct resize from the selection handle.
  const widthInput = page.getByLabel(/^Width/);
  const widthBeforeResize = Number(await widthInput.inputValue());
  const handle = await page.locator(".resize-handle").boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 + 45, handle!.y + handle!.height / 2 + 15, {
    steps: 6,
  });
  await page.mouse.up();
  await expect.poll(async () => Number(await widthInput.inputValue())).toBeGreaterThan(
    widthBeforeResize,
  );

  const movedX = await xInput.inputValue();
  const movedWidth = await widthInput.inputValue();
  await saveStudio(page);
  await page.screenshot({ path: evidence("10-host-canvas-interactions.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await selectLayer(page, layerId);
  await expect(page.locator(".inspector-content").getByLabel("Layer name")).toHaveValue(
    "Campaign artwork",
  );
  await expect(page.getByLabel(/^X/)).toHaveValue(movedX);
  await expect(page.getByLabel(/^Width/)).toHaveValue(movedWidth);

  // New project creation produces a fresh persisted document.
  await page.getByRole("button", { name: "New" }).click();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Untitled Project",
  );
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("canvas-layer")).toHaveCount(0);
});
