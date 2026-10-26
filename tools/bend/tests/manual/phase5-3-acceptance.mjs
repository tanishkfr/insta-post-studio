import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const port = 4181;
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDirectory = path.resolve("output/evidence/phase5-3");
const fixtureDirectory = path.join(evidenceDirectory, "fixtures");
const browserExecutable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const fixtures = {
  mp4: path.join(fixtureDirectory, "standard-h264-aac.mp4"),
  webm: path.join(fixtureDirectory, "webm-vp9-opus.webm"),
  silent: path.join(fixtureDirectory, "video-only.mp4"),
};

const evidence = {
  browser: "Google Chrome system executable",
  checks: {},
  capabilities: null,
  metrics: {},
  artifacts: [],
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
};

let server;
let browser;

function check(name, condition, detail = undefined) {
  evidence.checks[name] = Boolean(condition);
  if (!condition) throw new Error(`${name} failed${detail ? `: ${detail}` : ""}`);
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {
      // Keep waiting for Vite to bind.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not become ready for the Phase 5.3 browser check.");
}

function watchPage(page, label) {
  void page.addInitScript(() => {
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      console.error("BEND_UNHANDLED_REJECTION", reason?.name ?? "unknown", reason?.message ?? String(reason), reason?.stack ?? "<no stack>");
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(`${label}: ${message.text()}`);
    if (message.type() === "warning") evidence.consoleWarnings.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(`${label}: ${(error.stack && error.stack.trim()) || `${error.name}: ${error.message}`}`));
}

async function openEditor(page, route = "/") {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ state: "visible", timeout: 30_000 });
}

async function waitForCanvas(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".canvas-frame canvas");
    return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0 && canvas.getAttribute("aria-busy") === "false";
  }, null, { timeout: 30_000 });
}

async function waitForSaved(page) {
  await page.waitForFunction(() => document.querySelector(".save-status")?.textContent === "Saved locally", null, { timeout: 30_000 });
}

async function createNewProject(page) {
  await page.getByLabel("New project").click();
  await page.getByRole("dialog", { name: "Start a new project?" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Start new project" }).click();
  await page.getByRole("dialog", { name: "Start a new project?" }).waitFor({ state: "detached" });
}

async function importFixture(page, fixturePath) {
  await page.locator('input[aria-label="Add local video"]').setInputFiles(fixturePath);
  await page.getByText("Imported footage", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  await waitForCanvas(page);
}

async function setNumber(page, label, value) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press("Tab");
}

async function canvasHash(page) {
  const dataUrl = await page.locator(".canvas-frame canvas").evaluate((element) => (element instanceof HTMLCanvasElement ? element.toDataURL("image/png") : ""));
  return createHash("sha256").update(dataUrl).digest("hex");
}

async function scrubTo(page, fraction) {
  const scrubber = page.getByLabel("Timeline scrubber");
  const box = await scrubber.boundingBox();
  if (!box) throw new Error("Timeline scrubber is not measurable.");
  await page.mouse.click(box.x + Math.max(0, Math.min(1, fraction)) * box.width, box.y + box.height / 2);
  await page.waitForTimeout(250);
}

async function readVideoResult(page) {
  const video = page.locator(".export-result video");
  const source = await video.getAttribute("src");
  if (!source) throw new Error("Export result did not expose a blob URL.");
  const metadata = await video.evaluate((element) => {
    const value = element;
    return { duration: value.duration, width: value.videoWidth, height: value.videoHeight };
  });
  const result = await page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), mimeType: blob.type };
  }, source);
  return { metadata, ...result };
}

async function readStillResult(page) {
  const image = page.locator(".export-result img");
  const source = await image.getAttribute("src");
  if (!source) throw new Error("PNG result did not expose a blob URL.");
  const bytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), source);
  return { bytes };
}

