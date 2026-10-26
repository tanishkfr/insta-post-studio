import { expect, test } from "./studio-test";
import path from "node:path";
import {
  cancelVector,
  chooseFormat,
  layerIds,
  openVector,
  openVectorForLayer,
  publishVector,
  readNewestProject,
  readSourceStateRecords,
  saveStudio,
  selectLayer,
  setVectorInk,
  setVectorSeed,
  vectorFrame,
  waitForStudio,
  waitForVectorReady,
} from "./studio-helpers";

const evidence = (name: string) =>
  path.resolve(process.cwd(), "../../docs/evidence/phase-1", name);

test("Journey A/B: publish, move, persist, reopen, revise without losing host state", async ({
  page,
}) => {
  await waitForStudio(page);

  const nameInput = page.getByRole("textbox", { name: "Project name" });
  await nameInput.fill("Vector Campaign");
  await nameInput.blur();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");

  await chooseFormat(page, "instagram-4-5");
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");

  await openVector(page);
  const frame = vectorFrame(page);
  await setVectorSeed(frame, 4242);
  await setVectorInk(frame, "#1f6f52");
  await expect(page.getByTestId("vector-editor")).toContainText("Unpublished edits");
  await page.screenshot({ path: evidence("01-vector-editor.png") });

  await publishVector(page);
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await expect(page.locator(".canvas-layer .vector-svg svg")).toHaveCount(1);
  await expect(page.locator(".canvas-layer .vector-svg svg #ovl")).toHaveCount(0);
  await expect(page.locator(".canvas-layer .vector-svg svg")).toHaveAttribute(
    "viewBox",
    "0 0 1000 1414",
  );
  await expect(page.locator(".canvas-layer .vector-svg svg script")).toHaveCount(0);
  await expect(page.locator("[data-testid^='layer-row-']")).toHaveCount(1);
  const originalLayerId = (await layerIds(page))[0];

  const xField = page.getByLabel(/^X/);
  const yField = page.getByLabel(/^Y/);
  const widthField = page.getByLabel(/^Width/);
  const rotationField = page.getByLabel(/^Rotation/);
  const opacityField = page.getByLabel(/^Opacity/);
  await xField.fill("120");
  await xField.press("Enter");
  await yField.fill("80");
  await yField.press("Enter");
  await widthField.fill("700");
  await widthField.press("Enter");
  await rotationField.fill("12");
  await rotationField.press("Enter");
  await opacityField.fill("90");
  await opacityField.press("Enter");
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  await page.screenshot({ path: evidence("02-published-canvas.png") });

  await saveStudio(page);
  const record = await readNewestProject(page);
  expect(record).not.toBeNull();
  const storedProject = record!.project as {
    name: string;
    format: { id: string };
    layers: Array<{
      id: string;
      transform: { x: number; y: number; width: number; height: number; rotationDegrees: number };
      opacity: number;
      sourceState: { revision: number; toolStateVersion: string; contentHash: string };
      rendered: { assetId: string; mimeType: string };
    }>;
    assets: Array<{ id: string }>;
  };
  expect(storedProject.name).toBe("Vector Campaign");
  expect(storedProject.format.id).toBe("instagram-4-5");
  expect(storedProject.layers).toHaveLength(1);
  const storedLayer = storedProject.layers[0];
  expect(storedLayer.id).toBe(originalLayerId);
  expect(storedLayer.transform.x).toBe(120);
  expect(storedLayer.transform.y).toBe(80);
  expect(storedLayer.transform.width).toBeCloseTo(700, 0);
  expect(storedLayer.transform.rotationDegrees).toBe(12);
  expect(storedLayer.opacity).toBeCloseTo(0.9);
  expect(storedLayer.sourceState.revision).toBe(1);
  expect(storedLayer.rendered.mimeType).toBe("image/svg+xml");
  expect(JSON.stringify(storedProject)).not.toContain("data:image");

  const sourceStates = await readSourceStateRecords(page);
  const firstSource = sourceStates.find(
    (state) => state.contentHash === storedLayer.sourceState.contentHash,
  );
  expect(firstSource).toBeDefined();
  const storedState = JSON.parse(firstSource!.content) as {
    params: { seed: number; ink: string };
    view: { snap: boolean };
  };
  expect(storedState.params.seed).toBe(4242);
  expect(storedState.params.ink).toBe("#1f6f52");
  expect(storedState.view.snap).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Vector Campaign",
  );
  await expect(page.getByRole("combobox", { name: "Project format" })).toHaveValue(
    "instagram-4-5",
  );
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await expect(page.locator(".canvas-layer .vector-svg svg")).toHaveCount(1);
  await selectLayer(page, originalLayerId);
  await expect(page.getByLabel(/^X/)).toHaveValue("120");
  await expect(page.getByLabel(/^Width/)).toHaveValue("700");
  await expect(page.getByLabel(/^Rotation/)).toHaveValue("12");
  await expect(page.getByLabel(/^Opacity/)).toHaveValue("90");
  await page.screenshot({ path: evidence("03-reloaded-project.png") });

  await openVectorForLayer(page, originalLayerId);
  await expect(vectorFrame(page).locator("#f_seed")).toHaveValue("4242");
  await expect(vectorFrame(page).getByLabel("Line colour hex")).toHaveValue("#1f6f52");
  await page.screenshot({ path: evidence("04-reopened-source.png") });

  await setVectorSeed(vectorFrame(page), 7777);
  await setVectorInk(vectorFrame(page), "#b23a2e");
  await vectorFrame(page).getByRole("button", { name: "Contours" }).click();
  await expect(vectorFrame(page).locator('#modes button[data-m="c"]')).toHaveClass(/on/);
  await publishVector(page, "Update layer");

  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  expect((await layerIds(page))[0]).toBe(originalLayerId);
  await selectLayer(page, originalLayerId);
  await expect(page.getByText("rev 2")).toBeVisible();
  await expect(page.getByLabel(/^X/)).toHaveValue("120");
  await expect(page.getByLabel(/^Y/)).toHaveValue("80");
  await expect(page.getByLabel(/^Width/)).toHaveValue("700");
  await expect(page.getByLabel(/^Rotation/)).toHaveValue("12");
  await expect(page.getByLabel(/^Opacity/)).toHaveValue("90");

  // Undo and redo must be able to recover the previous source asset, which is
  // retained even though the project now references the newer revision.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("rev 1")).toBeVisible();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByText("rev 2")).toBeVisible();

  await saveStudio(page);
  const updatedRecord = await readNewestProject(page);
  const updatedProject = updatedRecord!.project as typeof storedProject;
  expect(updatedProject.layers[0].id).toBe(originalLayerId);
  expect(updatedProject.layers[0].transform.x).toBe(120);
  expect(updatedProject.layers[0].transform.rotationDegrees).toBe(12);
  expect(updatedProject.layers[0].sourceState.revision).toBe(2);
  const updatedSources = await readSourceStateRecords(page);
  expect(updatedSources.some((state) => {
    const doc = JSON.parse(state.content) as { params: { seed: number; mode: string } };
    return doc.params.seed === 7777 && doc.params.mode === "c";
  })).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Vector Campaign",
  );
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await selectLayer(page, originalLayerId);
  await expect(page.getByText("rev 2")).toBeVisible();
  await expect(page.getByLabel(/^X/)).toHaveValue("120");
  await openVectorForLayer(page, originalLayerId);
  await expect(vectorFrame(page).locator("#f_seed")).toHaveValue("7777");
  await expect(vectorFrame(page).getByLabel("Line colour hex")).toHaveValue("#b23a2e");
  await expect(vectorFrame(page).locator('#modes button[data-m="c"]')).toHaveClass(/on/);
  await cancelVector(page);
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
});
