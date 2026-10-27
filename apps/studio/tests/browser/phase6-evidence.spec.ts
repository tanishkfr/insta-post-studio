import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import {
  addBendSignalField,
  bendFrame,
  chooseFormat,
  imageFrame,
  openBend,
  openGenerate,
  openImage,
  openShapes,
  openType,
  openVector,
  publishActiveTool,
  readNewestProject,
  selectLayer,
  setVectorSeed,
  shapesFrame,
  typeFrame,
  vectorFrame,
  waitForBendReady,
  waitForGenerateReady,
  waitForImageReady,
  waitForShapesReady,
  waitForStudio,
  waitForTypeReady,
  waitForVectorReady,
} from "./studio-helpers";
import { makePng, readPngSize } from "../fixtures/png";
import { inspectPng } from "../../src/adapters/image/rasterValidation";

const evidence = (name: string) => {
  const dir = resolve(process.cwd(), "../../docs/evidence/phase-6/after");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, name);
};

const evidenceFile = (name: string) => {
  const dir = resolve(process.cwd(), "../../docs/evidence/phase-6/files");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, name);
};

async function backToCanvas(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 30_000 });
}

async function saveDownload(
  page: Page,
  action: () => Promise<void>,
  path: string,
): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    action(),
  ]);
  await download.saveAs(path);
  return readFileSync(path);
}

test("capture the refined Studio layout and real export files", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");
  await page.screenshot({ path: evidence("01-empty-canvas-1440.png") });

  await openImage(page);
  await imageFrame(page)
    .locator("#file")
    .setInputFiles({
      name: "studio-source.png",
      mimeType: "image/png",
      buffer: makePng({
        width: 1080,
        height: 1350,
        pixel(x, y) {
          const r = Math.round(22 + (x / 1080) * 180);
          const g = Math.round(90 + (y / 1350) * 90);
          const b = Math.round(150 - (x / 1080) * 70);
          return [r, g, b, 255];
        },
      }),
    });
  await expect(imageFrame(page).locator("#hn")).toHaveValue("studio-source");
  await publishActiveTool(page);

  await openVector(page);
  await setVectorSeed(vectorFrame(page), 42);
  await publishActiveTool(page);

  await openType(page);
  await expect(typeFrame(page).locator("#status")).toContainText("Fonts ready", {
    timeout: 60_000,
  });
  await typeFrame(page).locator(".font-row", { hasText: "Goozette" }).click();
  await typeFrame(page).locator("#text").fill("STUDIO 06");
  await publishActiveTool(page);

  await openShapes(page);
  await shapesFrame(page).getByRole("button", { name: "Add Cube" }).click();
  await shapesFrame(page).getByRole("button", { name: "Add Torus" }).click();
  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });
  await page.screenshot({ path: evidence("02-populated-canvas-1440.png") });

  const project = await readNewestProject(page);
  const layers = (project?.project.layers ?? []) as Array<Record<string, unknown>>;
  const layerId = (tool: string) =>
    String(layers.find((layer) => layer.sourceTool === tool)!.id);

  await selectLayer(page, layerId("image"));
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  await page.screenshot({ path: evidence("03-image-editor-1440.png") });
  await backToCanvas(page);

  await selectLayer(page, layerId("vector"));
  await page.getByTestId("inspector-edit-vector").click();
  await waitForVectorReady(page);
  await page.screenshot({ path: evidence("04-vector-editor-1440.png") });
  await backToCanvas(page);

  await selectLayer(page, layerId("typography"));
  await page.getByTestId("inspector-edit-layer").click();
  await waitForTypeReady(page);
  await page.screenshot({ path: evidence("05-type-editor-1440.png") });
  await backToCanvas(page);

  await selectLayer(page, layerId("shapes"));
  await page.getByTestId("inspector-edit-shapes").click();
  await waitForShapesReady(page);
  await page.screenshot({ path: evidence("06-shapes-editor-1440.png") });
  await backToCanvas(page);

  await page.getByTestId("tool-generate").click();
  await waitForGenerateReady(page);
  await page.screenshot({ path: evidence("07-generate-editor-1440.png") });
  await backToCanvas(page);

  await page.getByTestId("tool-bend").click();
  await waitForBendReady(page);
  await addBendSignalField(bendFrame(page));
  await page.screenshot({ path: evidence("08-bend-editor-1440.png") });
  await backToCanvas(page);

  // Compact and intermediate widths, matching the archived before states.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Canvas workspace" })).toBeVisible();
  await page.screenshot({ path: evidence("09-compact-390.png") });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Layers" })).toBeVisible();
  await page.screenshot({ path: evidence("10-compact-layers-390.png") });
  await page.getByRole("dialog", { name: "Layers" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Inspector" })).toBeVisible();
  await page.screenshot({ path: evidence("11-compact-inspector-390.png") });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: evidence("12-1024.png") });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.screenshot({ path: evidence("13-900.png") });
  await page.setViewportSize({ width: 1440, height: 900 });

  // Composition export dialog and a real 1080×1350 PNG.
  await page.getByTestId("open-export").click();
  await page.screenshot({ path: evidence("14-export-dialog-1440.png") });
  const composition = await saveDownload(
    page,
    async () => page.getByTestId("export-start").click(),
    evidenceFile("composition-1080x1350.png"),
  );
  expect(readPngSize(composition)).toEqual({ width: 1080, height: 1350 });
  expect(inspectPng(composition).hasAlpha).toBe(true);
  await page
    .getByTestId("export-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  // A second artboard and an ordered carousel ZIP.
  await page.getByTestId("duplicate-artboard").click();
  await expect(page.locator(".artboard-tab")).toHaveCount(2);
  await page.getByTestId("rename-artboard").click();
  const rename = page.getByRole("textbox", { name: "Artboard name" });
  await rename.fill("Slide 02");
  await rename.press("Enter");
  await page.screenshot({ path: evidence("15-artboards-1440.png") });
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-scope-all").check();
  const carousel = await saveDownload(
    page,
    async () => page.getByTestId("export-start").click(),
    evidenceFile("carousel-2-artboards.zip"),
  );
  const carouselZip = await JSZip.loadAsync(carousel);
  const carouselManifest = JSON.parse(
    await carouselZip.file("manifest.json")!.async("string"),
  ) as { artboards: Array<{ file: string; width: number; height: number }> };
  expect(carouselManifest.artboards).toHaveLength(2);
  for (const entry of carouselManifest.artboards) {
    const bytes = Buffer.from(await carouselZip.file(entry.file)!.async("uint8array"));
    expect(readPngSize(bytes)).toEqual({ width: entry.width, height: entry.height });
  }
  await page
    .getByTestId("export-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  // Portable project dialog and a real editable backup.
  await page.getByTestId("open-project-data").click();
  await page.screenshot({ path: evidence("16-project-data-dialog-1440.png") });
  const projectPackage = await saveDownload(
    page,
    async () => page.getByTestId("export-project-package").click(),
    evidenceFile("project-package.zip"),
  );
  const packageZip = await JSZip.loadAsync(projectPackage);
  const packageManifest = JSON.parse(
    await packageZip.file("manifest.json")!.async("string"),
  ) as { format: string; sourceStates: unknown[]; assets: unknown[] };
  expect(packageManifest.format).toBe("studio-project-package");
  expect(packageManifest.sourceStates).toHaveLength(4);
  expect(packageManifest.assets.length).toBeGreaterThan(4);
  await page.getByTestId("run-asset-audit").click();
  await expect(page.getByTestId("asset-audit-result")).toBeVisible();
  await page
    .getByTestId("project-data-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
});
