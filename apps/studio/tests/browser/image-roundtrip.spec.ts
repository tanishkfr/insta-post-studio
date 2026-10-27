import { expect, test } from "./studio-test";
import {
  chooseFormat,
  imageFrame,
  openImage,
  publishActiveTool,
  readNewestProject,
  readSourceStateRecords,
  setRange,
  waitForImageReady,
  waitForStudio,
} from "./studio-helpers";
import { makePng, readPngSize } from "../fixtures/png";

interface ImageSnapshot {
  settings?: Record<string, unknown>;
  historyIndex?: number;
  historyLength?: number;
  photo?: { width?: number; height?: number; byteLength?: number };
  mask?: { width?: number; height?: number; nonZero?: number };
  tab?: string;
  selectedLayer?: string;
}

async function snapshot(page: import("@playwright/test").Page): Promise<ImageSnapshot> {
  return page
    .frameLocator('iframe[title="Image editor"]')
    .locator("body")
    .evaluate(() => {
      const bridge = (window as unknown as {
        __STUDIO_IMAGE_BRIDGE__?: { snapshot: () => ImageSnapshot };
      }).__STUDIO_IMAGE_BRIDGE__;
      return bridge?.snapshot() as ImageSnapshot;
    });
}

test("Journey A: Image effects, mask, crop and history survive publish/reload/republish", async ({ page }) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");
  await openImage(page);
  const frame = imageFrame(page);
  await frame.locator("#file").setInputFiles({
    name: "journey-a.png",
    mimeType: "image/png",
    buffer: makePng({
      width: 640,
      height: 800,
      pixel(x, y) {
        return [
          Math.round(20 + (x / 640) * 210),
          Math.round(40 + (y / 800) * 160),
          Math.round(80 + ((x + y) / 1440) * 150),
          255,
        ];
      },
    }),
  });
  await expect(frame.locator("#hn")).toHaveValue("journey-a");

  // Several independent effects.
  await frame.locator("#cm .sg", { hasText: "Duotone" }).click();
  await frame.locator('#cats .t', { hasText: "Dots" }).first().click();
  await frame.locator('#cats .t', { hasText: "Glitch" }).first().click();
  await frame.getByRole("tab", { name: "Effects" }).click();
  await setRange(
    frame,
    '#ctrls .row:has-text("Shift") input.rng',
    65,
  );

  // Painted mask over the effect stack.
  await frame.locator('#cats .t', { hasText: "Paint" }).first().click();
  const wrapBox = await frame.locator("#wrap").boundingBox();
  expect(wrapBox).toBeTruthy();
  await page.mouse.move(
    wrapBox!.x + wrapBox!.width * 0.32,
    wrapBox!.y + wrapBox!.height * 0.36,
  );
  await page.mouse.down();
  await page.mouse.move(
    wrapBox!.x + wrapBox!.width * 0.62,
    wrapBox!.y + wrapBox!.height * 0.52,
    { steps: 10 },
  );
  await page.mouse.up();

  // Internal crop inside Image.
  await frame.getByRole("tab", { name: "Edit" }).click();
  await setRange(frame, '#ctrls .row:has-text("Zoom") input.rng', 1.4);
  await setRange(frame, '#ctrls .row:has-text("Left / right") input.rng', 0.32);
  await setRange(frame, '#ctrls .row:has-text("Up / down") input.rng', 0.58);

  // Internal layer opacity and ordering controls.
  await frame.getByRole("tab", { name: "Layers" }).click();
  await frame.locator(".lrow", { hasText: "Styled photo" }).click();
  await setRange(frame, ".lctl .row input.rng", 80);
  await frame.locator(".lrow", { hasText: "Styled photo" }).locator("button[aria-label='Bring forward']").click();

  // Effect-stack reorder via the preserved keyboard handle.
  await frame.getByRole("tab", { name: "Effects" }).click();
  const blurHandle = frame.locator('.srow[data-k="blur"] .grab');
  await blurHandle.focus();
  await blurHandle.press("ArrowDown");
  // Let the preserved editor's 400 ms history debounce record the edits.
  await page.waitForTimeout(650);

  const before = await snapshot(page);
  expect(before.settings).toMatchObject({
    color: { mode: "Duotone" },
    medium: { on: 1, type: "Dots" },
    blur: { on: 1, type: "Glitch" },
    zone: { paint: "Paint" },
    frame: { zoom: 1.4 },
  });
  expect((before.mask?.nonZero ?? 0)).toBeGreaterThan(0);
  expect(before.photo).toMatchObject({ width: 640, height: 800 });

  await publishActiveTool(page);
  const firstProject = await readNewestProject(page);
  const layers = firstProject?.project.layers as Array<Record<string, unknown>>;
  const layer = layers[0];
  const layerId = String(layer.id);
  expect(layer.kind).toBe("image");
  const firstRevision = Number((layer.sourceState as { revision?: number }).revision);
  const firstSourceHash = String((layer.sourceState as { contentHash?: string }).contentHash);
  const firstTransform = layer.transform as Record<string, number>;
  const renderAssetId = (layer.rendered as { assetId?: string }).assetId;
  expect(renderAssetId).toBeTruthy();

  const sources = await readSourceStateRecords(page);
  const stored = sources.find((record) => record.contentHash === firstSourceHash);
  expect(stored?.tool).toBe("image");
  const parsed = JSON.parse(stored!.content) as {
    photo: { assetId: string; dataUrl?: string };
    settings: Record<string, unknown>;
    history: unknown[];
    historyIndex: number;
    mask: { dataUrl: string } | null;
  };
  expect(parsed.photo.assetId).toBeTruthy();
  expect(parsed.photo.dataUrl).toBeUndefined();
  expect(parsed.settings).toMatchObject(before.settings as Record<string, unknown>);
  expect(parsed.mask?.dataUrl.startsWith("data:image/png")).toBe(true);
  expect(parsed.history.length).toBeGreaterThan(1);
  expect(parsed.historyIndex).toBeGreaterThan(0);

  // Host transform changes must not be overwritten by Image republishing.
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByLabel("X").fill("120");
  await page.getByLabel("X").blur();
  await page.getByLabel("Rotation").fill("8");
  await page.getByLabel("Rotation").blur();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  const transformed = await readNewestProject(page);
  const transformedLayer = (transformed?.project.layers as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === layerId,
  );
  const hostTransform = transformedLayer!.transform as Record<string, number>;

  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  const reopened = await snapshot(page);
  expect(reopened.settings).toMatchObject(before.settings as Record<string, unknown>);
  expect(reopened.mask?.nonZero).toBe(before.mask?.nonZero);
  expect(reopened.photo).toMatchObject({ width: 640, height: 800 });
  expect(reopened.historyLength).toBe(before.historyLength);
  expect(reopened.historyIndex).toBe(before.historyIndex);

  // Native undo/redo still operates on the restored history.
  await frame.locator("#un").click();
  const undone = await snapshot(page);
  expect(JSON.stringify(undone.settings)).not.toBe(JSON.stringify(reopened.settings));
  await frame.locator("#re").click();
  const redone = await snapshot(page);
  expect(JSON.stringify(redone.settings)).toBe(JSON.stringify(reopened.settings));

  // Revise one effect and republish to the same layer.
  await frame.getByRole("tab", { name: "Edit" }).click();
  await setRange(frame, '#ctrls .row:has-text("Brightness") input.rng', 0.25);
  await publishActiveTool(page);
  const secondProject = await readNewestProject(page);
  const secondLayers = secondProject?.project.layers as Array<Record<string, unknown>>;
  expect(secondLayers).toHaveLength(1);
  const secondLayer = secondLayers[0];
  expect(secondLayer.id).toBe(layerId);
  expect(secondLayer.transform).toMatchObject(hostTransform);
  expect(Number((secondLayer.sourceState as { revision?: number }).revision)).toBe(
    firstRevision + 1,
  );
  expect(String((secondLayer.sourceState as { contentHash?: string }).contentHash)).not.toBe(
    firstSourceHash,
  );
  const secondRender = String((secondLayer.rendered as { assetId?: string }).assetId);
  const { readAssetRecords } = await import("./studio-helpers");
  const currentAssets = await readAssetRecords(page);
  const secondSources = await readSourceStateRecords(page);
  const secondDoc = secondSources.find(
    (record) => record.contentHash === (secondLayer.sourceState as { contentHash?: string }).contentHash,
  );
  const secondParsed = secondDoc ? JSON.parse(secondDoc.content) : null;
  expect(secondParsed?.settings?.color?.bri).toBeCloseTo(0.25);
  expect(secondRender).not.toBe(renderAssetId);

  // Cancel after unsaved edits must leave the republished revision untouched.
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  await frame.getByRole("tab", { name: "Edit" }).click();
  await setRange(frame, '#ctrls .row:has-text("Brightness") input.rng', -0.4);
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  const afterCancel = await readNewestProject(page);
  const cancelLayer = (afterCancel?.project.layers as Array<Record<string, unknown>>)[0];
  expect(String((cancelLayer.sourceState as { contentHash?: string }).contentHash)).toBe(
    String((secondLayer.sourceState as { contentHash?: string }).contentHash),
  );

  const finalAssets = await readSourceStateRecords(page);
  const firstStored = finalAssets.find((record) => record.contentHash === firstSourceHash);
  expect(firstStored).toBeTruthy();

  // Host undo/redo keeps both binary source and render references readable.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  const undoneRecord = await readNewestProject(page);
  const undoneLayer = (undoneRecord?.project.layers as Array<Record<string, unknown>>)[0];
  expect(
    String((undoneLayer.sourceState as { contentHash?: string }).contentHash),
  ).toBe(firstSourceHash);
  await expect(
    page.locator(`[data-testid="canvas-layer"][data-layer-id="${layerId}"] img.raster-artwork`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  const redoneRecord = await readNewestProject(page);
  const redoneLayer = (redoneRecord?.project.layers as Array<Record<string, unknown>>)[0];
  expect(
    String((redoneLayer.sourceState as { contentHash?: string }).contentHash),
  ).toBe(String((secondLayer.sourceState as { contentHash?: string }).contentHash));

  // 4:5 publication is full resolution (not the 600×750 preview).
  const rendered = currentAssets.find((asset) => asset.id === secondRender);
  const size = readPngSize(Buffer.from(rendered!.bytesBase64, "base64"));
  expect(size).toEqual({ width: 1080, height: 1350 });
});


