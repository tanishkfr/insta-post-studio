import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  openVector,
  publishVector,
  waitForStudio,
} from "./studio-helpers";
import { readPngSize } from "../fixtures/png";
import { inspectPng } from "../../src/adapters/image/rasterValidation";

async function captureDownload(page: Page, action: () => Promise<void>): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    action(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("Export did not produce a local PNG.");
  return readFileSync(path);
}

test("4:5, 1:1 and 9:16 composition exports use exact native dimensions", async ({ page }) => {
  await waitForStudio(page);
  await openVector(page);
  await publishVector(page);

  const cases = [
    ["instagram-square", 1080, 1080],
    ["instagram-story", 1080, 1920],
    ["instagram-4-5", 1080, 1350],
  ] as const;

  for (const [formatId, width, height] of cases) {
    await page.getByRole("combobox", { name: "Project format" }).selectOption(formatId);
    await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("artboard")).toHaveAttribute(
      "style",
      new RegExp(`aspect-ratio:\\s*${width} / ${height}`),
    );
    await page.getByTestId("open-export").click();
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toContainText(`${width}×${height} px`);
    const png = await captureDownload(page, async () => {
      await page.getByTestId("export-start").click();
    });
    expect(readPngSize(png)).toEqual({ width, height });
    const info = inspectPng(png);
    expect(info.hasAlpha).toBe(true);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("an explicitly transparent active artboard keeps alpha and is still a valid PNG", async ({
  page,
}) => {
  await waitForStudio(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-projects");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = new Date().toISOString();
    const project = {
      id: "project_phase6_transparent",
      name: "Transparent export",
      schemaVersion: 1,
      format: {
        id: "instagram-square",
        label: "Instagram 1:1",
        width: 1080,
        height: 1080,
        unit: "px",
        aspectRatio: 1,
        orientation: "square",
      },
      artboards: [
        {
          id: "artboard_transparent",
          name: "Transparent artboard",
          index: 0,
          width: 1080,
          height: 1080,
          background: { kind: "transparent" },
          layerOrder: [],
        },
      ],
      layers: [],
      assets: [],
      layerOrder: [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        appVersion: "0.2.0",
        tags: [],
        sourceProjects: [],
      },
    };
    const transaction = database.transaction("projects", "readwrite");
    transaction.objectStore("projects").put({
      id: project.id,
      revision: 1,
      savedAt: new Date(Date.now() + 5_000).toISOString(),
      schemaVersion: 1,
      project,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await waitForStudio(page);
  await expect(page.getByTestId("artboard-tab-artboard_transparent")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByTestId("open-export").click();
  await page.getByTestId("export-background-transparent").check();
  const png = await captureDownload(page, async () => {
    await page.getByTestId("export-start").click();
  });
  expect(readPngSize(png)).toEqual({ width: 1080, height: 1080 });
  const transparentPixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] === 0) count += 1;
    }
    return count;
  }, png.toString("base64"));
  expect(transparentPixels).toBe(1080 * 1080);
  await expect(page.getByTestId("export-success")).toContainText("transparent");
});
