import { readFileSync } from "node:fs";
import JSZip from "jszip";
import type { Page } from "@playwright/test";
import { expect, test } from "./studio-test";
import {
  addBendSignalField,
  bendFrame,
  imageFrame,
  openBend,
  openGenerate,
  openImage,
  openShapes,
  openType,
  openVector,
  publishActiveTool,
  publishBend,
  readAssetRecords,
  readNewestProject,
  readSourceStateRecords,
  selectLayer,
  shapesFrame,
  typeFrame,
  waitForBendReady,
  waitForGenerateReady,
  waitForImageReady,
  waitForShapesReady,
  waitForStudio,
  waitForTypeReady,
  waitForVectorReady,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

async function captureDownload(page: Page, action: () => Promise<void>): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    action(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("Download did not produce a local file.");
  return readFileSync(path);
}

async function backToCanvas(page: Page): Promise<void> {
  await page.getByTestId("tool-canvas").click();
  if (await page.getByRole("dialog", { name: "Leave this editor?" }).isVisible()) {
    await page.getByRole("dialog", { name: "Leave this editor?" }).getByRole("button", { name: "Discard and leave" }).click();
  }
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 30_000 });
}

async function readProjectIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-projects");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const transaction = database.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return records.map((record) => String(record.id));
  });
}

