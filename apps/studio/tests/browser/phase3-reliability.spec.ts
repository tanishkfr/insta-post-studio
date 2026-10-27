import { expect, test } from "./studio-test";
import {
  generateFrame,
  openGenerate,
  openShapes,
  publishActiveTool,
  readNewestProject,
  readSourceStateRecords,
  saveStudio,
  selectLayer,
  shapesFrame,
  waitForGenerateReady,
  waitForShapesReady,
  waitForStudio,
} from "./studio-helpers";

async function breakSourceVersions(page: import("@playwright/test").Page, tool: string) {
  await page.evaluate(async (targetTool) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-assets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("source-states", "readwrite");
      const store = transaction.objectStore("source-states");
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        for (const record of getAll.result as Array<Record<string, unknown>>) {
          if (record.tool !== targetTool) continue;
          record.toolStateVersion = "9.9.9";
          store.put(record);
        }
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }, tool);
}

test("unsupported Shapes source version fails before the iframe and preserves the layer", async ({
  page,
}) => {
  await waitForStudio(page);
  await openShapes(page);
  await shapesFrame(page).getByRole("button", { name: "Add Cube" }).click();
  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await saveStudio(page);
  const layerId = String(
    ((await readNewestProject(page))?.project.layers as Array<Record<string, unknown>>)[0].id,
  );
  await breakSourceVersions(page, "shapes");

  await selectLayer(page, layerId);
  await page.getByTestId("inspector-edit-shapes").click();
  await expect(page.getByTestId("shapes-editor")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/Unsupported Shapes source state/, {
    timeout: 15_000,
  });
  await page.getByTestId("shapes-editor").getByRole("button", { name: "Back to canvas" }).click();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await expect(page.locator(`.canvas-layer[data-layer-id="${layerId}"]`)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
});

test("Shapes render failure leaves the previous layer and source revision untouched", async ({
  page,
}) => {
  await waitForStudio(page);
  await openShapes(page);
  await shapesFrame(page).getByRole("button", { name: "Add Cube" }).click();
  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await saveStudio(page);
  const first = (await readNewestProject(page))!;
  const layerId = String((first.project.layers as Array<Record<string, unknown>>)[0].id);
  const before = (await readSourceStateRecords(page)).find((record) => record.tool === "shapes")!;

  await selectLayer(page, layerId);
  await page.getByTestId("inspector-edit-shapes").click();
  await waitForShapesReady(page);
  const frame = shapesFrame(page);
  await frame.locator(".object-name", { hasText: "Box 1" }).click();
  await frame.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Update Shapes layer" }).click();
  await expect(page.getByText("Could not publish")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/no visible objects/i)).toBeVisible();
  await page.getByTestId("shapes-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  const afterLayer = (await readNewestProject(page))!.project.layers as Array<Record<string, unknown>>;
  expect(String(afterLayer[0].id)).toBe(layerId);
  const afterSources = await readSourceStateRecords(page);
  const after = afterSources.filter((record) => record.tool === "shapes").at(-1)!;
  expect(after.contentHash).toBe(before.contentHash);
  expect(after.revision).toBe(before.revision);
});

test("unsupported Generate source version fails safely and leaves the composition intact", async ({
  page,
}) => {
  await waitForStudio(page);
  await openGenerate(page);
  await page.getByRole("button", { name: "Publish background layer" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 120_000 });
  await saveStudio(page);
  const project = (await readNewestProject(page))!;
  const layer = (project.project.layers as Array<Record<string, unknown>>)[0];
  const layerId = String(layer.id);
  await breakSourceVersions(page, "generate");

  await selectLayer(page, layerId);
  await page.getByTestId("inspector-edit-generate").click();
  await expect(page.getByTestId("generate-editor")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/Unsupported Generate source state/, {
    timeout: 15_000,
  });
  await page.getByTestId("generate-editor").getByRole("button", { name: "Back to canvas" }).click();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await expect(page.locator(`.canvas-layer[data-layer-id="${layerId}"]`)).toBeVisible();
});
