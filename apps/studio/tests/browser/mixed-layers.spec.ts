import { expect, test } from "./studio-test";
import {
  chooseFormat,
  imageFrame,
  openImage,
  openType,
  publishActiveTool,
  readAssetRecords,
  readNewestProject,
  typeFrame,
  waitForStudio,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";
import { inspectPng } from "../../src/adapters/image/rasterValidation";

test("transparent Type raster in front of Vector and opaque Image behind compose without flattening", async ({
  page,
}) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-square");

  // Opaque Image at the bottom.
  await openImage(page);
  const image = imageFrame(page);
  await image.locator("#file").setInputFiles({
    name: "opaque-layer.png",
    mimeType: "image/png",
    buffer: makePng({ width: 600, height: 600 }),
  });
  await expect(image.locator("#hn")).toHaveValue("opaque-layer");
  await publishActiveTool(page);

  // Vector in the middle.
  await page.getByTestId("tool-vector").click();
  await page.getByRole("button", { name: /Add to composition/ }).waitFor({ state: "visible" });
  await page.frameLocator('iframe[title="Vector editor"]').getByRole("button", {
    name: "Randomise shape",
  }).waitFor({ state: "visible" });
  await publishActiveTool(page);

  // Transparent Type raster on top.
  await openType(page);
  const library = typeFrame(page);
  await expect(library.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await library.locator(".font-row", { hasText: "Goozette" }).click();
  await library.locator("#text").fill("IN FRONT");
  await publishActiveTool(page);

  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  const artboard = (project?.project.artboards as Array<Record<string, unknown>>)[0];
  const order = artboard.layerOrder as string[];
  const byId = new Map(layers.map((layer) => [String(layer.id), layer]));
  expect(order.map((id) => byId.get(id)!.sourceTool)).toEqual([
    "image",
    "vector",
    "typography",
  ]);

  const typeLayer = layers.find((layer) => layer.sourceTool === "typography")!;
  const imageLayer = layers.find((layer) => layer.sourceTool === "image")!;
  const typeAssetId = (typeLayer.rendered as { assetId: string }).assetId;
  const imageAssetId = (imageLayer.rendered as { assetId: string }).assetId;
  const assets = await readAssetRecords(page);
  const typeAsset = assets.find((asset) => asset.id === typeAssetId)!;
  const imageAsset = assets.find((asset) => asset.id === imageAssetId)!;
  const typePng = inspectPng(Buffer.from(typeAsset.bytesBase64, "base64"));
  const imagePng = inspectPng(Buffer.from(imageAsset.bytesBase64, "base64"));
  expect(typePng.hasAlpha).toBe(true);
  expect(imagePng.width).toBe(1080);

  const alphaCounts = await page.evaluate(
    async ({ transparent, opaque }) => {
      const inspect = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let transparentPixels = 0;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] < 255) transparentPixels += 1;
        }
        return { transparentPixels, width: canvas.width, height: canvas.height };
      };
      return {
        type: await inspect(transparent),
        image: await inspect(opaque),
      };
    },
    {
      transparent: typeAsset.bytesBase64,
      opaque: imageAsset.bytesBase64,
    },
  );
  expect(alphaCounts.type.transparentPixels).toBeGreaterThan(1000);
  expect(alphaCounts.image.transparentPixels).toBe(0);

  const typeLayerId = String(typeLayer.id);
  const imageLayerId = String(imageLayer.id);
  await expect(
    page.locator(`[data-testid="canvas-layer"][data-layer-id="${typeLayerId}"] img.raster-artwork`),
  ).toBeVisible();
  await expect(
    page.locator(`[data-testid="canvas-layer"][data-layer-id="${imageLayerId}"] img.raster-artwork`),
  ).toBeVisible();
  const canvasOrder = await page.locator(".canvas-layer").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-layer-id")),
  );
  expect(canvasOrder).toEqual([imageLayerId, String(byId.get(order[1])!.id), typeLayerId]);

  // Select, drag and set opacity on the transparent raster without flattening.
  await page.locator(`[data-testid="layer-row-${typeLayerId}"] .layer-name-button`).click();
  const before = await readNewestProject(page);
  const beforeLayer = (before?.project.layers as Array<Record<string, unknown>>).find(
    (layer) => layer.id === typeLayerId,
  );
  const beforeX = Number((beforeLayer!.transform as { x: number }).x);
  const box = await page
    .locator(`[data-testid="canvas-layer"][data-layer-id="${typeLayerId}"]`)
    .boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 28, box!.y + box!.height / 2 + 12, {
    steps: 6,
  });
  await page.mouse.up();
  await page.getByLabel(/Opacity/).fill("65");
  await page.getByLabel(/Opacity/).blur();
  await page.getByLabel("Rotation").fill("6");
  await page.getByLabel("Rotation").blur();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");

  const after = await readNewestProject(page);
  const afterLayer = (after?.project.layers as Array<Record<string, unknown>>).find(
    (layer) => layer.id === typeLayerId,
  );
  expect(Number((afterLayer!.transform as { x: number }).x)).not.toBe(beforeX);
  expect(Number(afterLayer!.opacity)).toBeCloseTo(0.65);
  expect(Number((afterLayer!.transform as { rotationDegrees: number }).rotationDegrees)).toBe(6);
  expect((after?.project.layers as unknown[]).length).toBe(3);

  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".canvas-layer")).toHaveCount(3);
  const reloaded = await readNewestProject(page);
  const reloadedLayers = reloaded?.project.layers as Array<Record<string, unknown>>;
  expect(reloadedLayers).toHaveLength(3);
  const reloadedTypeLayer = reloadedLayers.find((layer) => layer.id === typeLayerId)!;
  expect(reloadedTypeLayer.opacity).toBeCloseTo(0.65);
  expect(
    Number((reloadedTypeLayer.transform as { rotationDegrees: number }).rotationDegrees),
  ).toBe(6);
  await expect(
    page.locator(`[data-testid="canvas-layer"][data-layer-id="${typeLayerId}"] img.raster-artwork`),
  ).toBeVisible();
});
