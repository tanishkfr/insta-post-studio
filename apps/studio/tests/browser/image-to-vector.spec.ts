import { expect, test } from "./studio-test";
import {
  chooseFormat,
  imageFrame,
  openImage,
  publishActiveTool,
  readNewestProject,
  readSourceStateRecords,
  waitForImageReady,
  waitForStudio,
  waitForVectorReady,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

test("Image to Vector creates a traced derivative layer and keeps the Image source", async ({ page }) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-square");
  await openImage(page);
  const frame = imageFrame(page);
  await frame.locator("#file").setInputFiles({
    name: "trace-input.png",
    mimeType: "image/png",
    buffer: makePng({ width: 360, height: 360 }),
  });
  await expect(frame.locator("#hn")).toHaveValue("trace-input");
  await frame.locator('#cats .t', { hasText: "Contours" }).first().click();
  await publishActiveTool(page);
  const firstProject = await readNewestProject(page);
  const firstLayers = firstProject?.project.layers as Array<Record<string, unknown>>;
  const imageLayer = firstLayers[0];
  expect(imageLayer.kind).toBe("image");
  const imageLayerId = String(imageLayer.id);
  const imageSourceHash = String(
    (imageLayer.sourceState as { contentHash?: string }).contentHash,
  );

  await page.locator(`[data-testid="layer-row-${imageLayerId}"] .layer-name-button`).click();
  await expect(page.getByTestId("continue-in-vector")).toBeVisible();
  await page.getByTestId("continue-in-vector").click();
  await waitForVectorReady(page);
  await expect(page.getByTestId("vector-editor")).toContainText("Image tracing input");
  const vectorFrame = page.frameLocator('iframe[title="Vector editor"]');
  await expect(vectorFrame.locator("#meta")).not.toContainText("0 lines");
  await publishActiveTool(page);

  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  expect(layers.length).toBe(2);
  const vectorLayer = layers.find((layer) => layer.kind === "vector");
  expect(vectorLayer).toBeTruthy();
  expect(vectorLayer!.provenance).toMatchObject({
    relation: "derived-from",
    sourceLayerId: imageLayerId,
  });
  const imageStill = layers.find((layer) => layer.id === imageLayerId);
  expect(String((imageStill!.sourceState as { contentHash?: string }).contentHash)).toBe(
    imageSourceHash,
  );

  const vectorSourceRef = vectorLayer!.sourceState as {
    contentHash?: string;
  };
  const sourceRecords = await readSourceStateRecords(page);
  const vectorSource = sourceRecords.find(
    (record) => record.contentHash === vectorSourceRef.contentHash,
  );
  expect(vectorSource?.tool).toBe("vector");
  const parsed = JSON.parse(vectorSource!.content) as {
    params: { baked?: unknown[] };
  };
  expect((parsed.params.baked ?? []).length).toBeGreaterThan(0);

  // Reorder the derivative above the Image, reload and reopen both sources.
  const vectorLayerId = String(vectorLayer!.id);
  await page.locator(`[data-testid="layer-row-${vectorLayerId}"] .layer-name-button`).click();
  await page.getByRole("button", { name: `Move layer ${String(vectorLayer!.name)} down` }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");

  await page.locator(`[data-testid="layer-row-${imageLayerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  const imageSnapshot = await imageFrame(page)
    .locator("body")
    .evaluate(() => {
      const bridge = (window as unknown as {
        __STUDIO_IMAGE_BRIDGE__?: { snapshot: () => unknown };
      }).__STUDIO_IMAGE_BRIDGE__;
      return bridge?.snapshot();
    });
  expect(imageSnapshot).toMatchObject({ photo: { width: 360, height: 360 } });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();

  await page.locator(`[data-testid="layer-row-${vectorLayerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-vector").click();
  await waitForVectorReady(page);
  await expect(
    page.frameLocator('iframe[title="Vector editor"]').locator("#meta"),
  ).not.toContainText("0 lines");
});
