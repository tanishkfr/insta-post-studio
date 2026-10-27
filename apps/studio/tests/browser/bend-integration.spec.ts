import { expect, test } from "./studio-test";
import type { Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addBendMotionEcho,
  addBendSignalField,
  bendFrame,
  chooseFormat,
  layerRowOrder,
  openBend,
  openVector,
  publishBend,
  publishVector,
  readBendLayer,
  readBendSourceState,
  readSourceStateById,
  saveStudio,
  selectLayer,
  vectorFrame,
  waitForBendReady,
  waitForStudio,
} from "./studio-helpers";

const evidence = (name: string) => {
  const dir = resolve(process.cwd(), "../../docs/evidence/phase-4");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, name);
};

async function captureDownload(
  page: Page,
  action: () => Promise<void>,
): Promise<{ filename: string; bytes: Buffer }> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    action(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("The download did not produce a local file.");
  return { filename: download.suggestedFilename(), bytes: readFileSync(path) };
}

test.describe("BEND in Studio", () => {
  test("publishes a playable video layer and reopens the same editable timeline", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await chooseFormat(page, "instagram-square");
    await openBend(page);
    const frame = bendFrame(page);
    await addBendSignalField(frame);
    await frame.getByLabel("Duration value").first().fill("2");
    await addBendMotionEcho(frame);
    await publishBend(page);

    const layerElement = page
      .locator('[data-testid="canvas-layer"][data-layer-kind="video"]')
      .first();
    await expect(layerElement).toBeVisible({ timeout: 30_000 });
    const layerId = (await layerElement.getAttribute("data-layer-id"))!;
    expect(layerId).toBeTruthy();

    const layer = await readBendLayer(page, layerId);
    expect(layer).toMatchObject({
      kind: "video",
      sourceTool: "bend",
    });
    expect(layer!.poster?.mimeType).toBe("image/png");
    expect(layer!.poster?.width).toBe(1080);
    expect(layer!.poster?.height).toBe(1080);
    expect(layer!.rendered?.kind).toBe("video");
    expect(layer!.rendered?.width).toBe(720);
    expect(layer!.temporal).toMatchObject({
      kind: "video",
      frameRate: 30,
      preview: true,
      audio: "muted",
    });
    expect(layer!.temporal.durationSeconds).toBeGreaterThan(1);

    const source = await readBendSourceState(page);
    expect(source).toMatchObject({
      tool: "bend",
      schemaVersion: "1.0.0",
      aspectPreset: "1:1",
      isPreview: true,
    });
    expect(source!.package.format).toBe("bendpkg");
    expect(source!.package.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(source!.sourceRevision).toBeTruthy();
    expect(source!.host.mode).toBe("new");

    // Inspect the actual persisted artifacts, not only the host metadata.
    const artifacts = await page.evaluate(async ({ sourceState, videoAssetId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("studio-assets", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const getAsset = (id: string) =>
        new Promise<Record<string, any>>((resolve, reject) => {
          const transaction = database.transaction("assets", "readonly");
          const request = transaction.objectStore("assets").get(id);
          request.onsuccess = () => resolve(request.result as Record<string, any>);
          request.onerror = () => reject(request.error);
        });
      const readJson = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
      const packageRecord = await getAsset(sourceState.package.assetId);
      const videoRecord = await getAsset(videoAssetId);
      database.close();
      const packageBytes = new Uint8Array(packageRecord.bytes);
      const manifestLength = new DataView(packageBytes.buffer).getUint32(8, true);
      const manifest = readJson(packageBytes.slice(16, 16 + manifestLength));
      return {
        magic: new TextDecoder("ascii").decode(packageBytes.slice(0, 8)),
        manifest,
        videoRecord: {
          mimeType: videoRecord.mimeType,
          width: videoRecord.width,
          height: videoRecord.height,
        },
      };
    }, { sourceState: source!, videoAssetId: layer!.rendered.assetId });
    expect(artifacts.magic).toBe("BENDPKG1");
    expect(artifacts.manifest.format).toBe("bendpkg");
    expect(artifacts.manifest.complete).toBe(true);
    expect(artifacts.manifest.project.id).toBe(source!.package.projectId);
    expect(artifacts.videoRecord.mimeType).toMatch(/video\/(mp4|webm)/);

    // Real decodability and playback, not a synthetic blob claim.
    const playback = await page.evaluate(async (layerRecord) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("studio-assets", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<Record<string, any>>((resolve, reject) => {
        const transaction = database.transaction("assets", "readonly");
        const request = transaction.objectStore("assets").get(layerRecord.rendered.assetId);
        request.onsuccess = () => resolve(request.result as Record<string, any>);
        request.onerror = () => reject(request.error);
      });
      database.close();
      const url = URL.createObjectURL(new Blob([record.bytes], { type: record.mimeType }));
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("published video did not decode"));
      });
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const result = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        currentTime: video.currentTime,
        readyState: video.readyState,
      };
      video.pause();
      URL.revokeObjectURL(url);
      return result;
    }, layer!);
    expect(playback.width).toBe(720);
    expect(playback.height).toBe(720);
    expect(playback.currentTime).toBeGreaterThan(0.05);
    expect(playback.readyState).toBeGreaterThanOrEqual(2);

    // The static composition shows the cover; explicit play starts the video.
    await expect(layerElement.locator("img.raster-artwork")).toBeVisible();
    await layerElement.click();
    await page.getByTestId(`bend-video-toggle-${layerId}`).click();
    const playing = await layerElement.locator("video").evaluate((video) => ({
      currentTime: (video as HTMLVideoElement).currentTime,
      muted: (video as HTMLVideoElement).muted,
      paused: (video as HTMLVideoElement).paused,
    }));
    expect(playing.currentTime).toBeGreaterThan(0);
    expect(playing.muted).toBe(true);
    expect(playing.paused).toBe(false);

    // Change host presentation before editing; the update must retain it.
    await page.getByLabel(/^X$/).fill("40");
    await page.getByLabel(/^X$/).press("Enter");
    await page.getByLabel(/^Opacity/).fill("70");
    await page.getByLabel(/^Opacity/).press("Enter");
    await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
      timeout: 30_000,
    });
    const beforeEdit = await readBendLayer(page, layerId);
    expect(beforeEdit!.opacity).toBe(0.7);
    const beforeRevision = beforeEdit!.sourceState.revision;

    await page.reload();
    await waitForStudio(page);
    await expect(
      page.locator(`[data-testid="canvas-layer"][data-layer-id="${layerId}"]`),
    ).toBeVisible();
    await selectLayer(page, layerId);
    await page.getByTestId("inspector-edit-layer").click();
    await waitForBendReady(page);
    const editFrame = bendFrame(page);
    await expect(
      editFrame.getByRole("heading", { name: /BEND editor:/ }),
    ).toBeVisible();
    await expect(editFrame.getByText("Signal Field", { exact: false }).first()).toBeVisible();
    await editFrame.getByRole("tab", { name: /Effects/ }).click();
    await expect(editFrame.locator(".temporal-stack-row").first()).toBeVisible();

    await publishBend(page);
    const afterEdit = await readBendLayer(page, layerId);
    expect(afterEdit!.id).toBe(layerId);
    expect(afterEdit!.transform).toEqual(beforeEdit!.transform);
    expect(afterEdit!.opacity).toBe(0.7);
    expect(afterEdit!.sourceState.revision).toBeGreaterThan(beforeRevision);
    expect(
      await page.locator(`[data-testid="canvas-layer"][data-layer-id="${layerId}"]`).count(),
    ).toBe(1);

    await page.reload();
    await waitForStudio(page);
    await selectLayer(page, layerId);
    await page.getByTestId("inspector-edit-layer").click();
    await waitForBendReady(page);
    await bendFrame(page).getByRole("tab", { name: /Effects/ }).click();
    await expect(bendFrame(page).locator(".temporal-stack-row").first()).toBeVisible();
  });
});

  test("imports real Studio artwork as a BEND clip and publishes a derivative layer", async ({
    page,
  }) => {
    await waitForStudio(page);
    await chooseFormat(page, "instagram-square");
    await page.getByTestId("tool-vector").click();
    await page
      .getByRole("button", { name: /Add to composition|Update layer/ })
      .waitFor({ timeout: 30_000 });
    const vectorFrame = page.frameLocator('iframe[title="Vector editor"]');
    await vectorFrame
      .getByRole("button", { name: "Randomise shape" })
      .waitFor({ timeout: 30_000 });
    await vectorFrame.getByRole("button", { name: "Randomise shape" }).click();
    await page.getByRole("button", { name: /Add to composition|Update layer/ }).click();
    await page.getByTestId("artboard").waitFor({ timeout: 60_000 });
    await expect(page.getByTestId("save-state")).toContainText("Saved locally");

    const vector = page
      .locator('[data-testid="canvas-layer"][data-layer-kind="vector"]')
      .first();
    const vectorId = (await vector.getAttribute("data-layer-id"))!;
    const vectorBefore = await readBendLayer(page, vectorId);
    await vector.click();
    await page.getByRole("button", { name: "Continue in…" }).click();
    await page.getByTestId("animate-in-bend").click();
    const dialog = page.getByTestId("animate-in-bend-dialog");
    await expect(dialog).toBeVisible();
    await page.getByLabel("Handoff clip duration seconds").fill("1.5");
    await page.getByTestId("start-bend-handoff").click();
    await waitForBendReady(page);

    const bend = bendFrame(page);
    await expect(bend.locator(".timeline-clip").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_000);
    const imported = await page
      .frames()
      .find((candidate) => candidate.url().includes("/tools/bend/"))!
      .evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("bend-local");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const projects = await new Promise<Array<Record<string, any>>>((resolve, reject) => {
          const transaction = database.transaction("projects", "readonly");
          const request = transaction.objectStore("projects").getAll();
          request.onsuccess = () => resolve(request.result as Array<Record<string, any>>);
          request.onerror = () => reject(request.error);
        });
        database.close();
        const project = projects[0]?.project;
        return {
          layers: project?.layers?.length ?? 0,
          assets: Object.keys(project?.assets ?? {}).length,
          videoLayers: (project?.layers ?? []).filter(
            (layer: Record<string, any>) => layer.kind === "video",
          ).length,
        };
      });
    expect(imported.videoLayers).toBe(1);
    expect(imported.assets).toBe(1);

    await addBendMotionEcho(bend);
    await publishBend(page);

    await expect(
      page.locator('[data-testid="canvas-layer"][data-layer-kind="video"]'),
    ).toHaveCount(1);
    const derivative = page
      .locator('[data-testid="canvas-layer"][data-layer-kind="video"]')
      .first();
    const derivativeId = (await derivative.getAttribute("data-layer-id"))!;
    const videoLayer = await readBendLayer(page, derivativeId);
    expect(videoLayer!.provenance?.sourceLayerId).toBe(vectorId);
    expect(videoLayer!.temporal?.durationSeconds).toBeGreaterThan(1);

    const vectorAfter = await readBendLayer(page, vectorId);
    expect(vectorAfter!.sourceState.revision).toBe(vectorBefore!.sourceState.revision);
    expect(vectorAfter!.sourceState.contentHash).toBe(vectorBefore!.sourceState.contentHash);
    expect(vectorAfter!.rendered).toEqual(vectorBefore!.rendered);

    const source = await readBendSourceState(page);
    expect(source!.host.mode).toBe("static-handoff");
    expect(source!.host.sourceLayerIds).toContain(vectorId);
    expect(source!.package.media.length).toBe(1);
    expect(source!.package.media[0].mimeType).toMatch(/video\/(mp4|webm)/);

  });

  test("publishes source audio and packaged media honestly", async ({ page }) => {
    test.slow();
    await waitForStudio(page);
    await chooseFormat(page, "instagram-square");
    await openBend(page);
    const frame = bendFrame(page);
    await frame
      .locator('input[aria-label="Add local video"]')
      .setInputFiles("../../tools/bend/tests/fixtures/test-pattern-audio.mp4");
    await expect(frame.locator(".sequence-clip").first()).toBeVisible({
      timeout: 60_000,
    });
    await frame
      .locator('input[aria-label="Add local soundtrack"]')
      .setInputFiles("../../tools/bend/tests/fixtures/music-bed-4s.mp3");
    await page.waitForTimeout(1_500);
    await publishBend(page);

    const layerElement = page
      .locator('[data-testid="canvas-layer"][data-layer-kind="video"]')
      .first();
    await expect(layerElement).toBeVisible();
    const layerId = (await layerElement.getAttribute("data-layer-id"))!;
    const layer = await readBendLayer(page, layerId);
    expect(layer!.temporal.audioPresent).toBe(true);
    expect(layer!.temporal.audio).toBe("muted");

    const source = await readBendSourceState(page);
    expect(source!.audio.present).toBe(true);
    expect(source!.video.container).toBeDefined();
    expect(source!.package.media.length).toBeGreaterThanOrEqual(2);
    const mimeTypes = source!.package.media.map((entry: { mimeType: string }) => entry.mimeType);
    expect(mimeTypes.some((mime: string) => mime.startsWith("video/"))).toBe(true);
    expect(mimeTypes.some((mime: string) => mime.startsWith("audio/"))).toBe(true);

    await layerElement.click();
    const mute = page.locator(".bend-video-mute");
    await expect(mute).toHaveText("Sound off");
    await mute.click();
    await expect(mute).toHaveText("Sound on");
    await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
      timeout: 20_000,
    });
    const updated = await readBendLayer(page, layerId);
    expect(updated!.temporal.audio).toBe("source");

    const playback = await page.evaluate(async (layerRecord) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("studio-assets", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<Record<string, any>>((resolve, reject) => {
        const transaction = database.transaction("assets", "readonly");
        const request = transaction.objectStore("assets").get(layerRecord.rendered.assetId);
        request.onsuccess = () => resolve(request.result as Record<string, any>);
        request.onerror = () => reject(request.error);
      });
      database.close();
      const url = URL.createObjectURL(new Blob([record.bytes], { type: record.mimeType }));
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("audio export did not decode"));
      });
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 600));
      const result = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        currentTime: video.currentTime,
      };
      video.pause();
      URL.revokeObjectURL(url);
      return result;
    }, layer!);
    expect(playback.currentTime).toBeGreaterThan(0);
    expect(playback.duration).toBeGreaterThan(1.5);
  });

  test("cancel, corrupt source and stale revisions preserve the previous committed layer", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await chooseFormat(page, "instagram-square");
    await openBend(page);
    let frame = bendFrame(page);
    await frame
      .locator('input[aria-label="Add local video"]')
      .setInputFiles("../../tools/bend/tests/fixtures/test-pattern-audio.mp4");
    await expect(frame.locator(".sequence-clip").first()).toBeVisible({ timeout: 60_000 });
    await publishBend(page);
    const layerElement = page
      .locator('[data-testid="canvas-layer"][data-layer-kind="video"]')
      .first();
    const layerId = (await layerElement.getAttribute("data-layer-id"))!;
    const committed = await readBendLayer(page, layerId);
    const committedSource = await readBendSourceState(page);

    // Cancel an in-flight publish. The prior revision and assets stay intact.
    await page.reload();
    await waitForStudio(page);
    await selectLayer(page, layerId);
    await page.getByTestId("inspector-edit-layer").click();
    await waitForBendReady(page);
    await page.getByRole("button", { name: /Update video layer/ }).click();
    await expect(page.getByTestId("cancel-publish")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("cancel-publish").click();
    await expect(page.locator(".publish-error")).toContainText(/cancel/i, {
      timeout: 30_000,
    });
    const afterCancel = await readBendLayer(page, layerId);
    expect(afterCancel!.sourceState.revision).toBe(committed!.sourceState.revision);
    expect(afterCancel!.rendered.assetId).toBe(committed!.rendered.assetId);

    page.once("dialog", dialog => dialog.accept());
    await page.getByTestId("tool-canvas").click();
    await expect(page.getByTestId("artboard")).toBeVisible();

    // Corrupt only the editable package. Reopening must fail before the editor
    // replaces anything; the committed video/poster/source stay untouched.
    await page.evaluate(async (sourceState) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("studio-assets", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<Record<string, any>>((resolve, reject) => {
        const transaction = database.transaction("assets", "readonly");
        const request = transaction.objectStore("assets").get(sourceState.package.assetId);
        request.onsuccess = () => resolve(request.result as Record<string, any>);
        request.onerror = () => reject(request.error);
      });
      const bytes = new Uint8Array(record.bytes);
      bytes[0] = bytes[0] ^ 0xff;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("assets", "readwrite");
        transaction.objectStore("assets").put({ ...record, bytes });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, committedSource!);
    await selectLayer(page, layerId);
    await page.getByTestId("inspector-edit-layer").click();
    await expect(page.getByRole("alert")).toContainText(/BEND source is unavailable/i, {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Back to canvas" }).click();
    const afterCorrupt = await readBendLayer(page, layerId);
    expect(afterCorrupt!.rendered.assetId).toBe(committed!.rendered.assetId);
    expect(afterCorrupt!.poster.assetId).toBe(committed!.poster.assetId);
  });

  test("rejects a stale committed revision instead of overwriting newer artwork", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await chooseFormat(page, "instagram-square");
    await openBend(page);
    const frame = bendFrame(page);
    await frame
      .locator('input[aria-label="Add local video"]')
      .setInputFiles("../../tools/bend/tests/fixtures/test-pattern-audio.mp4");
    await expect(frame.locator(".sequence-clip").first()).toBeVisible({ timeout: 60_000 });
    await publishBend(page);
    const layerElement = page
      .locator('[data-testid="canvas-layer"][data-layer-kind="video"]')
      .first();
    const layerId = (await layerElement.getAttribute("data-layer-id"))!;
    const committed = await readBendLayer(page, layerId);

    await page.reload();
    await waitForStudio(page);
    await selectLayer(page, layerId);
    await page.getByTestId("inspector-edit-layer").click();
    await waitForBendReady(page);

    // Simulate a newer commit arriving from another Studio tab while this edit
    // session is open. The host must compare the durable revision, not only its
    // own in-memory copy.
    await page.evaluate(async (id) => {
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
      records.sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)));
      const record = records[0];
      const layer = record.project.layers.find((candidate: Record<string, any>) => candidate.id === id);
      layer.sourceState.revision = 99;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("projects", "readwrite");
        transaction.objectStore("projects").put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, layerId);

    await page.getByRole("button", { name: /Update video layer/ }).click();
    await expect(page.locator(".publish-error")).toContainText(/another Studio tab|updated elsewhere/i, {
      timeout: 240_000,
    });
    const after = await readBendLayer(page, layerId);
    expect(after!.rendered.assetId).toBe(committed!.rendered.assetId);
    expect(after!.poster.assetId).toBe(committed!.poster.assetId);
    expect(after!.sourceState.revision).toBe(99);
  });

  test("requires an explicit fit decision when artboard and BEND aspect differ", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await chooseFormat(page, "instagram-square");
    await openBend(page);
    await addBendSignalField(bendFrame(page));
    await bendFrame(page).getByLabel("Duration value").first().fill("2");
    await publishBend(page);
    const layerElement = page
      .locator('[data-testid="canvas-layer"][data-layer-kind="video"]')
      .first();
    const layerId = (await layerElement.getAttribute("data-layer-id"))!;

    await chooseFormat(page, "instagram-4-5");
    await expect(page.getByTestId("save-state")).toContainText("Saved locally");
    await selectLayer(page, layerId);
    await page.getByTestId("inspector-edit-layer").click();
    await expect(page.getByRole("dialog", { name: "BEND format decision" })).toBeVisible();
    await page.getByTestId("bend-fit-inside").click();
    await waitForBendReady(page);
    await expect(bendFrame(page).getByText("Signal Field", { exact: false }).first()).toBeVisible();

    await publishBend(page);
    const after = await readBendLayer(page, layerId);
    expect(after!.id).toBe(layerId);
    expect(after!.transform.width).toBe(1080);
    expect(after!.transform.height).toBe(1080);
    const source = await readSourceStateById(page, after!.sourceState.id);
    expect(source!.aspectPreset).toBe("1:1");
    expect(source!.host.fitDecision).toBe("fit");
  });

