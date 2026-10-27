import { expect, test } from "./studio-test";
import {
  chooseFormat,
  imageFrame,
  openImage,
  publishActiveTool,
  readAssetRecords,
  readNewestProject,
  waitForImageReady,
  waitForStudio,
} from "./studio-helpers";
import { makePng, readPngSize } from "../fixtures/png";

test("image adapter opens and receives a source photo", async ({ page }) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");
  await openImage(page);
  const frame = imageFrame(page);
  await expect(frame.locator("#studioImageBridgeReady")).toHaveCount(1);
  await frame.locator("#file").setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: makePng({ width: 300, height: 400 }),
  });
  await expect(frame.locator("#hn")).toHaveValue("portrait");
  const snapshot = await frame.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_IMAGE_BRIDGE__?: { snapshot: () => unknown };
    }).__STUDIO_IMAGE_BRIDGE__;
    return bridge?.snapshot();
  });
  expect(snapshot).toBeTruthy();
  await frame.locator('#cats .t', { hasText: "Dots" }).first().click();
  await publishActiveTool(page);
  const assets = await readAssetRecords(page);
  const rendered = assets.find((asset) => asset.kind === "rendered-image");
  expect(rendered).toBeTruthy();
  const size = readPngSize(Buffer.from(rendered!.bytesBase64, "base64"));
  expect(size).toEqual({ width: 1080, height: 1350 });
  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  expect(layers.length).toBe(1);
  const layerId = String(layers[0].id);
  await expect(
    page.locator(`[data-testid="canvas-layer"][data-layer-id="${layerId}"] img.raster-artwork`),
  ).toBeVisible();

  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  const reopened = await page
    .frameLocator('iframe[title="Image editor"]')
    .locator("body")
    .evaluate(() => {
      const bridge = (window as unknown as {
        __STUDIO_IMAGE_BRIDGE__?: { snapshot: () => unknown };
      }).__STUDIO_IMAGE_BRIDGE__;
      return bridge?.snapshot() as { settings?: { medium?: { type?: string } }; photo?: { width?: number; height?: number } };
    });
  expect(reopened.settings?.medium?.type).toBe("Dots");
  expect(reopened.photo).toMatchObject({ width: 300, height: 400 });
});
