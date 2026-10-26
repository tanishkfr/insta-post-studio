import { expect, test } from "./studio-test";
import {
  chooseFormat,
  imageFrame,
  openImage,
  publishActiveTool,
  readNewestProject,
  setRange,
  typeFrame,
  waitForImageReady,
  waitForStudio,
  waitForTypeReady,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

test("Image to Custom Type uses a motif derivative without changing the Image layer", async ({ page }) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-story");
  await openImage(page);
  const frame = imageFrame(page);
  await frame.locator("#file").setInputFiles({
    name: "motif-source.png",
    mimeType: "image/png",
    buffer: makePng({
      width: 320,
      height: 420,
      pixel(x, y) {
        const stripe = (x + y) % 80 < 30;
        return stripe ? [24, 60, 64, 255] : [238, 242, 230, 255];
      },
    }),
  });
  await expect(frame.locator("#hn")).toHaveValue("motif-source");
  await publishActiveTool(page);
  const firstProject = await readNewestProject(page);
  const firstLayers = firstProject?.project.layers as Array<Record<string, unknown>>;
  const imageLayer = firstLayers[0];
  expect(imageLayer.rendered).toMatchObject({ width: 1080, height: 1920 });
  const imageLayerId = String(imageLayer.id);
  const imageSourceHash = String(
    (imageLayer.sourceState as { contentHash?: string }).contentHash,
  );

  await page.locator(`[data-testid="layer-row-${imageLayerId}"] .layer-name-button`).click();
  await page.getByTestId("use-as-type-pattern").click();
  await waitForTypeReady(page, "custom");
  await expect(page.getByTestId("type-editor")).toContainText("Motif input");
  const custom = typeFrame(page, "custom");
  const motifSnapshot = await custom.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_CUSTOM_TYPE_BRIDGE__?: { snapshot: () => unknown };
    }).__STUDIO_CUSTOM_TYPE_BRIDGE__;
    return bridge?.snapshot();
  });
  expect((motifSnapshot as { image?: { width?: number } }).image?.width).toBe(1080);

  await custom.locator("#text").fill("IMAGE / TYPE");
  await setRange(custom, "#letterSize", 150);
  await setRange(custom, "#motifSize", 70);
  await setRange(custom, "#spacing", 7);
  await setRange(custom, "#mono", 25);
  await setRange(custom, "#weight", 130);
  await publishActiveTool(page);

  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  expect(layers.length).toBe(2);
  const typeLayer = layers.find((layer) => layer.kind === "typography");
  expect(typeLayer).toBeTruthy();
  expect(typeLayer!.provenance).toMatchObject({
    relation: "derived-from",
    sourceLayerId: imageLayerId,
  });
  const imageStill = layers.find((layer) => layer.id === imageLayerId);
  expect(String((imageStill!.sourceState as { contentHash?: string }).contentHash)).toBe(
    imageSourceHash,
  );
  const typeLayerId = String(typeLayer!.id);

  await page.locator(`[data-testid="layer-row-${typeLayerId}"] .layer-name-button`).click();
  await page.getByRole("button", { name: `Move layer ${String(typeLayer!.name)} down` }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });

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
  expect(imageSnapshot).toMatchObject({ photo: { width: 320, height: 420 } });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();

  await page.locator(`[data-testid="layer-row-${typeLayerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForTypeReady(page, "custom");
  const reopened = await typeFrame(page, "custom")
    .locator("body")
    .evaluate(() => {
      const bridge = (window as unknown as {
        __STUDIO_CUSTOM_TYPE_BRIDGE__?: { snapshot: () => unknown };
      }).__STUDIO_CUSTOM_TYPE_BRIDGE__;
      return bridge?.snapshot();
    });
  expect(reopened).toMatchObject({
    text: "IMAGE / TYPE",
    letterSize: 150,
    motifSize: 0.7,
    spacing: 0.07,
    mono: 0.25,
    weight: 1.3,
    stage: "type",
    image: { width: 1080 },
  });
});