test("mixed static and BEND layers reorder, persist and export native video/package", async ({
  page,
}) => {
  test.slow();
  await waitForStudio(page);
  await chooseFormat(page, "instagram-square");

  await openVector(page);
  await vectorFrame(page).getByRole("button", { name: "Randomise shape" }).click();
  await publishVector(page);
  const staticLayer = page
    .locator('[data-testid="canvas-layer"][data-layer-kind="vector"]')
    .first();
  const staticId = (await staticLayer.getAttribute("data-layer-id"))!;
  expect(staticId).toBeTruthy();

  await openBend(page);
  await addBendSignalField(bendFrame(page));
  await bendFrame(page).getByLabel("Duration value").first().fill("1.5");
  await publishBend(page);

  const videoLayer = page
    .locator('[data-testid="canvas-layer"][data-layer-kind="video"]')
    .first();
  const videoId = (await videoLayer.getAttribute("data-layer-id"))!;
  expect(videoId).not.toBe(staticId);
  await expect(page.locator(".canvas-layer")).toHaveCount(2);

  // BEND is topmost after publishing; move it below the static layer.
  expect(await layerRowOrder(page)).toEqual([videoId, staticId]);
  await selectLayer(page, videoId);
  await page.getByRole("button", { name: /Move layer .* down/ }).click();
  await expect.poll(() => layerRowOrder(page)).toEqual([staticId, videoId]);
  const canvasOrder = await page.locator(".canvas-layer").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-layer-id")),
  );
  expect(canvasOrder).toEqual([videoId, staticId]);
  await saveStudio(page);

  // The BEND inspector still exposes real native exports for the selected layer.
  await expect(page.getByTestId("bend-layer-details")).toBeVisible();
  await expect(page.getByTestId("bend-download-video")).toBeEnabled();
  await expect(page.getByTestId("bend-download-package")).toBeEnabled({ timeout: 30_000 });
  const videoDownload = await captureDownload(page, () =>
    page.getByTestId("bend-download-video").click(),
  );
  expect(videoDownload.filename).toMatch(/\.(mp4|webm)$/);
  expect(videoDownload.bytes.length).toBeGreaterThan(1_000);
  const packageDownload = await captureDownload(page, () =>
    page.getByTestId("bend-download-package").click(),
  );
  expect(packageDownload.filename).toMatch(/\.bendpkg$/);
  expect(packageDownload.bytes.subarray(0, 8).toString("ascii")).toBe("BENDPKG1");

  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 20_000,
  });
  await expect(page.locator(".canvas-layer")).toHaveCount(2);
  expect(await layerRowOrder(page)).toEqual([staticId, videoId]);
  await expect(
    page.locator(
      `[data-testid="canvas-layer"][data-layer-id="${videoId}"] img.raster-artwork`,
    ),
  ).toBeVisible();
  await expect(
    page.locator(`[data-testid="canvas-layer"][data-layer-id="${staticId}"]`),
  ).toHaveAttribute("data-layer-kind", "vector");
  await selectLayer(page, videoId);
  await expect(page.getByTestId("bend-layer-details")).toBeVisible();
  await expect(page.getByTestId("inspector-edit-layer")).toHaveText("Edit in BEND");
});
