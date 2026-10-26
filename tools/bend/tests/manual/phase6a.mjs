import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const port = 4173;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "ignore", windowsHide: true });

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(`${baseUrl}/integration`);
      if (response.ok) return;
    } catch {
      // Keep waiting for Vite to bind.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not become ready for the Phase 6A browser check.");
}

const evidence = { browser: "Google Chrome system executable", checks: {}, metrics: {}, artifacts: [], consoleErrors: [] };
let browser;
let context;
try {
  await mkdir("output/evidence/phase6a", { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader"] });
  context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => evidence.consoleErrors.push(error.message));

  await page.goto(`${baseUrl}/integration`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
  await page.getByRole("heading", { name: /Place BEND/ }).waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path: "output/evidence/phase6a/host-empty.png", fullPage: true });
  evidence.artifacts.push("host-empty.png");
  evidence.checks.hostRoute = await page.getByRole("heading", { name: /Place BEND/ }).isVisible();

  const addLayerStartedAt = Date.now();
  await page.getByRole("button", { name: "Add BEND layer" }).click();
  await page.getByText(/BEND \/ /).first().waitFor({ state: "visible", timeout: 120_000 });
  await page.locator(".host-video-layer").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => { const video = document.querySelector(".host-video-layer"); return video instanceof HTMLVideoElement && video.videoWidth > 0 && video.videoHeight > 0; }, null, { timeout: 30_000 });
  evidence.checks.videoHandoff = await page.locator(".host-video-layer").count() === 1;
  evidence.checks.videoMetadata = await page.locator(".host-video-layer").evaluate((element) => { const video = element; return { width: video.videoWidth, height: video.videoHeight, duration: video.duration }; });
  evidence.metrics.addLayerHandoffMs = Date.now() - addLayerStartedAt;
  await page.getByRole("combobox", { name: "Host canvas format" }).selectOption("1:1");
  evidence.checks.aspectSwitch = await page.getByText(/1:1 \/ 1080 × 1080/).isVisible();
  const setHostRange = async (label, value) => {
    await page.getByLabel(label).evaluate((element, nextValue) => {
      const input = element;
      input.value = String(nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForTimeout(150);
  };
  await setHostRange("X position", 120);
  await setHostRange("Y position", -80);
  await setHostRange("Scale", 1.25);
  await setHostRange("Opacity", 0.72);
  await page.getByLabel("Playback").selectOption("hold-last-frame");
  await page.getByRole("button", { name: "Raise BEND layer" }).click();
  await page.getByRole("button", { name: /Show still output/ }).click();
  evidence.checks.staticHandoff = await page.getByAltText("BEND current frame handoff").isVisible();
  const stillBytes = await page.getByAltText("BEND current frame handoff").evaluate(async (element) => Array.from(new Uint8Array(await (await fetch(element.src)).arrayBuffer())));
  await writeFile("output/evidence/phase6a/host-still.png", Uint8Array.from(stillBytes));
  evidence.metrics.stillBytes = stillBytes.length;
  evidence.artifacts.push("host-still.png");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
  evidence.checks.hostPersistence = await page.getByText(/BEND \/ /).first().isVisible();
  const hostPlacementBefore = await page.locator(".host-inspector").evaluate((element) => ({
    x: element.querySelector('input[aria-label="X position"]')?.value,
    y: element.querySelector('input[aria-label="Y position"]')?.value,
    scale: element.querySelector('input[aria-label="Scale"]')?.value,
    opacity: element.querySelector('input[aria-label="Opacity"]')?.value,
    playback: element.querySelector("#host-playback")?.value,
    stackingOrder: element.closest(".integration-board")?.querySelector(".host-layer-row")?.getAttribute("data-stacking-order"),
  }));
  await page.screenshot({ path: "output/evidence/phase6a/host-composition.png", fullPage: true });
  evidence.artifacts.push("host-composition.png");

  const sourceVersionBefore = await page.locator(".host-layer-row").first().getAttribute("data-source-version");
  await page.getByRole("button", { name: "Edit in BEND" }).click();
  await page.waitForURL(/\/studio\/edit\?hostSession=/, { timeout: 30_000 });
  await page.locator(".canvas-frame canvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Generate" }).click();
  const seed = page.getByLabel(/Refraction seed/);
  await seed.waitFor({ state: "visible", timeout: 15_000 });
  await seed.fill("PHASE6A-EDITED");
  evidence.checks.editableSource = await page.getByText("HOST EDIT", { exact: true }).isVisible();
  const packageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Source/ }).click();
  const packageFile = await packageDownload;
  evidence.checks.editableDownload = packageFile.suggestedFilename().endsWith(".bendpkg");
  const updateStartedAt = Date.now();
  await page.getByRole("button", { name: "Update Post" }).click();
  await page.getByRole("heading", { name: /Place BEND/ }).waitFor({ state: "visible", timeout: 120_000 });
  await page.locator(".host-layer-row").first().waitFor({ state: "visible", timeout: 30_000 });
  const sourceVersionAfter = await page.locator(".host-layer-row").first().getAttribute("data-source-version");
  evidence.metrics.roundTripUpdateMs = Date.now() - updateStartedAt;
  evidence.checks.roundTripUpdate = Boolean(sourceVersionBefore && sourceVersionAfter && sourceVersionBefore !== sourceVersionAfter);
  evidence.checks.foregroundPreserved = await page.locator(".host-foreground").count() === 1;
  const hostPlacementAfter = await page.locator(".host-inspector").evaluate((element) => ({
    x: element.querySelector('input[aria-label="X position"]')?.value,
    y: element.querySelector('input[aria-label="Y position"]')?.value,
    scale: element.querySelector('input[aria-label="Scale"]')?.value,
    opacity: element.querySelector('input[aria-label="Opacity"]')?.value,
    playback: element.querySelector("#host-playback")?.value,
    stackingOrder: element.closest(".integration-board")?.querySelector(".host-layer-row")?.getAttribute("data-stacking-order"),
  }));
  evidence.checks.hostPlacementPreserved = JSON.stringify(hostPlacementBefore) === JSON.stringify(hostPlacementAfter);
  await page.screenshot({ path: "output/evidence/phase6a/host-round-trip.png", fullPage: true });
  evidence.artifacts.push("host-round-trip.png");
  const hostVideoBytes = await page.locator(".host-video-layer").evaluate(async (element) => Array.from(new Uint8Array(await (await fetch(element.currentSrc || element.src)).arrayBuffer())));
  await writeFile("output/evidence/phase6a/host-layer.mp4", Uint8Array.from(hostVideoBytes));
  evidence.metrics.hostVideoBytes = hostVideoBytes.length;
  evidence.artifacts.push("host-layer.mp4");

  const cancelSource = page.getByRole("button", { name: "Edit in BEND" });
  await cancelSource.click();
  await page.waitForURL(/\/studio\/edit\?hostSession=/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Exit" }).click();
  await page.getByRole("heading", { name: /Place BEND/ }).waitFor({ state: "visible", timeout: 30_000 });
  evidence.checks.cancelPreservesHost = await page.locator(".host-foreground").count() === 1;

  const packagePage = await context.newPage();
  await packagePage.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded" });
  await packagePage.locator('input[aria-label="Choose local video footage"]').setInputFiles(path.resolve("tests/fixtures/test-pattern.webm"));
  await packagePage.waitForURL(/\/studio\/edit$/, { timeout: 30_000 });
  await packagePage.getByText("Imported footage", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  await packagePage.evaluate(() => {
    window.__bendDownloadHref = "";
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      window.__bendDownloadHref = this.href;
      originalClick.call(this);
    };
  });
  const packageStartedAt = Date.now();
  await packagePage.getByRole("button", { name: /Source/ }).click();
  await packagePage.waitForFunction(() => Boolean(window.__bendDownloadHref), null, { timeout: 30_000 });
  const footagePackagePath = path.resolve("output/evidence/phase6a/test-pattern.bendpkg");
  const footageBytes = await packagePage.evaluate(async () => Array.from(new Uint8Array(await (await fetch(window.__bendDownloadHref)).arrayBuffer())));
  await writeFile(footagePackagePath, Uint8Array.from(footageBytes));
  evidence.metrics.editablePackageDownloadMs = Date.now() - packageStartedAt;
  evidence.metrics.editablePackageBytes = footageBytes.length;
  evidence.artifacts.push("test-pattern.bendpkg");
  const freshContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded" });
  const restoreStartedAt = Date.now();
  await freshPage.getByLabel("Import editable BEND project").setInputFiles(footagePackagePath);
  await freshPage.waitForURL(/\/studio\/edit$/, { timeout: 30_000 });
  await freshPage.getByText("Imported footage", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  await freshPage.getByText("Warming the GPU compositor…", { exact: true }).waitFor({ state: "hidden", timeout: 30_000 });
  evidence.metrics.packageRestoreMs = Date.now() - restoreStartedAt;
  evidence.checks.freshPackageImport = await freshPage.locator(".canvas-frame canvas").isVisible();
  await freshPage.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__bendFailProjectWrite = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "projects" && window.__bendFailProjectWrite) {
        window.__bendFailProjectWrite = false;
        throw new DOMException("Quota exceeded during Phase 6A verification.", "QuotaExceededError");
      }
      return originalPut.apply(this, args);
    };
  });
  await freshPage.getByLabel("Project name").fill("Persistence failure recovery");
  await freshPage.getByText("Save failed", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  evidence.checks.persistenceFailureRecovery = await freshPage.getByRole("button", { name: "Download recovery copy" }).isVisible();
  await freshPage.screenshot({ path: "output/evidence/phase6a/fresh-package-import.png", fullPage: true });
  evidence.artifacts.push("fresh-package-import.png");
  await freshContext.close();
  await packagePage.close();
} finally {
  await mkdir("output/evidence/phase6a", { recursive: true });
  evidence.checks.noConsoleErrors = evidence.consoleErrors.length === 0;
  await writeFile("output/evidence/phase6a/verification.json", JSON.stringify(evidence, null, 2), "utf8");
  await context?.close();
  await browser?.close();
  server.kill();
}

if (Object.values(evidence.checks).some((value) => value === false)) {
  throw new Error(`Phase 6A browser checks failed: ${JSON.stringify(evidence, null, 2)}`);
}
console.log(JSON.stringify(evidence, null, 2));
