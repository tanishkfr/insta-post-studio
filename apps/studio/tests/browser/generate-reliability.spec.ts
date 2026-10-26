import { expect, test } from "./studio-test";
import {
  chooseFormat,
  generateFrame,
  imageFrame,
  openGenerate,
  openImage,
  openVector,
  publishActiveTool,
  readNewestProject,
  selectLayer,
  waitForGenerateReady,
  waitForStudio,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

async function createImageLayer(page: import("@playwright/test").Page): Promise<{ id: string; name: string }> {
  await openImage(page);
  await imageFrame(page).locator("#file").setInputFiles({
    name: "locked-background.png",
    mimeType: "image/png",
    buffer: makePng({ width: 600, height: 750 }),
  });
  await publishActiveTool(page);
  const project = await readNewestProject(page);
  const layer = (project?.project.layers as Array<Record<string, unknown>>).at(-1)!;
  return { id: String(layer.id), name: String(layer.name) };
}

async function createVectorLayer(page: import("@playwright/test").Page): Promise<{ id: string; name: string }> {
  await openVector(page);
  await publishActiveTool(page);
  const project = await readNewestProject(page);
  const layer = (project?.project.layers as Array<Record<string, unknown>>).at(-1)!;
  return { id: String(layer.id), name: String(layer.name) };
}

function transformOf(project: Record<string, unknown> | null, layerId: string): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
} {
  const layers = (project?.layers ?? []) as Array<Record<string, unknown>>;
  return structuredClone(layers.find((layer) => layer.id === layerId)!.transform) as {
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDegrees: number;
  };
}

test("Generate excludes hidden layers, preserves locked layers and handles missing source layers safely", async ({
  page,
}) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");
  const image = await createImageLayer(page);
  const vector = await createVectorLayer(page);

  await page.getByRole("button", { name: `Hide layer ${vector.name}` }).click();
  await page.getByRole("button", { name: `Lock layer ${image.name}` }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  const beforeLocked = transformOf((await readNewestProject(page))?.project ?? null, image.id);

  await openGenerate(page);
  const frame = generateFrame(page);
  const bin = await frame.locator("#al").innerText();
  expect(bin).toContain(image.name);
  expect(bin).not.toContain(vector.name);
  await page.getByTestId("generate-apply-layout").click();
  await expect(page.getByTestId("generate-apply-notice")).toContainText(
    /No unlocked, visible layers/,
    { timeout: 20_000 },
  );
  expect(transformOf((await readNewestProject(page))?.project ?? null, image.id)).toEqual(
    beforeLocked,
  );

  await page.getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  await page.getByRole("button", { name: `Unlock layer ${image.name}` }).click();
  await page.getByRole("button", { name: `Show layer ${vector.name}` }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");

  // Publish a background, then remove one foreground source layer.
  await openGenerate(page);
  await page.getByRole("button", { name: "Publish background layer" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 120_000 });
  const published = await readNewestProject(page);
  const layers = published?.project.layers as Array<Record<string, unknown>>;
  const generated = layers.find((layer) => layer.sourceTool === "generate")!;
  const generatedId = String(generated.id);

  await selectLayer(page, vector.id);
  await page.getByRole("button", { name: "Delete selected layer" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  const afterDelete = await readNewestProject(page);
  expect((afterDelete?.project.layers as unknown[]).length).toBe(2);

  await selectLayer(page, generatedId);
  await page.getByTestId("inspector-edit-generate").click();
  await waitForGenerateReady(page);
  await expect(frame.getByText(/Missing Studio layers/)).toBeVisible({ timeout: 20_000 });
  await expect(
    frame.getByRole("button", { name: "Regenerate from current layers" }),
  ).toBeVisible();
  // Restore did not silently move or recreate the deleted host layer.
  const afterRestore = await readNewestProject(page);
  expect((afterRestore?.project.layers as Array<Record<string, unknown>>).length).toBe(2);
  const beforeRegenerated = transformOf(afterRestore?.project ?? null, image.id);

  await frame.getByRole("button", { name: "Regenerate from current layers" }).click();
  await expect(frame.getByText(/Missing Studio layers/)).toHaveCount(0, { timeout: 20_000 });
  await expect(frame.locator(".var")).toHaveCount(3);
  await page.getByTestId("generate-apply-layout").click();
  await expect(page.getByTestId("generate-apply-notice")).toContainText(/Applied to \d+ layer/, {
    timeout: 20_000,
  });
  const afterApply = await readNewestProject(page);
  const afterImage = transformOf(afterApply?.project ?? null, image.id);
  expect(
    afterImage.x !== beforeRegenerated.x ||
      afterImage.y !== beforeRegenerated.y ||
      afterImage.rotationDegrees !== beforeRegenerated.rotationDegrees ||
      afterImage.width !== beforeRegenerated.width,
  ).toBe(true);
  expect((afterApply?.project.layers as Array<Record<string, unknown>>).length).toBe(2);
});
