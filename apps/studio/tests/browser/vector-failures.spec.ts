import { expect, test } from "./studio-test";
import {
  openVector,
  openVectorForLayer,
  publishVector,
  readNewestProject,
  saveStudio,
  selectLayer,
  setVectorSeed,
  vectorFrame,
  waitForStudio,
  cancelVector,
} from "./studio-helpers";

const evidence = (name: string) =>
  test.info().outputPath(name);

test("storage failure is reported and the last durable project survives reload", async ({
  page,
}) => {
  await waitForStudio(page);
  await openVector(page);
  await setVectorSeed(vectorFrame(page), 4321);
  await publishVector(page);
  await saveStudio(page);
  const originalProject = await readNewestProject(page);
  const originalLayerId = (await page.locator(".canvas-layer").first().getAttribute(
    "data-layer-id",
  ))!;

  await page.evaluate(`
    (() => {
      const originalPut = IDBObjectStore.prototype.put;
      window.__studioRestorePut = () => { IDBObjectStore.prototype.put = originalPut; };
      IDBObjectStore.prototype.put = function () {
        throw new DOMException("Simulated quota failure", "QuotaExceededError");
      };
    })()
  `);

  const nameInput = page.getByRole("textbox", { name: "Project name" });
  await nameInput.fill("Name that must not persist");
  await nameInput.blur();
  await expect(page.getByText("Project save failed")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("save-state")).toContainText("Save failed");
  await page.screenshot({ path: evidence("08-storage-failure.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Untitled Project",
  );
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  expect(
    (await page.locator(".canvas-layer").first().getAttribute("data-layer-id")),
  ).toBe(originalLayerId);
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  const reloaded = await readNewestProject(page);
  expect(reloaded!.revision).toBe(originalProject!.revision);
  expect((reloaded!.project as { name: string }).name).toBe("Untitled Project");
});

test("unsupported Vector source version reports an error without deleting the layer", async ({
  page,
}) => {
  await waitForStudio(page);
  await openVector(page);
  await setVectorSeed(vectorFrame(page), 7654);
  await publishVector(page);
  await saveStudio(page);
  const layerId = (await page.locator(".canvas-layer").first().getAttribute(
    "data-layer-id",
  ))!;
  await selectLayer(page, layerId);

  await page.evaluate(`
    (async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("studio-assets");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("source-states", "readwrite");
        const store = transaction.objectStore("source-states");
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          for (const record of getAll.result) {
            record.toolStateVersion = "9.9.9";
            store.put(record);
          }
        };
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      });
    })()
  `);

  await page.getByTestId("inspector-edit-vector").click();
  await expect(page.getByTestId("vector-editor")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/Unsupported Vector source state/, {
    timeout: 10_000,
  });
  await page.screenshot({ path: evidence("09-unsupported-state.png") });

  await page
    .getByTestId("vector-editor")
    .getByRole("button", { name: "Back to canvas" })
    .click();
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await expect(
    page.locator(`.canvas-layer[data-layer-id="${layerId}"]`),
  ).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
});

test("a missing rendered blob is reported and source re-entry still works", async ({
  page,
}) => {
  await waitForStudio(page);
  await openVector(page);
  await setVectorSeed(vectorFrame(page), 2468);
  await publishVector(page);
  await saveStudio(page);
  const record = await readNewestProject(page);
  const project = record!.project as {
    layers: Array<{ id: string; rendered: { assetId: string } }>;
  };
  const layer = project.layers[0];
  await page.evaluate(`
    (async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("studio-assets");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("assets", "readwrite");
        transaction.objectStore("assets").delete("${layer.rendered.assetId}");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      });
    })()
  `);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await expect(page.getByText("Artwork unavailable")).toBeVisible();
  await selectLayer(page, layer.id);
  await expect(page.getByText("rev 1")).toBeVisible();
  await openVectorForLayer(page, layer.id);
  await expect(vectorFrame(page).locator("#f_seed")).toHaveValue("2468");
  await cancelVector(page);
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
});
