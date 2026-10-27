import { expect, test } from "./studio-test";
import {
  openType,
  publishActiveTool,
  readAssetRecords,
  readNewestProject,
  setRange,
  typeFrame,
  waitForStudio,
  waitForTypeReady,
} from "./studio-helpers";
import { readPngSize } from "../fixtures/png";

test("type library publishes a transparent raster and restores the font", async ({ page }) => {
  await waitForStudio(page);
  await openType(page);
  const frame = typeFrame(page);
  await expect(frame.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await frame.locator(".font-row", { hasText: "Goozette" }).click();
  await frame.locator("#text").fill("Studio Type");
  await setRange(frame, "#size", 220);
  await setRange(frame, "#tracking", 6);
  await setRange(frame, "#weight", 600);
  await expect(frame.locator("#credit")).toContainText("Goozette");
  await setRange(frame, "#strength", 80);
  await setRange(frame, "#brush", 150);
  const previewBox = await frame.locator("#preview").boundingBox();
  expect(previewBox).toBeTruthy();
  await page.mouse.move(
    previewBox!.x + previewBox!.width * 0.36,
    previewBox!.y + previewBox!.height * 0.52,
  );
  await page.mouse.down();
  await page.mouse.move(
    previewBox!.x + previewBox!.width * 0.62,
    previewBox!.y + previewBox!.height * 0.45,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(250);

  const before = await frame.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_TYPE_LIBRARY_BRIDGE__?: {
        snapshot: () => unknown;
        canvasDataUrl: () => string;
      };
    }).__STUDIO_TYPE_LIBRARY_BRIDGE__;
    return {
      snapshot: bridge?.snapshot(),
      canvasDataUrl: bridge?.canvasDataUrl(),
    };
  });
  expect(before.snapshot).toMatchObject({ font: "Goozette", text: "Studio Type" });
  const beforeField = before.snapshot as {
    field?: { nonZero?: number };
  };
  expect(beforeField.field?.nonZero ?? 0).toBeGreaterThan(0);

  await publishActiveTool(page);
  const assets = await readAssetRecords(page);
  const rendered = assets.find((asset) => asset.kind === "rendered-image");
  expect(rendered).toBeTruthy();
  const size = readPngSize(Buffer.from(rendered!.bytesBase64, "base64"));
  expect(size.width).toBeGreaterThan(400);
  expect(size.height).toBeGreaterThan(100);

  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  const layerId = String(layers[0].id);
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForTypeReady(page);
  const reopened = await typeFrame(page)
    .locator("body")
    .evaluate(() => {
      const bridge = (window as unknown as {
        __STUDIO_TYPE_LIBRARY_BRIDGE__?: {
          snapshot: () => unknown;
          canvasDataUrl: () => string;
        };
      }).__STUDIO_TYPE_LIBRARY_BRIDGE__;
      return {
        snapshot: bridge?.snapshot(),
        canvasDataUrl: bridge?.canvasDataUrl(),
      };
    });
  expect(reopened.snapshot).toMatchObject({
    font: "Goozette",
    text: "Studio Type",
    size: 220,
    tracking: 0.06,
    weight: 600,
    strength: 80,
    brush: 150,
  });
  const reopenedField = reopened.snapshot as { field?: { nonZero?: number } };
  expect(reopenedField.field).toEqual(
    (before.snapshot as { field?: unknown }).field,
  );
  expect(reopened.canvasDataUrl).toBe(before.canvasDataUrl);

  // Revise and republish the same Type layer.
  await setRange(typeFrame(page), "#size", 180);
  await publishActiveTool(page);
  const republished = await readNewestProject(page);
  const republishedLayers = republished?.project.layers as Array<Record<string, unknown>>;
  expect(republishedLayers).toHaveLength(1);
  expect(republishedLayers[0].id).toBe(layerId);
  expect(Number((republishedLayers[0].sourceState as { revision?: number }).revision)).toBe(2);
});

test("Type Library reset distortion clears the preserved renderer field", async ({ page }) => {
  await waitForStudio(page);
  await openType(page);
  const frame = typeFrame(page);
  await expect(frame.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await frame.locator(".font-row", { hasText: "Elastic" }).click();
  await frame.locator("#text").fill("RESET");
  await setRange(frame, "#strength", 70);
  const box = await frame.locator("#preview").boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.36, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.58, box!.y + box!.height * 0.48, {
    steps: 8,
  });
  await page.mouse.up();
  const distorted = await frame.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_TYPE_LIBRARY_BRIDGE__?: { snapshot: () => { field: { nonZero: number } } };
    }).__STUDIO_TYPE_LIBRARY_BRIDGE__;
    return bridge?.snapshot();
  });
  expect(distorted!.field.nonZero).toBeGreaterThan(0);
  await frame.getByRole("button", { name: "Reset distortion" }).click();
  const reset = await frame.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_TYPE_LIBRARY_BRIDGE__?: { snapshot: () => { field: { nonZero: number } } };
    }).__STUDIO_TYPE_LIBRARY_BRIDGE__;
    return bridge?.snapshot();
  });
  expect(reset!.field.nonZero).toBe(0);
});
