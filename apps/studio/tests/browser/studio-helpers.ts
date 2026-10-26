import { expect, type FrameLocator, type Page } from "@playwright/test";

export async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Project name" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 20_000,
  });
}

export async function chooseFormat(page: Page, formatId: string): Promise<void> {
  await page.getByRole("combobox", { name: "Project format" }).selectOption(formatId);
}

export async function openVector(page: Page): Promise<void> {
  await page.getByTestId("tool-vector").click();
  await waitForVectorReady(page);
}

export async function waitForVectorReady(page: Page): Promise<void> {
  await expect(page.getByTestId("vector-editor")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add to composition|Update layer/ }),
  ).toBeEnabled({ timeout: 25_000 });
  await expect(page.getByText("Opening preserved Vector editor…")).toHaveCount(0);
  await expect(
    page.frameLocator('iframe[title="Vector editor"]').getByRole("button", {
      name: "Randomise shape",
    }),
  ).toBeVisible();
}

export function vectorFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Vector editor"]');
}

export async function setVectorSeed(frame: FrameLocator, seed: number): Promise<void> {
  const input = frame.locator("#f_seed");
  await input.fill(String(seed));
  await input.press("Enter");
  await expect(input).toHaveValue(String(seed));
}

export async function setVectorInk(frame: FrameLocator, color: string): Promise<void> {
  const input = frame.getByLabel("Line colour hex");
  await input.fill(color);
  await input.press("Enter");
  await expect(input).toHaveValue(color);
}

export async function publishVector(page: Page, name?: string): Promise<void> {
  const button = page.getByRole("button", {
    name: name ?? /Add to composition|Update layer/,
  });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 20_000,
  });
}

export async function saveStudio(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 15_000,
  });
}

export async function layerIds(page: Page): Promise<string[]> {
  return page.locator(".canvas-layer").evaluateAll((layers) =>
    layers.map((layer) => layer.getAttribute("data-layer-id") ?? ""),
  );
}

export async function layerRowOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-testid^='layer-row-']")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-layer-id") ?? ""),
    );
}

export async function selectLayer(page: Page, layerId: string): Promise<void> {
  await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
}

export async function openVectorForLayer(page: Page, layerId: string): Promise<void> {
  await selectLayer(page, layerId);
  await page.getByTestId("inspector-edit-vector").click();
  await waitForVectorReady(page);
}

export async function cancelVector(page: Page): Promise<void> {
  await page
    .getByTestId("vector-editor")
    .getByRole("button", { name: "Canvas" })
    .click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 15_000 });
}

export async function readNewestProject(page: Page): Promise<{
  id: string;
  revision: number;
  project: Record<string, unknown>;
} | null> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-projects");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<Record<string, unknown>>>(
      (resolve, reject) => {
        const transaction = database.transaction("projects", "readonly");
        const request = transaction.objectStore("projects").getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      },
    );
    database.close();
    records.sort((left, right) =>
      String(right.savedAt).localeCompare(String(left.savedAt)),
    );
    const newest = records[0];
    if (!newest) return null;
    return {
      id: String(newest.id),
      revision: Number(newest.revision),
      project: newest.project as Record<string, unknown>,
    };
  });
}

export async function readSourceStateRecords(page: Page): Promise<
  Array<{
    id: string;
    tool: string;
    toolStateVersion: string;
    revision: number;
    contentHash: string;
    byteLength: number;
    content: string;
  }>
> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-assets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<Record<string, unknown>>>(
      (resolve, reject) => {
        const transaction = database.transaction("source-states", "readonly");
        const request = transaction.objectStore("source-states").getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      },
    );
    database.close();
    return records.map((record) => ({
      id: String(record.id),
      tool: String(record.tool),
      toolStateVersion: String(record.toolStateVersion),
      revision: Number(record.revision),
      contentHash: String(record.contentHash),
      byteLength: (record.bytes as Uint8Array).byteLength,
      content: new TextDecoder().decode(record.bytes as Uint8Array),
    }));
  });
}
