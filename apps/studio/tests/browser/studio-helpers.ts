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

export async function openImage(page: Page): Promise<void> {
  await page.getByTestId("tool-image").click();
  await waitForImageReady(page);
}

export async function waitForImageReady(page: Page): Promise<void> {
  await expect(page.getByTestId("image-editor")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add to composition|Update layer/ }),
  ).toBeEnabled({ timeout: 40_000 });
  await expect(page.getByText("Opening preserved Image editor…")).toHaveCount(0);
  await expect(
    page.frameLocator('iframe[title="Image editor"]').locator("#studioImageBridgeReady"),
  ).toHaveCount(1);
}

export function imageFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Image editor"]');
}

export async function openType(page: Page): Promise<void> {
  await page.getByTestId("tool-typography").click();
  await waitForTypeReady(page);
}

export async function waitForTypeReady(
  page: Page,
  mode: "library" | "custom" = "library",
): Promise<void> {
  await expect(page.getByTestId("type-editor")).toBeVisible();
  const buttonName = /Add to composition|Update layer/;
  await expect(page.getByRole("button", { name: buttonName })).toBeEnabled({
    timeout: 60_000,
  });
  const title =
    mode === "library" ? "Type Library editor" : "Custom Type editor";
  await expect(page.frameLocator(`iframe[title="${title}"]`).locator("body")).toBeVisible({
    timeout: 60_000,
  });
}

export function typeFrame(
  page: Page,
  mode: "library" | "custom" = "library",
): FrameLocator {
  return page.frameLocator(
    `iframe[title="${mode === "library" ? "Type Library editor" : "Custom Type editor"}"]`,
  );
}

export async function switchTypeMode(
  page: Page,
  mode: "library" | "custom",
): Promise<void> {
  await page.getByTestId(`type-mode-${mode}`).click();
  await waitForTypeReady(page, mode);
}

export async function openShapes(page: Page): Promise<void> {
  await page.getByTestId("tool-shapes").click();
  await waitForShapesReady(page);
}

export async function waitForShapesReady(page: Page): Promise<void> {
  await expect(page.getByTestId("shapes-editor")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Publish transparent Shapes|Update Shapes layer/ }),
  ).toBeEnabled({ timeout: 45_000 });
  await expect(page.getByText("Opening preserved Shapes editor…")).toHaveCount(0);
  const frame = page.frameLocator('iframe[title="Shapes editor"]');
  await expect(frame.locator("#studioShapesBridgeReady")).toHaveCount(1, {
    timeout: 45_000,
  });
  await expect(frame.getByRole("button", { name: "Add Cube" })).toBeVisible({
    timeout: 45_000,
  });
}

export function shapesFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Shapes editor"]');
}

export async function openGenerate(page: Page): Promise<void> {
  await page.getByTestId("tool-generate").click();
  await waitForGenerateReady(page);
}

export async function waitForGenerateReady(page: Page): Promise<void> {
  await expect(page.getByTestId("generate-editor")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Publish background layer|Update background layer/ }),
  ).toBeEnabled({ timeout: 45_000 });
  await expect(page.getByText("Opening preserved Generate editor…")).toHaveCount(0);
  const frame = page.frameLocator('iframe[title="Generate composition assistant"]');
  await expect(frame.locator("#studioGenerateBridgeReady")).toHaveCount(1, {
    timeout: 45_000,
  });
  await expect(frame.locator(".var").first()).toBeVisible({ timeout: 45_000 });
}

export function generateFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Generate composition assistant"]');
}

export async function openBend(page: Page): Promise<void> {
  await page.getByTestId("tool-bend").click();
  await waitForBendReady(page);
}

export async function waitForBendReady(page: Page): Promise<void> {
  await expect(page.getByTestId("bend-editor")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Publish BEND video|Update BEND layer|Publish motion derivative/,
    }),
  ).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByText("Opening preserved BEND editor…")).toHaveCount(0);
  const frame = page.frameLocator('iframe[title="BEND motion editor"]');
  await expect(frame.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({
    timeout: 90_000,
  });
  await expect(frame.getByRole("button", { name: "Add", exact: true })).toBeVisible({
    timeout: 45_000,
  });
}