test("portable project package round-trips every native source into a clean browser context", async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000);
  await waitForStudio(page);

  // Image.
  await openImage(page);
  await imageFrame(page)
    .locator("#file")
    .setInputFiles({
      name: "portable-source.png",
      mimeType: "image/png",
      buffer: makePng({
        width: 600,
        height: 750,
        pixel(x, y) {
          return [30 + (x % 120), 90 + (y % 80), 120, 255];
        },
      }),
    });
  await expect(imageFrame(page).locator("#hn")).toHaveValue("portable-source");
  await publishActiveTool(page);

  // Vector.
  await openVector(page);
  await publishActiveTool(page);

  // Type.
  await openType(page);
  await expect(typeFrame(page).locator("#status")).toContainText("Fonts ready", {
    timeout: 60_000,
  });
  await typeFrame(page).locator(".font-row", { hasText: "Goozette" }).click();
  await typeFrame(page).locator("#text").fill("PORTABLE");
  await publishActiveTool(page);

  // Shapes.
  await openShapes(page);
  await shapesFrame(page).getByRole("button", { name: "Add Cube" }).click();
  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  // Generate background.
  await openGenerate(page);
  await page.getByRole("button", { name: /Publish background layer/ }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  // BEND video/package/poster.
  await openBend(page);
  await addBendSignalField(bendFrame(page));
  await publishBend(page);

  const projectName = page.getByRole("textbox", { name: "Project name" });
  await projectName.fill("Portable Project");
  await projectName.blur();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  const project = await readNewestProject(page);
  const layerTools = ((project?.project.layers ?? []) as Array<Record<string, unknown>>).map(
    (layer) => layer.sourceTool,
  );
  expect(layerTools.sort()).toEqual([
    "bend",
    "generate",
    "image",
    "shapes",
    "typography",
    "vector",
  ]);

  // Export the editable package.
  await page.getByTestId("open-project-data").click();
  const packageBytes = await captureDownload(page, async () => {
    await page.getByTestId("export-project-package").click();
  });
  await expect(page.getByTestId("project-package-success")).toContainText(
    "Project package downloaded",
    { timeout: 120_000 },
  );
  const zip = await JSZip.loadAsync(packageBytes);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as {
    format: string;
    formatVersion: number;
    schemaVersion: number;
    project: { sha256: string };
    assets: Array<{ kind: string; path: string }>;
    sourceStates: Array<{ tool: string }>;
  };
  expect(manifest.format).toBe("studio-project-package");
  expect(manifest.formatVersion).toBe(1);
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.sourceStates.map((entry) => entry.tool).sort()).toEqual([
    "bend",
    "generate",
    "image",
    "shapes",
    "typography",
    "vector",
  ]);
  expect(manifest.assets.some((entry) => entry.kind === "project-package")).toBe(true);
  expect(manifest.assets.some((entry) => entry.kind === "video")).toBe(true);
  expect(manifest.assets.some((entry) => entry.kind === "source-image")).toBe(true);
  for (const entry of manifest.assets) {
    expect(zip.file(entry.path)).toBeTruthy();
  }
  await page
    .getByTestId("project-data-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  // Independent browser context: no shared IndexedDB, cache or profile.
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  const errors: string[] = [];
  page2.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page2.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  await page2.goto("http://127.0.0.1:4175/");
  await page2.getByRole("button", { name: "Open your workspace" }).click();
  await expect(page2.getByRole("textbox", { name: "Project name" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page2.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 20_000,
  });

  await page2.getByTestId("open-project-data").click();
  await page2.getByTestId("import-project-package-input").setInputFiles({
    name: "portable-project.zip",
    mimeType: "application/zip",
    buffer: packageBytes,
  });
  await expect(page2.getByTestId("project-package-success")).toContainText(
    "Project imported",
    { timeout: 180_000 },
  );
  await page2
    .getByTestId("project-data-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  await expect(page2.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Portable Project",
  );
  await expect(page2.locator(".canvas-layer")).toHaveCount(6);
  const imported = await readNewestProject(page2);
  const firstImportedId = imported!.id;
  const importedLayers = (imported!.project.layers ?? []) as Array<Record<string, unknown>>;
  expect(importedLayers).toHaveLength(6);
  expect(await readSourceStateRecords(page2)).toHaveLength(6);
  const assetRecords = await readAssetRecords(page2);
  expect(assetRecords.some((asset) => asset.kind === "project-package")).toBe(true);
  expect(assetRecords.some((asset) => asset.kind === "video")).toBe(true);
  expect(assetRecords.some((asset) => asset.kind === "source-image")).toBe(true);

  // Every native editor must reopen from the imported references.
  for (const tool of ["image", "vector", "typography", "shapes", "generate", "bend"]) {
    const layer = importedLayers.find((candidate) => candidate.sourceTool === tool)!;
    expect(layer, `missing ${tool} layer`).toBeTruthy();
    await selectLayer(page2, String(layer.id));
    const editTestId =
      tool === "vector"
        ? "inspector-edit-vector"
        : tool === "shapes"
          ? "inspector-edit-shapes"
          : tool === "generate"
            ? "inspector-edit-generate"
            : "inspector-edit-layer";
    await page2.getByTestId(editTestId).click();
    if (tool === "image") await waitForImageReady(page2);
    if (tool === "vector") await waitForVectorReady(page2);
    if (tool === "typography") await waitForTypeReady(page2);
    if (tool === "shapes") await waitForShapesReady(page2);
    if (tool === "generate") await waitForGenerateReady(page2);
    if (tool === "bend") await waitForBendReady(page2);
    await backToCanvas(page2);
  }

  // Importing the same package again must create a copy, never overwrite.
  await page2.getByTestId("open-project-data").click();
  await page2.getByTestId("import-project-package-input").setInputFiles({
    name: "portable-project.zip",
    mimeType: "application/zip",
    buffer: packageBytes,
  });
  await expect(page2.getByTestId("project-package-success")).toContainText(
    "Saved as a new project",
    { timeout: 180_000 },
  );
  await page2
    .getByTestId("project-data-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const idsAfterDuplicate = await readProjectIds(page2);
  expect(idsAfterDuplicate).toContain(firstImportedId);
  expect(new Set(idsAfterDuplicate).size).toBe(idsAfterDuplicate.length);
  const newestAfterDuplicate = await readNewestProject(page2);
  expect(newestAfterDuplicate!.id).not.toBe(firstImportedId);

  // A corrupt asset must fail before touching the current project.
  const corruptZip = await JSZip.loadAsync(packageBytes);
  const corruptManifest = JSON.parse(
    await corruptZip.file("manifest.json")!.async("string"),
  ) as { assets: Array<{ path: string }> };
  const assetPath = corruptManifest.assets[0].path;
  corruptZip.file(assetPath, new Uint8Array([1, 2, 3, 4, 5]));
  const corruptBytes = await corruptZip.generateAsync({ type: "nodebuffer" });
  const beforeCorrupt = await readNewestProject(page2);
  await page2.getByTestId("open-project-data").click();
  await page2.getByTestId("import-project-package-input").setInputFiles({
    name: "corrupt.zip",
    mimeType: "application/zip",
    buffer: corruptBytes,
  });
  await expect(page2.getByTestId("project-package-error")).toContainText(
    /hash|does not match|integrity/i,
    { timeout: 60_000 },
  );
  const afterCorrupt = await readNewestProject(page2);
  expect(afterCorrupt!.id).toBe(beforeCorrupt!.id);
  expect((afterCorrupt!.project.layers as unknown[] | undefined)?.length).toBe(6);

  // A future package version must be rejected explicitly.
  const futureZip = await JSZip.loadAsync(packageBytes);
  const futureManifest = JSON.parse(
    await futureZip.file("manifest.json")!.async("string"),
  ) as { formatVersion: number };
  futureManifest.formatVersion = 99;
  futureZip.file("manifest.json", JSON.stringify(futureManifest));
  const futureBytes = await futureZip.generateAsync({ type: "nodebuffer" });
  await page2.getByTestId("import-project-package-input").setInputFiles({
    name: "future.zip",
    mimeType: "application/zip",
    buffer: futureBytes,
  });
  await expect(page2.getByTestId("project-package-error")).toContainText(
    /newer than this Studio build supports/i,
    { timeout: 60_000 },
  );
  expect(await readProjectIds(page2)).toHaveLength(idsAfterDuplicate.length);

  expect(errors).toEqual([]);
  await context2.close();
});
