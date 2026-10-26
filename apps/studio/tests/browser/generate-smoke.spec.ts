import { expect, test } from "./studio-test";
import {
  chooseFormat,
  generateFrame,
  imageFrame,
  openGenerate,
  openImage,
  openVector,
  publishActiveTool,
  readAssetRecords,
  readNewestProject,
  readSourceStateRecords,
  selectLayer,
  waitForGenerateReady,
  waitForStudio,
} from "./studio-helpers";
import { inspectPng } from "../../src/adapters/shapes/pngValidation";
import { makePng } from "../fixtures/png";

async function createImageLayer(page: import("@playwright/test").Page): Promise<string> {
  await openImage(page);
  await imageFrame(page).locator("#file").setInputFiles({
    name: "background.png",
    mimeType: "image/png",
    buffer: makePng({ width: 600, height: 750 }),
  });
  await expect(imageFrame(page).locator("#hn")).toHaveValue("background");
  await publishActiveTool(page);
  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  return String(layers[layers.length - 1].id);
}

async function createVectorLayer(page: import("@playwright/test").Page): Promise<string> {
  await openVector(page);
  await publishActiveTool(page);
  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  return String(layers[layers.length - 1].id);
}

function transformOf(project: Record<string, unknown> | null, layerId: string): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
} {
  const layers = (project?.layers ?? []) as Array<Record<string, unknown>>;
  const layer = layers.find((candidate) => candidate.id === layerId)!;
  return structuredClone(layer.transform) as {
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDegrees: number;
  };
}

test("Generate uses real Studio layers, applies a reversible layout and publishes a reopenable background", async ({
  page,
}) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");
  const imageId = await createImageLayer(page);
  const vectorId = await createVectorLayer(page);

  const beforeProject = await readNewestProject(page);
  const beforeImage = transformOf(beforeProject?.project ?? null, imageId);
  const beforeVector = transformOf(beforeProject?.project ?? null, vectorId);
  const layerNames = new Map(
    ((beforeProject?.project.layers ?? []) as Array<Record<string, unknown>>).map((layer) => [
      String(layer.id),
      String(layer.name),
    ]),
  );
  const sourcesBefore = await readSourceStateRecords(page);

  await openGenerate(page);
  const frame = generateFrame(page);
  await expect(frame.locator(".var")).toHaveCount(3, { timeout: 45_000 });
  const bin = await frame.locator("#al").innerText();
  expect(bin).toContain(layerNames.get(imageId)!);
  expect(bin).toContain(layerNames.get(vectorId)!);

  const slide = await frame.locator(".slide").first().boundingBox();
  expect(slide).toBeTruthy();
  expect(slide!.width / slide!.height).toBeCloseTo(0.8, 1);

  // Choose a different alternative; nothing may mutate yet.
  await frame.locator(".var").nth(1).click();
  await expect(frame.locator(".var").nth(1)).toHaveClass(/sel/);
  expect(transformOf((await readNewestProject(page))?.project ?? null, imageId)).toEqual(
    beforeImage,
  );
  expect(transformOf((await readNewestProject(page))?.project ?? null, vectorId)).toEqual(
    beforeVector,
  );

  await page.getByTestId("generate-apply-layout").click();
  await expect(page.getByTestId("generate-apply-notice")).toContainText(
    /Applied to \d+ layer/,
    { timeout: 20_000 },
  );
  const afterApply = await readNewestProject(page);
  const afterImage = transformOf(afterApply?.project ?? null, imageId);
  const afterVector = transformOf(afterApply?.project ?? null, vectorId);
  expect(
    afterImage.x !== beforeImage.x ||
      afterImage.y !== beforeImage.y ||
      afterImage.rotationDegrees !== beforeImage.rotationDegrees ||
      afterImage.width !== beforeImage.width,
  ).toBe(true);
  expect(
    afterVector.x !== beforeVector.x ||
      afterVector.y !== beforeVector.y ||
      afterVector.rotationDegrees !== beforeVector.rotationDegrees ||
      afterVector.width !== beforeVector.width,
  ).toBe(true);

  // Native source documents are untouched by layout application.
  const sourcesAfterApply = await readSourceStateRecords(page);
  expect(
    sourcesAfterApply.map((source) => [source.tool, source.contentHash]),
  ).toEqual(sourcesBefore.map((source) => [source.tool, source.contentHash]));

  await page.getByTestId("generate-undo-layout").click();
  await expect(page.getByTestId("generate-apply-notice")).toContainText(
    "previous composition is restored",
  );
  const afterUndo = await readNewestProject(page);
  expect(transformOf(afterUndo?.project ?? null, imageId)).toEqual(beforeImage);
  expect(transformOf(afterUndo?.project ?? null, vectorId)).toEqual(beforeVector);

  // Apply again, then publish the selected treatment as its own layer.
  await page.getByTestId("generate-apply-layout").click();
  await expect(page.getByTestId("generate-apply-notice")).toContainText(/Applied to \d+ layer/);
  await page.getByRole("button", { name: "Publish background layer" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 120_000 });

  const published = await readNewestProject(page);
  const layers = published?.project.layers as Array<Record<string, unknown>>;
  const generated = layers.find((layer) => layer.sourceTool === "generate")!;
  expect(generated.kind).toBe("generated-layout");
  const artboard = (published?.project.artboards as Array<Record<string, unknown>>)[0];
  const order = artboard.layerOrder as string[];
  expect(order[0]).toBe(generated.id);
  expect(order).toHaveLength(3);
  const rendered = generated.rendered as { assetId: string; width: number; height: number };
  expect(rendered.width).toBe(1080);
  expect(rendered.height).toBe(1350);
  const assets = await readAssetRecords(page);
  const asset = assets.find((candidate) => candidate.id === rendered.assetId)!;
  const png = inspectPng(Buffer.from(asset.bytesBase64, "base64"));
  expect(png.width).toBe(1080);
  expect(png.height).toBe(1350);
  expect(png.hasAlpha).toBe(true);

  const sourceRecords = await readSourceStateRecords(page);
  const generateSource = sourceRecords.find((record) => record.tool === "generate")!;
  const sourceDocument = JSON.parse(generateSource.content);
  expect(sourceDocument.schemaVersion).toBe("1.0.0");
  expect(sourceDocument.variations.length).toBe(3);
  expect(sourceDocument.selected).toBeGreaterThanOrEqual(0);
  expect(sourceDocument.artboard.width).toBe(1080);
  expect(sourceDocument.artboard.height).toBe(1350);
  expect(sourceDocument.background).toBeTruthy();

  // Reload and reopen the generated background. Restore must not re-apply it.
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".canvas-layer")).toHaveCount(3);
  const layerId = String(generated.id);
  await selectLayer(page, layerId);
  await page.getByTestId("inspector-edit-generate").click();
  await waitForGenerateReady(page);
  await expect(frame.locator(".var").nth(1)).toHaveClass(/sel/);
  await expect(frame.locator("#studioGenerateMeta")).toContainText("2 Studio layers");
  const restoredContent = await frame.locator("body").evaluate(() => {
    const bridge = (
      window as unknown as {
        __STUDIO_GENERATE_BRIDGE__?: {
          serializeSourceState: () => { content: string };
        };
      }
    ).__STUDIO_GENERATE_BRIDGE__;
    return bridge?.serializeSourceState().content ?? "";
  });
  const restoredDocument = JSON.parse(restoredContent);
  expect(restoredDocument.variations).toEqual(sourceDocument.variations);
  expect(restoredDocument.seed).toBe(sourceDocument.seed);
  expect(restoredDocument.selected).toBe(sourceDocument.selected);
  const afterReload = await readNewestProject(page);
  expect(afterReload?.project.layers).toHaveLength(3);

  // Background layer is reorderable like any other layer.
  await page.getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  await selectLayer(page, layerId);
  await page.getByRole("button", { name: `Move layer ${generated.name} up` }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  const reordered = await readNewestProject(page);
  const reorderedOrder = (reordered?.project.artboards as Array<Record<string, unknown>>)[0]
    .layerOrder as string[];
  expect(reorderedOrder.indexOf(layerId)).toBeGreaterThan(0);
});