async function exportVideo(page, outputPath, { cancelFirst = false } = {}) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("dialog", { name: "Export composition" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  if (cancelFirst) {
    const cancelButton = page.getByRole("button", { name: "Cancel export", exact: true });
    await cancelButton.waitFor({ state: "visible", timeout: 30_000 });
    await cancelButton.click();
    await page.getByText(/Export cancelled/, { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Retry export", exact: true }).click();
  }
  await page.getByText(/Export complete/, { exact: false }).waitFor({ state: "visible", timeout: 240_000 });
  const result = await readVideoResult(page);
  const actualOutputPath = result.mimeType.includes("webm") ? outputPath.replace(/\.mp4$/i, ".webm") : outputPath.replace(/\.webm$/i, ".mp4");
  await writeFile(actualOutputPath, Uint8Array.from(result.bytes));
  evidence.artifacts.push(path.relative(root, actualOutputPath));
  const audioStatus = await page.locator(".export-audio-status").textContent();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("dialog", { name: "Export composition" }).waitFor({ state: "detached" });
  return { ...result, audioStatus, outputPath: actualOutputPath };
}

async function exportStill(page, outputPath) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("dialog", { name: "Export composition" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Still frame/ }).click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await page.getByText(/Export complete/, { exact: false }).waitFor({ state: "visible", timeout: 120_000 });
  const result = await readStillResult(page);
  await writeFile(outputPath, Uint8Array.from(result.bytes));
  evidence.artifacts.push(path.relative(root, outputPath));
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("dialog", { name: "Export composition" }).waitFor({ state: "detached" });
  return result;
}

async function downloadPackage(page, outputPath) {
  await page.evaluate(() => {
    window.__bendDownloadHref = "";
    if (window.__bendDownloadHooked) return;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      window.__bendDownloadHref = this.href;
      originalClick.call(this);
    };
    window.__bendDownloadHooked = true;
  });
  await page.getByTitle("Download editable project").click();
  await page.waitForFunction(() => Boolean(window.__bendDownloadHref), null, { timeout: 30_000 });
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(window.__bendDownloadHref)).arrayBuffer())));
  await writeFile(outputPath, Uint8Array.from(bytes));
  evidence.artifacts.push(path.relative(root, outputPath));
  return outputPath;
}

async function deleteStoredAssetForCurrentProject(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("bend-local", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(["projects", "assets"], "readwrite");
      const projects = transaction.objectStore("projects").getAll();
      projects.onerror = () => reject(projects.error);
      projects.onsuccess = () => {
        const record = projects.result.find((candidate) => Object.keys(candidate.project.assets ?? {}).length > 0);
        const assetId = record ? Object.keys(record.project.assets)[0] : null;
        if (!assetId) {
          reject(new Error("No persisted video asset was found for the relink test."));
          return;
        }
        transaction.objectStore("assets").delete(assetId);
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function responsiveSnapshot(page) {
  const viewports = [
    { width: 1440, height: 980, name: "desktop" },
    { width: 1024, height: 900, name: "tablet-landscape" },
    { width: 768, height: 900, name: "tablet" },
  ];
  const results = {};
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(250);
    results[viewport.name] = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
      const transport = rect(".timeline-transport");
      const tools = rect(".timeline-tools");
      const range = rect("input.control-range");
      const value = rect("input.value-input");
      const overlap = transport && tools ? !(transport.right <= tools.left || tools.right <= transport.left || transport.bottom <= tools.top || tools.bottom <= transport.top) : null;
      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        timelineToolbarOverlap: overlap,
        rangeWidth: range?.width ?? 0,
        rangeValueOverlap: range && value ? !(range.right <= value.left || value.right <= range.left || range.bottom <= value.top || value.bottom <= range.top) : null,
      };
    });
    await page.screenshot({ path: path.join(evidenceDirectory, `responsive-${viewport.name}.png`), fullPage: true });
    evidence.artifacts.push(path.relative(root, path.join(evidenceDirectory, `responsive-${viewport.name}.png`)));
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  return results;
}

