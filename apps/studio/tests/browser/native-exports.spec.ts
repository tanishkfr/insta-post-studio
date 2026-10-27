import { readFileSync } from "node:fs";
import JSZip from "jszip";
import * as opentype from "opentype.js";
import { expect, test, type Page } from "@playwright/test";
import { waitForStudio } from "./studio-helpers";
import {
  chooseFormat,
  imageFrame,
  openImage,
  waitForImageReady,
} from "./studio-helpers";
import { makePng, readPngSize } from "../fixtures/png";
import { openType, switchTypeMode, typeFrame } from "./studio-helpers";

async function captureDownload(page: Page, action: () => Promise<void>): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    action(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("Download did not produce a local file.");
  return readFileSync(path);
}

async function uploadPhoto(page: Page): Promise<void> {
  await openImage(page);
  const frame = imageFrame(page);
  await frame.locator("#file").setInputFiles({
    name: "exports.png",
    mimeType: "image/png",
    buffer: makePng({ width: 720, height: 900 }),
  });
  await expect(frame.locator("#hn")).toHaveValue("exports");
  await waitForImageReady(page);
}

test("Image native PNG and layered ZIP exports remain available", async ({ page }) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-story");
  await uploadPhoto(page);
  const frame = imageFrame(page);
  await frame.locator('#cats .t', { hasText: "Dots" }).first().click();
  await frame.locator("#ex").click();
  await expect(frame.locator("#modal.on")).toBeVisible({ timeout: 20_000 });

  const png = await captureDownload(page, async () => {
    await frame.getByRole("button", { name: "Download flattened PNG" }).click();
  });
  expect(readPngSize(png)).toEqual({ width: 1080, height: 1920 });

  const zipBytes = await captureDownload(page, async () => {
    await frame.getByRole("button", { name: "Download layers (.zip)" }).click();
  });
  const zip = await JSZip.loadAsync(zipBytes);
  expect(zip.file("manifest.json")).toBeTruthy();
  expect(zip.file("flattened.png")).toBeTruthy();
  expect(zip.file("source.json")).toBeTruthy();
  expect(zip.file("paint-mask.png")).toBeTruthy();
  const layerFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith("layers/") && name.endsWith(".png"),
  );
  expect(layerFiles.length).toBe(3);
  const source = JSON.parse(await zip.file("source.json")!.async("string")) as {
    schemaVersion: number;
    settings: { medium: { type: string } };
  };
  expect(source.schemaVersion).toBe(1);
  expect(source.settings.medium.type).toBe("Dots");
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as {
    originatingTool: string;
    width: number;
    height: number;
    layers: unknown[];
  };
  expect(manifest).toMatchObject({
    originatingTool: "image",
    width: 1080,
    height: 1920,
  });
  expect(manifest.layers).toHaveLength(3);
});

test("Image native animated GIF export remains available", async ({ page }) => {
  test.setTimeout(240_000);
  await waitForStudio(page);
  await chooseFormat(page, "instagram-square");
  await uploadPhoto(page);
  const frame = imageFrame(page);
  await frame.getByRole("tab", { name: "Motion" }).click();
  await frame
    .locator('#ctrls .row:has-text("Piece motion")')
    .getByRole("button", { name: "Pulse" })
    .click();
  await frame
    .locator('#ctrls .row:has-text("Loop length") input.rng')
    .evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await frame.locator("#ex").click();
  await expect(frame.locator("#modal.on")).toBeVisible({ timeout: 20_000 });
  await frame.getByLabel("Frame rate").selectOption("10");
  await frame.getByLabel("GIF width").selectOption("360");
  await frame.getByRole("button", { name: "Make GIF" }).click();
  const downloadButton = frame.getByRole("button", { name: /Download GIF/ });
  await expect(downloadButton).toBeVisible({ timeout: 180_000 });
  const gif = await captureDownload(page, async () => {
    await downloadButton.click();
  });
  expect(gif.toString("ascii", 0, 6)).toBe("GIF89a");
  expect(gif.readUInt16LE(6)).toBe(360);
  expect(gif.readUInt16LE(8)).toBe(360);
});

test("Vector native SVG and PNG exports remain available", async ({ page }) => {
  test.setTimeout(180_000);
  await waitForStudio(page);
  await page.getByTestId("tool-vector").click();
  await page.getByRole("button", { name: /Add to composition/ }).waitFor({ state: "visible" });
  const frame = page.frameLocator('iframe[title="Vector editor"]');
  await expect(frame.getByRole("button", { name: "Randomise shape" })).toBeVisible({
    timeout: 20_000,
  });
  const svg = await captureDownload(page, async () => {
    await frame.locator("#svg").click();
  });
  expect(svg.toString("utf8")).toContain("<svg");
  await frame.locator("details.menu summary").click();
  const png = await captureDownload(page, async () => {
    await frame.getByRole("button", { name: "Export PNG" }).click();
  });
  expect(readPngSize(png)).toEqual({ width: 2000, height: 2828 });
});

test("Type Library native PNG export remains available", async ({ page }) => {
  await waitForStudio(page);
  await openType(page);
  const frame = typeFrame(page);
  await expect(frame.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await frame.locator(".font-row", { hasText: "Goozette" }).click();
  await frame.locator("#text").fill("Natural Type");
  const png = await captureDownload(page, async () => {
    await frame.locator("#export-png").click();
  });
  const size = readPngSize(png);
  expect(size.width).toBeGreaterThan(300);
  expect(size.height).toBeGreaterThan(80);
});

test("Custom Type native PNG and OTF exports remain available", async ({ page }) => {
  await waitForStudio(page);
  await openType(page);
  await switchTypeMode(page, "custom");
  const frame = typeFrame(page, "custom");
  const drawCanvas = frame.locator("#draw");
  await expect(drawCanvas).toBeVisible();
  // Click positions are resolved at action time, so a slow parallel run cannot
  // leave this gesture aimed at stale page coordinates.
  const drawSize = await drawCanvas.evaluate((canvas) => ({
    width: (canvas as HTMLCanvasElement).clientWidth,
    height: (canvas as HTMLCanvasElement).clientHeight,
  }));
  await drawCanvas.click({
    position: { x: drawSize.width * 0.44, y: drawSize.height * 0.46 },
  });
  await drawCanvas.click({
    position: { x: drawSize.width * 0.56, y: drawSize.height * 0.58 },
  });
  await expect
    .poll(async () =>
      frame.locator("body").evaluate(() => {
        const bridge = (window as unknown as {
          __STUDIO_CUSTOM_TYPE_BRIDGE__?: {
            snapshot?: () => { strokes?: unknown[] };
          };
        }).__STUDIO_CUSTOM_TYPE_BRIDGE__;
        return bridge?.snapshot?.().strokes?.length ?? 0;
      }),
    )
    .toBeGreaterThan(0);
  await frame.locator("#to-type").click();
  await frame.locator("#text").fill("OTF");

  const png = await captureDownload(page, async () => {
    await frame.locator("#export-png").click();
  });
  const size = readPngSize(png);
  expect(size.width).toBeGreaterThan(100);

  const otfBytes = await captureDownload(page, async () => {
    await frame.locator("#export-otf").click();
  });
  expect(otfBytes.toString("ascii", 0, 4)).toBe("OTTO");
  const font = opentype.parse(
    otfBytes.buffer.slice(otfBytes.byteOffset, otfBytes.byteOffset + otfBytes.byteLength),
  );
  expect(font.unitsPerEm).toBe(1000);
  expect(font.glyphs.length).toBeGreaterThan(90);
  expect(font.glyphs.get(1).name).toBe("space");
});