export function bendFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="BEND motion editor"]');
}

export async function addBendSignalField(frame: FrameLocator): Promise<void> {
  await frame.getByRole("button", { name: "Add", exact: true }).click();
  await frame.getByRole("menuitem", { name: /Signal Field/ }).click();
  await expect(
    frame.getByRole("heading", { name: "Signal Field controls", exact: true }),
  ).toBeVisible({ timeout: 45_000 });
}

export async function addBendMotionEcho(frame: FrameLocator): Promise<void> {
  await frame.getByRole("tab", { name: /Effects/ }).click();
  const button = frame.getByRole("button", { name: /Motion Echo/ }).first();
  await expect(button).toBeVisible({ timeout: 20_000 });
  await button.click();
}

export async function publishBend(page: Page, timeout = 240_000): Promise<void> {
  const button = page.getByRole("button", {
    name: /Publish BEND video|Update BEND layer|Publish motion derivative/,
  });
  await expect(button).toBeEnabled({ timeout: 90_000 });
  await button.click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 90_000,
  });
}

export async function readBendLayer(
  page: Page,
  layerId: string,
): Promise<Record<string, any> | null> {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-projects");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<Record<string, any>>>((resolve, reject) => {
      const transaction = database.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, any>>);
      request.onerror = () => reject(request.error);
    });
    database.close();
    records.sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)));
    const layer = (records[0]?.project?.layers ?? []).find(
      (candidate: Record<string, any>) => candidate.id === id,
    );
    return layer ?? null;
  }, layerId);
}

export async function readBendSourceState(page: Page): Promise<Record<string, any> | null> {
  const records = await readSourceStateRecords(page);
  const bend = records.find((record) => record.tool === "bend");
  return bend ? JSON.parse(bend.content) : null;
}

export async function readSourceStateById(
  page: Page,
  sourceStateId: string,
): Promise<Record<string, any> | null> {
  const records = await readSourceStateRecords(page);
  const record = records.find((candidate) => candidate.id === sourceStateId);
  return record ? JSON.parse(record.content) : null;
}


export async function setRange(
  frame: FrameLocator,
  selector: string,
  value: number | string,
): Promise<void> {
  await frame.locator(selector).evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

export async function publishActiveTool(page: Page): Promise<void> {
  const button = page.getByRole("button", {
    name: /Add to composition|Update layer/,
  });
  await expect(button).toBeEnabled({ timeout: 60_000 });
  await button.click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });
}

export async function readAssetRecords(page: Page): Promise<
  Array<{
    id: string;
    kind: string;
    name: string;
    mimeType: string;
    width?: number;
    height?: number;
    byteLength: number;
    contentHash: string;
    bytesBase64: string;
  }>
> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studio-assets", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!database.objectStoreNames.contains("assets")) {
      database.close();
      return [];
    }
    const records = await new Promise<Array<Record<string, unknown>>>(
      (resolve, reject) => {
        const transaction = database.transaction("assets", "readonly");
        const request = transaction.objectStore("assets").getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      },
    );
    database.close();
    return records.map((record) => {
      const bytes = record.bytes as Uint8Array;
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(index, index + 0x8000)),
        );
      }
      return {
        id: String(record.id),
        kind: String(record.kind),
        name: String(record.name),
        mimeType: String(record.mimeType),
        width: record.width as number | undefined,
        height: record.height as number | undefined,
        byteLength: bytes.byteLength,
        contentHash: String(record.contentHash),
        bytesBase64: btoa(binary),
      };
    });
  });
}

export async function layerByName(
  page: Page,
  name: string,
): Promise<{ id: string; kind: string; sourceTool: string } | null> {
  const project = await readNewestProject(page);
  if (!project) return null;
  const layers = (project.project.layers ?? []) as Array<Record<string, unknown>>;
  const found = layers.find((layer) => layer.name === name);
  return found
    ? {
        id: String(found.id),
        kind: String(found.kind),
        sourceTool: String(found.sourceTool),
      }
    : null;
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