async function runMainMediaFlow() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
  const page = await context.newPage();
  watchPage(page, "main");
  const outputDirectory = path.join(evidenceDirectory, "exports");
  await mkdir(outputDirectory, { recursive: true });

  try {
    await openEditor(page);
    await createNewProject(page);
    await importFixture(page, fixtures.mp4);
    check("mp4Imported", await page.getByText("Imported footage", { exact: true }).count() > 0);
    check("mp4AudioDetected", await page.getByText("Source audio detected", { exact: false }).count() > 0);
    const initialHash = await canvasHash(page);
    await page.getByLabel("Play preview").click();
    await page.getByText("Playing", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(350);
    await page.getByLabel("Pause preview").click();
    await scrubTo(page, 0.55);
    const middleHash = await canvasHash(page);
    check("mp4PreviewChangesAcrossScrub", initialHash !== middleHash, `${initialHash} === ${middleHash}`);
    await page.screenshot({ path: path.join(evidenceDirectory, "mp4-preview-middle.png"), fullPage: true });
    evidence.artifacts.push("output/evidence/phase5-3/mp4-preview-middle.png");

    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await page.getByLabel("Auto-Key").click();
    await setNumber(page, "Scale value", 1.25);
    await setNumber(page, "Position X value", 80);
    await setNumber(page, "Position Y value", -40);
    await setNumber(page, "Rotation value", 12);
    await setNumber(page, "In value", 0.5);
    await setNumber(page, "Out value", 3.5);
    await page.getByLabel("Auto-Key").click();
    await page.getByRole("button", { name: "Set keyframe for Scale", exact: true }).click();
    await page.getByLabel("Timeline scrubber").press("End");
    await page.waitForTimeout(150);
    await setNumber(page, "Scale value", 1.05);

    await page.getByRole("tab", { name: "Effects", exact: true }).click();
    const wave = page.getByRole("button", { name: /Wave Displacement/ }).first();
    await wave.click();
    await setNumber(page, "Intensity value", 0.2);
    check("spatialEffectApplied", await page.getByText(/Distort · ON/, { exact: false }).count() > 0);

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Signal Field/ }).click();
    await page.getByRole("button", { name: "Select Imported footage", exact: true }).click();
    await page.getByRole("tab", { name: "Motion", exact: true }).click();
    check("keyframeApplied", await page.locator(".motion-track-item").count() > 0);
    const timelineDurationText = await page.locator(".timeline-duration").first().textContent();
    check("timelineTrimApplied", /0:03\.00/.test(timelineDurationText ?? ""), timelineDurationText ?? "<missing>");
    await waitForSaved(page);
    const projectName = await page.getByLabel("Project name").inputValue();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ state: "visible", timeout: 30_000 });
    await waitForCanvas(page);
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    check("transformSurvivesReload", (await page.getByLabel("Position X value", { exact: true }).inputValue()) === "80" && (await page.getByLabel("Rotation value", { exact: true }).inputValue()) === "12");
    await page.getByRole("tab", { name: "Effects", exact: true }).click();
    check("effectSurvivesReload", await page.getByText(/Distort · ON/, { exact: false }).count() > 0);
    await page.getByRole("tab", { name: "Motion", exact: true }).click();
    check("keyframeSurvivesReload", await page.locator(".motion-track-item").count() > 0);

    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await page.getByLabel("Auto-Key").click();
    await page.getByRole("button", { name: "Remove Imported footage", exact: true }).click();
    await page.getByRole("button", { name: "Select Imported footage", exact: true }).waitFor({ state: "detached", timeout: 10_000 });
    await page.getByLabel("Undo").click();
    await page.getByRole("button", { name: "Select Imported footage", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    check("deleteUndoRestoresMedia", await page.locator(".canvas-frame canvas").count() === 1);
    await page.getByLabel("Redo").click();
    await page.getByRole("button", { name: "Select Imported footage", exact: true }).waitFor({ state: "detached", timeout: 10_000 });
    await page.getByLabel("Undo").click();
    await page.getByRole("button", { name: "Select Imported footage", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await waitForSaved(page);

    const firstVideoExport = await exportVideo(page, path.join(outputDirectory, "mp4-edited-export.mp4"));
    check("mp4ExportAudioStatus", /Source audio included/.test(firstVideoExport.audioStatus ?? ""), firstVideoExport.audioStatus);
    check("mp4ExportHasBytes", firstVideoExport.bytes.length > 10_000);
    evidence.metrics.mp4Export = firstVideoExport.metadata;

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("dialog", { name: "Export composition" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close export dialog", exact: true }).click();
    await page.getByRole("dialog", { name: "Export composition" }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("button", { name: "Export video", exact: true }).click();
    await page.getByRole("button", { name: "Cancel export", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Cancel export", exact: true }).click();
    await page.getByText(/Export cancelled/, { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
    check("exportCancellationState", await page.getByRole("button", { name: "Retry export", exact: true }).count() === 1);
    await page.getByRole("button", { name: "Retry export", exact: true }).click();
    await page.getByText(/Export complete/, { exact: false }).waitFor({ state: "visible", timeout: 240_000 });
    const retried = await readVideoResult(page);
    const retryPath = retried.mimeType.includes("webm") ? path.join(outputDirectory, "mp4-edited-retry.webm") : path.join(outputDirectory, "mp4-edited-retry.mp4");
    await writeFile(retryPath, Uint8Array.from(retried.bytes));
    evidence.artifacts.push(path.relative(root, retryPath));
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await waitForSaved(page);
    const packagePath = path.join(evidenceDirectory, "edited-mixed-project.bendpkg");
    await downloadPackage(page, packagePath);

    await page.getByLabel("Open project library").click();
    await page.getByRole("dialog", { name: "Your projects" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Duplicate current", exact: true }).click();
    await page.getByRole("dialog", { name: "Your projects" }).waitFor({ state: "detached" });
    check("duplicateProjectSharesMedia", await page.getByText("Imported footage", { exact: true }).count() > 0);
    await page.getByLabel("Open project library").click();
    const originalEditedRow = page.locator(".project-library-item:not(.is-current)").filter({ hasText: "2L" }).first();
    await originalEditedRow.getByRole("button", { name: `Open ${projectName}`, exact: true }).click();
    await page.getByRole("dialog", { name: "Your projects" }).waitFor({ state: "detached" });
    check("switchProjectAfterEdit", await page.getByLabel("Project name").inputValue() === projectName);
    await page.getByLabel("Open project library").click();
    const currentEditedRow = page.locator(".project-library-item.is-current").filter({ hasText: "2L" });
    await currentEditedRow.getByRole("button", { name: `Delete ${projectName}`, exact: true }).click();
    await page.getByText("Delete the open project?", { exact: false }).waitFor({ state: "visible" });
    await page.locator(".project-library-confirm").getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText(`${projectName} copy`, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Close project library", exact: true }).click();
    await page.getByRole("dialog", { name: "Your projects" }).waitFor({ state: "detached" });
    check("deleteOriginalKeepsSharedMedia", await page.getByText("Imported footage", { exact: true }).count() > 0);

    const responsive = await responsiveSnapshot(page);
    evidence.metrics.responsive = responsive;
    check("responsiveNoHorizontalOverflow", Object.values(responsive).every((value) => value.scrollWidth <= value.clientWidth + 1));
    check("responsiveTimelineSeparated", Object.values(responsive).every((value) => value.timelineToolbarOverlap !== true));
    check("responsiveSliderUsable", responsive.desktop.rangeWidth >= 140 && responsive["tablet-landscape"].rangeWidth >= 100);
    return { packagePath, projectName };
  } finally {
    await context.close();
  }
}

async function runWebmFlow() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  watchPage(page, "webm");
  const outputPath = path.join(evidenceDirectory, "exports", "webm-input-export.webm");
  try {
    await openEditor(page);
    await importFixture(page, fixtures.webm);
    check("webmImported", await page.getByText("Imported footage", { exact: true }).count() > 0);
    const start = await canvasHash(page);
    await scrubTo(page, 0.7);
    check("webmPreviewChangesAcrossScrub", start !== await canvasHash(page));
    evidence.metrics.webmAudioLabel = await page.locator(".audio-capability").textContent();
    const result = await exportVideo(page, outputPath);
    check("webmExportHasBytes", result.bytes.length > 10_000);
    evidence.metrics.webmExport = { ...result.metadata, audioStatus: result.audioStatus };
  } finally {
    await context.close();
  }
}

async function runSilentAndRelinkFlow() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  watchPage(page, "silent-relink");
  const outputPath = path.join(evidenceDirectory, "exports", "video-only-export.mp4");
  try {
    await openEditor(page);
    await importFixture(page, fixtures.mp4);
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await setNumber(page, "Position X value", 80);
    await waitForSaved(page);
    await deleteStoredAssetForCurrentProject(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(/video source need relinking/, { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
    check("missingMediaBanner", await page.getByText("Missing media", { exact: true }).count() > 0);
    check("transformSurvivesMissingMedia", await page.getByLabel("Position X value", { exact: true }).inputValue() === "80");
    await page.getByRole("button", { name: "Relink source", exact: true }).click();
    await page.getByLabel("Choose replacement footage").setInputFiles(fixtures.silent);
    await page.locator(".missing-media-banner").waitFor({ state: "detached", timeout: 30_000 });
    const silentAudioLabel = await page.locator(".audio-capability").textContent();
    evidence.metrics.silentAudioLabel = silentAudioLabel;
    check("relinkRestoresMedia", await page.getByText(/video source need relinking/, { exact: false }).count() === 0);
    check("relinkPreservesTransform", await page.getByLabel("Position X value", { exact: true }).inputValue() === "80");
    const result = await exportVideo(page, outputPath);
    check("silentExportHasBytes", result.bytes.length > 10_000);
    check("silentExportDoesNotClaimAudio", !/Source audio included/.test(result.audioStatus ?? ""), result.audioStatus);
    evidence.metrics.silentExport = { ...result.metadata, audioStatus: result.audioStatus };
  } finally {
    await context.close();
  }
}

async function runPackageRoundTrip(packagePath) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  watchPage(page, "package");
  const outputDirectory = path.join(evidenceDirectory, "exports");
  const packageBytes = await readFile(packagePath);
  const corruptPath = path.join(evidenceDirectory, "corrupt-project.bendpkg");
  const corruptBytes = Uint8Array.from(packageBytes);
  corruptBytes[Math.max(16, corruptBytes.length - 1)] ^= 0xff;
  await writeFile(corruptPath, corruptBytes);
  evidence.artifacts.push("output/evidence/phase5-3/corrupt-project.bendpkg");
  try {
    await openEditor(page, "/studio");
    await page.getByLabel("Open project package").setInputFiles(packagePath);
    await page.getByRole("dialog", { name: /Open .*\?/ }).waitFor({ state: "visible", timeout: 30_000 });
    check("packagePreviewValidates", await page.getByText("BEND validated this package", { exact: false }).count() === 1);
    await page.getByRole("button", { name: "Open editable project", exact: true }).click();
    await page.getByText("Imported footage", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
    await waitForCanvas(page);
    check("freshContextRestoresMedia", await page.locator(".canvas-frame canvas").count() === 1);
    check("freshContextRestoresLayers", await page.locator(".timeline-layer-group").count() >= 2);
    await page.getByRole("button", { name: "Select Imported footage", exact: true }).click();
    await page.getByRole("tab", { name: "Effects", exact: true }).click();
    check("packageRestoresEffect", await page.getByText(/Distort · ON/, { exact: false }).count() > 0);
    await page.getByRole("tab", { name: "Motion", exact: true }).click();
    check("packageRestoresKeyframes", await page.locator(".motion-track-item").count() > 0);
    await waitForSaved(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Imported footage", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
    await waitForCanvas(page);
    check("packageSaveReload", await page.locator(".timeline-layer-group").count() >= 2);
    const videoResult = await exportVideo(page, path.join(outputDirectory, "package-roundtrip-export.mp4"));
    const stillResult = await exportStill(page, path.join(outputDirectory, "package-roundtrip-still.png"));
    check("packageVideoExportHasBytes", videoResult.bytes.length > 10_000);
    check("packageStillExportHasBytes", stillResult.bytes.length > 1_000);

    const projectName = await page.getByLabel("Project name").inputValue();
    await page.getByLabel("Open project package").setInputFiles(corruptPath);
    await page.getByText(/Editable package unavailable/, { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
    check("corruptPackageDoesNotReplaceProject", await page.getByLabel("Project name").inputValue() === projectName);
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(evidenceDirectory, { recursive: true });
  await mkdir(path.join(evidenceDirectory, "exports"), { recursive: true });
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "ignore", windowsHide: true });
  await waitForServer();
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ["--use-angle=swiftshader"] });
  const capabilityContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const capabilityPage = await capabilityContext.newPage();
  watchPage(capabilityPage, "capabilities");
  await capabilityPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  evidence.capabilities = await capabilityPage.evaluate(() => ({
    mediaRecorder: typeof MediaRecorder !== "undefined",
    recorderTypes: Object.fromEntries(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=avc1.42E01E"].map((type) => [type, typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)])),
    videoEncoder: "VideoEncoder" in window,
    audioEncoder: "AudioEncoder" in window,
    offscreenCanvas: "OffscreenCanvas" in window,
    canPlayMp4: document.createElement("video").canPlayType("video/mp4; codecs=\"avc1.4d401f, mp4a.40.2\""),
    canPlayWebm: document.createElement("video").canPlayType("video/webm; codecs=\"vp09.00.10.08,opus\""),
  }));
  await capabilityContext.close();

  const mainResult = await runMainMediaFlow();
  await runWebmFlow();
  await runSilentAndRelinkFlow();
  await runPackageRoundTrip(mainResult.packagePath);
  check("noConsoleErrors", evidence.consoleErrors.length === 0, evidence.consoleErrors.join(" | "));
  check("noConsoleWarnings", evidence.consoleWarnings.length === 0, evidence.consoleWarnings.join(" | "));
  check("noPageErrors", evidence.pageErrors.length === 0, evidence.pageErrors.join(" | "));
}

try {
  await main();
} catch (error) {
  evidence.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(evidenceDirectory, "verification.json"), JSON.stringify(evidence, null, 2), "utf8");
  if (browser) await browser.close().catch(() => undefined);
  if (server) server.kill();
  console.log(JSON.stringify(evidence, null, 2));
}
