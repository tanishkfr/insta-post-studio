import { expect, test } from "./studio-test";
import {
  chooseFormat,
  generateFrame,
  imageFrame,
  openGenerate,
  openImage,
  openShapes,
  openType,
  openVector,
  publishActiveTool,
  readNewestProject,
  readSourceStateRecords,
  selectLayer,
  shapesFrame,
  typeFrame,
  waitForGenerateReady,
  waitForImageReady,
  waitForShapesReady,
  waitForStudio,
  waitForTypeReady,
  waitForVectorReady,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

function layers(project: Record<string, unknown> | null) {
  return (project?.layers ?? []) as Array<Record<string, unknown>>;
}

function layerByTool(project: Record<string, unknown> | null, sourceTool: string) {
  return layers(project).find((layer) => layer.sourceTool === sourceTool)!;
}

test("Phase 3 pipeline composes Image + Vector + Type + Shapes, continues in Image, Generate arranges all, and reload restores every source", async ({
  page,
}) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");

  // 1. Four independent real artwork layers.
  await openImage(page);
  await imageFrame(page).locator("#file").setInputFiles({
    name: "pipeline-background.png",
    mimeType: "image/png",
    buffer: makePng({ width: 600, height: 750 }),
  });
  await publishActiveTool(page);
  const imageId = String(
    layers((await readNewestProject(page))?.project ?? null).at(-1)!.id,
  );

  await openVector(page);
  await publishActiveTool(page);
  const vectorId = String(
    layers((await readNewestProject(page))?.project ?? null).at(-1)!.id,
  );

  await openType(page);
  await waitForTypeReady(page, "library");
  const type = typeFrame(page);
  await expect(type.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await type.locator(".font-row", { hasText: "Goozette" }).click();
  await type.locator("#text").fill("PIPELINE");
  await publishActiveTool(page);
  const typeId = String(
    layers((await readNewestProject(page))?.project ?? null).at(-1)!.id,
  );

  await openShapes(page);
  const shapes = shapesFrame(page);
  await shapes.getByRole("button", { name: "Add Cube" }).click();
  await shapes.getByRole("button", { name: "Add Torus" }).click();
  await shapes.getByLabel("rotation y").fill("28");
  await shapes.getByLabel("rotation y").blur();
  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  const shapesId = String(
    layers((await readNewestProject(page))?.project ?? null).at(-1)!.id,
  );

  const composed = await readNewestProject(page);
  expect(layers(composed?.project ?? null)).toHaveLength(4);
  expect(
    (composed?.project.artboards as Array<Record<string, unknown>>)[0].layerOrder,
  ).toEqual([imageId, vectorId, typeId, shapesId]);
  await expect(page.locator(".canvas-layer")).toHaveCount(4);

  // 2. Shapes → Image derivative. The 3D source stays intact.
  const shapesSourceBefore = (await readSourceStateRecords(page)).find(
    (record) => record.tool === "shapes",
  )!;
  await selectLayer(page, shapesId);
  await page.getByRole("button", { name: "Continue in…" }).click();
  await page.getByTestId("shapes-continue-in-image").click();
  await waitForImageReady(page);
  await publishActiveTool(page);
  const afterDerivative = await readNewestProject(page);
  expect(layers(afterDerivative?.project ?? null)).toHaveLength(5);
  const derivative = layers(afterDerivative?.project ?? null).at(-1)!;
  expect(derivative.kind).toBe("image");
  expect(derivative.sourceTool).toBe("image");
  expect((derivative.provenance as Record<string, unknown>).relation).toBe("derived-from");
  expect((derivative.provenance as Record<string, unknown>).sourceLayerId).toBe(shapesId);
  const shapesSourceAfter = (await readSourceStateRecords(page)).find(
    (record) => record.tool === "shapes" && record.revision === shapesSourceBefore.revision,
  )!;
  expect(shapesSourceAfter.contentHash).toBe(shapesSourceBefore.contentHash);

  // 3. Generate receives the real mixed composition and applies an alternative.
  await page.getByTestId("generate-layouts").click();
  await waitForGenerateReady(page);
  const generate = generateFrame(page);
  const generateBin = await generate.locator("#al").innerText();
  for (const layer of layers(afterDerivative?.project ?? null)) {
    if (layer.visible) expect(generateBin).toContain(String(layer.name));
  }
  const sourcesBeforeLayout = await readSourceStateRecords(page);
  const beforeTransforms = new Map<
    string,
    { x: number; y: number; width: number; rotationDegrees: number }
  >();
  for (const layer of layers(afterDerivative?.project ?? null)) {
    const transform = layer.transform as {
      x: number;
      y: number;
      width: number;
      rotationDegrees: number;
    };
    beforeTransforms.set(String(layer.id), {
      x: transform.x,
      y: transform.y,
      width: transform.width,
      rotationDegrees: transform.rotationDegrees,
    });
  }
  await generate.locator(".var").nth(2).click();
  await page.getByTestId("generate-apply-layout").click();
  await expect(page.getByTestId("generate-apply-notice")).toContainText(/Applied to \d+ layer/);
  const arranged = await readNewestProject(page);
  expect(layers(arranged?.project ?? null)).toHaveLength(5);
  const sourcesAfterLayout = await readSourceStateRecords(page);
  expect(
    sourcesAfterLayout.map((source) => [source.tool, source.contentHash]),
  ).toEqual(sourcesBeforeLayout.map((source) => [source.tool, source.contentHash]));
  expect(
    layers(arranged?.project ?? null).filter((layer) => {
      const before = beforeTransforms.get(String(layer.id))!;
      const after = layer.transform as Record<string, number>;
      return (
        before.x !== after.x ||
        before.y !== after.y ||
        before.width !== after.width ||
        before.rotationDegrees !== after.rotationDegrees
      );
    }).length,
  ).toBeGreaterThanOrEqual(4);

  // 4. Publish the selected treatment as an independent background layer.
  await page.getByRole("button", { name: "Publish background layer" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 120_000 });
  const withBackground = await readNewestProject(page);
  expect(layers(withBackground?.project ?? null)).toHaveLength(6);
  const generated = layerByTool(withBackground?.project ?? null, "generate");
  const generatedId = String(generated.id);
  const withBackgroundArtboard = (withBackground?.project.artboards as Array<Record<string, unknown>>)[0];
  expect((withBackgroundArtboard.layerOrder as string[])[0]).toBe(generatedId);

  // 5. Save and reload every layer and source reference.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".canvas-layer")).toHaveCount(6);
  const reloaded = await readNewestProject(page);
  expect(layers(reloaded?.project ?? null)).toHaveLength(6);
  const reloadedSources = await readSourceStateRecords(page);
  for (const tool of ["image", "vector", "typography", "shapes", "generate"]) {
    expect(reloadedSources.filter((source) => source.tool === tool).length).toBeGreaterThan(0);
  }

  // 6. Every integrated category reopens its original source editor.
  await selectLayer(page, imageId);
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();

  await selectLayer(page, vectorId);
  await page.getByTestId("inspector-edit-vector").click();
  await waitForVectorReady(page);
  await page.getByTestId("vector-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();

  await selectLayer(page, typeId);
  await page.getByTestId("inspector-edit-layer").click();
  await waitForTypeReady(page, "library");
  await page.getByTestId("type-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();

  await selectLayer(page, shapesId);
  await page.getByTestId("inspector-edit-shapes").click();
  await waitForShapesReady(page);
  await expect(shapes.locator(".object-name", { hasText: "Box 1" })).toBeVisible();
  await expect(shapes.locator(".object-name", { hasText: "Torus 1" })).toBeVisible();

  // Cancel must leave the prior Shapes source revision untouched.
  const shapesRevisionBefore = (await readSourceStateRecords(page))
    .filter((record) => record.tool === "shapes")
    .sort((left, right) => right.revision - left.revision)[0];
  await shapes.getByRole("button", { name: "Add Sphere" }).click();
  await page.getByTestId("shapes-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  const shapesRevisionAfter = (await readSourceStateRecords(page))
    .filter((record) => record.tool === "shapes")
    .sort((left, right) => right.revision - left.revision)[0];
  expect(shapesRevisionAfter.contentHash).toBe(shapesRevisionBefore.contentHash);
  const layerAfterCancel = layerByTool((await readNewestProject(page))?.project ?? null, "shapes");
  expect(
    (layerAfterCancel.sourceState as { contentHash?: string }).contentHash,
  ).toBe(shapesRevisionBefore.contentHash);

  await selectLayer(page, generatedId);
  await page.getByTestId("inspector-edit-generate").click();
  await waitForGenerateReady(page);
  await expect(generate.locator(".var").nth(2)).toHaveClass(/sel/);
  await page.getByTestId("generate-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
});
