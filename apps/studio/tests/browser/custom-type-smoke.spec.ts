import { expect, test } from "./studio-test";
import {
  openType,
  publishActiveTool,
  readAssetRecords,
  readNewestProject,
  setRange,
  switchTypeMode,
  typeFrame,
  waitForStudio,
  waitForTypeReady,
} from "./studio-helpers";
import { makePng, readPngSize } from "../fixtures/png";

test("custom type publishes, restores strokes and reopens in custom mode", async ({ page }) => {
  await waitForStudio(page);
  await openType(page);
  await switchTypeMode(page, "custom");
  const frame = typeFrame(page, "custom");
  await frame.locator("#upload").setInputFiles({
    name: "native-motif.png",
    mimeType: "image/png",
    buffer: makePng({ width: 220, height: 220 }),
  });
  await expect(frame.locator("#remove-image")).toBeEnabled();
  await expect(frame.locator("#imgSize")).toBeEnabled();
  const drawBox = await frame.locator("#draw").boundingBox();
  expect(drawBox).toBeTruthy();
  for (const offset of [-30, 20]) {
    await page.mouse.move(
      drawBox!.x + drawBox!.width * 0.42,
      drawBox!.y + drawBox!.height * (0.5 + offset / 300),
    );
    await page.mouse.down();
    await page.mouse.move(
      drawBox!.x + drawBox!.width * 0.58,
      drawBox!.y + drawBox!.height * (0.42 + offset / 300),
      { steps: 8 },
    );
    await page.mouse.move(
      drawBox!.x + drawBox!.width * 0.52,
      drawBox!.y + drawBox!.height * (0.62 + offset / 300),
      { steps: 8 },
    );
    await page.mouse.up();
  }
  await frame.locator("#layer-image").click();
  await expect(frame.locator("#layer-image")).toHaveAttribute("aria-checked", "true");
  await frame.locator("#remove-image").click();
  await expect(frame.locator("#remove-image")).toBeDisabled();
  await frame.locator("#to-type").click();
  await frame.locator("#text").fill("BEND");
  await setRange(frame, "#letterSize", 220);
  await setRange(frame, "#motifSize", 150);
  await setRange(frame, "#spacing", 12);
  await setRange(frame, "#serif", 35);
  await setRange(frame, "#slant", 8);
  await setRange(frame, "#rotation", 15);
  await expect(frame.locator("#preview")).toBeVisible();

  const before = await frame.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_CUSTOM_TYPE_BRIDGE__?: {
        snapshot: () => unknown;
        canvasDataUrl: () => string;
      };
    }).__STUDIO_CUSTOM_TYPE_BRIDGE__;
    return {
      snapshot: bridge?.snapshot(),
      canvasDataUrl: bridge?.canvasDataUrl(),
    };
  });
  expect(before.snapshot).toMatchObject({
    text: "BEND",
    letterSize: 220,
    motifSize: 1.5,
    spacing: 0.12,
    serif: 0.35,
    slant: 8,
    rotation: 15,
    stage: "type",
  });
  const beforeSnapshot = before.snapshot as { strokes?: Array<{ points?: number }> };
  expect(beforeSnapshot.strokes?.length).toBeGreaterThanOrEqual(2);

  await publishActiveTool(page);
  const assets = await readAssetRecords(page);
  const rendered = assets.find((asset) => asset.kind === "rendered-image");
  expect(rendered).toBeTruthy();
  const size = readPngSize(Buffer.from(rendered!.bytesBase64, "base64"));
  expect(size.width).toBeGreaterThan(300);
  expect(size.height).toBeGreaterThan(100);

  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  const layer = layers[0];
  expect(layer.kind).toBe("typography");
  expect((layer.metadata as { tags?: string[] }).tags).toContain("type-mode:custom");
  const layerId = String(layer.id);
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForTypeReady(page, "custom");
  const reopened = await typeFrame(page, "custom")
    .locator("body")
    .evaluate(() => {
      const bridge = (window as unknown as {
        __STUDIO_CUSTOM_TYPE_BRIDGE__?: {
          snapshot: () => unknown;
          canvasDataUrl: () => string;
        };
      }).__STUDIO_CUSTOM_TYPE_BRIDGE__;
      return {
        snapshot: bridge?.snapshot(),
        canvasDataUrl: bridge?.canvasDataUrl(),
      };
    });
  expect(reopened.snapshot).toMatchObject({
    text: "BEND",
    letterSize: 220,
    motifSize: 1.5,
    spacing: 0.12,
    serif: 0.35,
    slant: 8,
    rotation: 15,
    stage: "type",
  });
  expect(
    (reopened.snapshot as { strokes?: unknown[] }).strokes,
  ).toEqual((before.snapshot as { strokes?: unknown[] }).strokes);
  expect(reopened.canvasDataUrl).toBe(before.canvasDataUrl);

  await typeFrame(page, "custom").locator("#text").fill("BEND II");
  await publishActiveTool(page);
  const republished = await readNewestProject(page);
  const republishedLayers = republished?.project.layers as Array<Record<string, unknown>>;
  expect(republishedLayers).toHaveLength(1);
  expect(republishedLayers[0].id).toBe(layerId);
  expect(Number((republishedLayers[0].sourceState as { revision?: number }).revision)).toBe(2);
});