test("Generate is aspect-aware for 1:1 and 9:16 instead of reusing 4:5 coordinates", async ({
  page,
}) => {
  await waitForStudio(page);
  for (const format of [
    { id: "instagram-square", ratio: 1 },
    { id: "instagram-story", ratio: 1080 / 1920 },
  ]) {
    await chooseFormat(page, format.id);
    if ((await page.locator(".canvas-layer").count()) === 0) {
      await createVectorLayer(page);
    }
    await openGenerate(page);
    const frame = generateFrame(page);
    await expect(frame.locator(".var")).toHaveCount(3, { timeout: 45_000 });
    const box = await frame.locator(".slide").first().boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width / box!.height).toBeCloseTo(format.ratio, 2);

    await frame.locator(".var").first().click();
    await page.getByTestId("generate-apply-layout").click();
    await expect(page.getByTestId("generate-apply-notice")).toContainText(/Applied to \d+ layer/);
    const serialized = await frame.locator("body").evaluate(() => {
      const bridge = (
        window as unknown as {
          __STUDIO_GENERATE_BRIDGE__?: {
            serializeSourceState: () => { content: string };
          };
        }
      ).__STUDIO_GENERATE_BRIDGE__;
      return bridge?.serializeSourceState().content ?? "";
    });
    expect(serialized).not.toBe("");
    const document = JSON.parse(serialized);
    const expectedFrame = 100 / format.ratio;
    expect(document.frameHeight).toBeCloseTo(expectedFrame, 1);
    expect(document.artboard.width / document.artboard.height).toBeCloseTo(format.ratio, 2);
    const placements = document.variations[document.selected].sl[0];
    for (const placement of placements) {
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeLessThanOrEqual(expectedFrame + 1);
    }
    await page.getByRole("button", { name: "Canvas" }).click();
    await expect(page.getByTestId("artboard")).toBeVisible();
  }
});
