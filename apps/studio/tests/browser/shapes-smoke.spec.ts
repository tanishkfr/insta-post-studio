import { expect, test } from "./studio-test";
import {
  chooseFormat,
  openShapes,
  publishActiveTool,
  readAssetRecords,
  readNewestProject,
  readSourceStateRecords,
  selectLayer,
  shapesFrame,
  waitForShapesReady,
  waitForStudio,
} from "./studio-helpers";
import { inspectPng } from "../../src/adapters/shapes/pngValidation";

test("Shapes publishes a real transparent 3D layer and restores its source", async ({
  page,
}) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");
  await openShapes(page);

  const frame = shapesFrame(page);
  await frame.getByRole("button", { name: "Add Cube" }).click();
  await expect(frame.locator(".object-name", { hasText: "Box 1" })).toBeVisible();
  await frame.getByRole("button", { name: "Add Sphere" }).click();
  await expect(frame.locator(".object-name", { hasText: "Sphere 1" })).toBeVisible();

  // Transform through the preserved numeric inspector.
  await frame.getByLabel("position y").fill("0.6");
  await frame.getByLabel("position y").blur();
  await frame.getByLabel("rotation y").fill("24");
  await frame.getByLabel("rotation y").blur();

  // Material and modifier operations remain native.
  await frame.getByRole("tab", { name: "Material", exact: true }).click();
  await frame.getByRole("button", { name: "#3B82F6", exact: true }).click();
  await frame.getByRole("tab", { name: "Modifiers", exact: true }).click();
  await frame.getByRole("button", { name: "line", exact: true }).click();
  const count = frame.getByLabel("array count");
  await count.fill("3");
  await count.blur();

  // Native undo/redo still works before publish.
  await frame.getByRole("button", { name: "Undo" }).first().click();
  await frame.getByRole("button", { name: "Redo" }).first().click();

  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  expect(layers).toHaveLength(1);
  const shapesLayer = layers[0];
  expect(shapesLayer.kind).toBe("shapes");
  expect(shapesLayer.sourceTool).toBe("shapes");
  const layerId = String(shapesLayer.id);
  const rendered = shapesLayer.rendered as { assetId: string; width: number; height: number; hasAlpha: boolean };
  expect(rendered.width).toBe(1080);
  expect(rendered.height).toBe(1350);
  expect(rendered.hasAlpha).toBe(true);

  const assets = await readAssetRecords(page);
  const asset = assets.find((candidate) => candidate.id === rendered.assetId)!;
  expect(asset.mimeType).toBe("image/png");
  const png = inspectPng(Buffer.from(asset.bytesBase64, "base64"));
  expect(png.width).toBe(1080);
  expect(png.height).toBe(1350);
  expect(png.hasAlpha).toBe(true);

  const alpha = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let visible = 0;
    let blueSelectionPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha === 0) transparent += 1;
      else visible += 1;
      if (
        pixels[index] === 0x3b &&
        pixels[index + 1] === 0x82 &&
        pixels[index + 2] === 0xf6 &&
        alpha > 200
      ) {
        blueSelectionPixels += 1;
      }
    }
    const corners = [
      0,
      canvas.width - 1,
      (canvas.height - 1) * canvas.width,
      canvas.height * canvas.width - 1,
    ].map((pixel) => pixels[pixel * 4 + 3]);
    return { transparent, visible, corners, blueSelectionPixels };
  }, asset.bytesBase64);
  expect(alpha.visible).toBeGreaterThan(1000);
  expect(alpha.transparent).toBeGreaterThan(1000);
  expect(alpha.corners).toEqual([0, 0, 0, 0]);
  expect(alpha.blueSelectionPixels).toBe(0);

  const sourceRecords = await readSourceStateRecords(page);
  const source = sourceRecords.find((record) => record.tool === "shapes")!;
  const document = JSON.parse(source.content);
  expect(document.schemaVersion).toBe("1.0.0");
  expect(document.document.objects).toHaveLength(2);
  expect(document.document.objects[1].deform).toBeTruthy();
  expect(document.camera.radius).toBeGreaterThan(0);
  expect(document.nextSerial).toBeGreaterThan(2);
  expect(document.history.past.length).toBeGreaterThan(2);
  expect(document.pointer).toBeUndefined();

  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await selectLayer(page, layerId);
  await page.getByTestId("inspector-edit-shapes").click();
  await waitForShapesReady(page);
  await expect(frame.locator(".object-name", { hasText: "Box 1" })).toBeVisible();
  await expect(frame.locator(".object-name", { hasText: "Sphere 1" })).toBeVisible();
  const undo = frame.getByRole("button", { name: "Undo" }).first();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(frame.getByRole("button", { name: "Redo" }).first()).toBeEnabled();
  await frame.getByRole("button", { name: "Redo" }).first().click();
  await expect(undo).toBeEnabled();

  // Republish must retain the host layer identity and composition properties.
  const before = (await readNewestProject(page))!;
  const beforeLayer = (before.project.layers as Array<Record<string, unknown>>).find(
    (layer) => layer.id === layerId,
  )!;
  const beforeTransform = structuredClone(beforeLayer.transform);

  await frame.locator(".object-name", { hasText: "Sphere 1" }).click();
  await frame.getByRole("tab", { name: "Material", exact: true }).click();
  await frame.getByRole("button", { name: "#E07A7A", exact: true }).click();
  await page.getByRole("button", { name: "Update Shapes layer" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });

  const after = (await readNewestProject(page))!;
  const afterLayer = (after.project.layers as Array<Record<string, unknown>>).find(
    (layer) => layer.id === layerId,
  )!;
  expect(afterLayer.id).toBe(layerId);
  expect(afterLayer.transform).toEqual(beforeTransform);
  const afterSource = (await readSourceStateRecords(page))
    .filter((record) => record.tool === "shapes")
    .sort((left, right) => right.revision - left.revision)[0]!;
  expect(afterSource.revision).toBeGreaterThan(source.revision);
  expect(JSON.parse(afterSource.content).document.objects).toHaveLength(2);
});
