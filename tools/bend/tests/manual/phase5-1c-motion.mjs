import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const port = 4177;
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDirectory = join(root, "output", "evidence", "phase5-1c");
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "ignore", windowsHide: true });
const errors = [];
const accessibility = [];
const records = [];

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
  throw new Error("Vite did not become ready for the Phase 5.1C browser check.");
}

async function openStudio(context) {
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/`);
  await page.getByRole("heading", { name: "Start with a moving image." }).waitFor();
  await page.getByText("Warming the GPU compositor…", { exact: true }).waitFor({ state: "hidden", timeout: 30_000 });
  return page;
}

async function waitForSettled(page, duration = 420) {
  await page.waitForTimeout(duration);
}

async function capture(page, directory, filename) {
  const absolute = join(evidenceDirectory, directory, filename);
  await mkdir(join(evidenceDirectory, directory), { recursive: true });
  await page.screenshot({ path: absolute });
  return absolute.replace(`${root}\\`, "").replaceAll("\\", "/");
}

async function recordSequence(page, name, action, options = {}) {
  const frameWaits = options.frameWaits ?? [40, 120, 260, 420];
  const frames = [{ label: "before", path: await capture(page, name, "00-before.png") }];
  await action();
  for (let index = 0; index < frameWaits.length; index += 1) {
    await page.waitForTimeout(frameWaits[index]);
    frames.push({ label: index === frameWaits.length - 1 ? "settled" : `after-${frameWaits[index]}ms`, path: await capture(page, name, `${String(index + 1).padStart(2, "0")}-${index === frameWaits.length - 1 ? "settled" : `${frameWaits[index]}ms`}.png`) });
  }
  records.push({ name, frames });
}

async function scan(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  accessibility.push({ label, violations: result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target) })) });
}

async function openStudy(page) {
  await page.getByRole("button", { name: "Open First Study" }).click();
  await waitForSettled(page);
}

async function addGenerator(page, name) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name }).click();
  await waitForSettled(page);
}

async function closeContext(context) {
  await context.close();
}

await mkdir(evidenceDirectory, { recursive: true });
await waitForServer();

const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader"] });
const contexts = [];
try {
  const inspectorContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(inspectorContext);
  const inspectorPage = await openStudio(inspectorContext);
  await openStudy(inspectorPage);
  await recordSequence(inspectorPage, "01-inspector-rapid-switch", async () => {
    await inspectorPage.getByRole("tab", { name: "Effects", exact: true }).click({ noWaitAfter: true });
    await inspectorPage.getByRole("tab", { name: "Motion", exact: true }).click({ noWaitAfter: true });
    await inspectorPage.getByRole("tab", { name: "Edit", exact: true }).click({ noWaitAfter: true });
  });
  await scan(inspectorPage, "settled inspector after rapid switching");

  await recordSequence(inspectorPage, "02-selected-layer", async () => {
    await inspectorPage.locator(".track-label").first().click();
    await inspectorPage.locator(".track-label").last().click();
  });
  await closeContext(inspectorContext);

  const addContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(addContext);
  const addPage = await openStudio(addContext);
  await recordSequence(addPage, "03-add-menu", async () => { await addPage.getByRole("button", { name: "Add", exact: true }).click(); });
  await recordSequence(addPage, "03-add-menu-close", async () => { await addPage.getByRole("button", { name: "Close add menu" }).click(); });
  await recordSequence(addPage, "04-add-procedural-layer", async () => {
    await addPage.getByRole("button", { name: "Add", exact: true }).click();
    await addPage.getByRole("menuitem", { name: "Liquid" }).click();
  });
  await closeContext(addContext);

  const timelineContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(timelineContext);
  const timelinePage = await openStudio(timelineContext);
  await openStudy(timelinePage);
  const collapse = timelinePage.getByRole("button", { name: /Collapse animation tracks/ }).first();
  await recordSequence(timelinePage, "05-timeline-collapse", async () => { await collapse.click(); });
  const expand = timelinePage.getByRole("button", { name: /Expand animation tracks/ }).first();
  await recordSequence(timelinePage, "05-timeline-expand", async () => { await expand.click(); });
  await closeContext(timelineContext);

  const reorderContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(reorderContext);
  const reorderPage = await openStudio(reorderContext);
  await addGenerator(reorderPage, "Signal Field");
  await addGenerator(reorderPage, "Liquid");
  await addGenerator(reorderPage, "Flow");
  const labelsBefore = await reorderPage.locator(".timeline-clip-label").allTextContents();
  const sourceHandle = reorderPage.locator(".track-label").first();
  const targetTrack = reorderPage.locator(".timeline-track").nth(1);
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetTrack.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Could not locate timeline reorder geometry.");
  await capture(reorderPage, "06-layer-reorder", "00-before.png");
  await reorderPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await reorderPage.mouse.down();
  await reorderPage.waitForTimeout(100);
  await capture(reorderPage, "06-layer-reorder", "01-drag-start.png");
  await reorderPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 6 });
  await reorderPage.waitForTimeout(100);
  await capture(reorderPage, "06-layer-reorder", "02-drag-over.png");
  await reorderPage.mouse.up();
  await waitForSettled(reorderPage);
  const labelsAfter = await reorderPage.locator(".timeline-clip-label").allTextContents();
  if (labelsAfter.join("|") === labelsBefore.join("|")) throw new Error("Layer reorder drag did not change the visual order.");
  await capture(reorderPage, "06-layer-reorder", "03-settled.png");
  await reorderPage.getByRole("button", { name: "Undo" }).click();
  await waitForSettled(reorderPage, 220);
  await capture(reorderPage, "06-layer-reorder", "04-undo.png");
  await reorderPage.getByRole("button", { name: "Redo" }).click();
  await waitForSettled(reorderPage, 220);
  await capture(reorderPage, "06-layer-reorder", "05-redo.png");
  records.push({ name: "06-layer-reorder", labelsBefore, labelsAfter, frames: ["06-layer-reorder/00-before.png", "06-layer-reorder/01-drag-start.png", "06-layer-reorder/02-drag-over.png", "06-layer-reorder/03-settled.png", "06-layer-reorder/04-undo.png", "06-layer-reorder/05-redo.png"] });
  await closeContext(reorderContext);

  const keyframeContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(keyframeContext);
  const keyframePage = await openStudio(keyframeContext);
  await addGenerator(keyframePage, "Signal Field");
  await recordSequence(keyframePage, "07-keyframe-create", async () => { await keyframePage.getByRole("button", { name: "Set keyframe for Scale" }).first().click(); });
  const keyframe = keyframePage.locator(".timeline-keyframe").first();
  const keyframeBefore = await keyframe.getAttribute("aria-label");
  const keyframeBox = await keyframe.boundingBox();
  const laneBox = await keyframePage.locator(".animation-track-lane").first().boundingBox();
  if (!keyframeBox || !laneBox) throw new Error("Could not locate keyframe geometry.");
  await keyframePage.mouse.move(keyframeBox.x + keyframeBox.width / 2, keyframeBox.y + keyframeBox.height / 2);
  await keyframePage.mouse.down();
  await keyframePage.waitForTimeout(80);
  await capture(keyframePage, "07-keyframe-move", "00-drag-start.png");
  await keyframePage.mouse.move(laneBox.x + laneBox.width * 0.32, keyframeBox.y + keyframeBox.height / 2, { steps: 8 });
  await keyframePage.waitForTimeout(80);
  await capture(keyframePage, "07-keyframe-move", "01-drag-over.png");
  await keyframePage.mouse.up();
  await waitForSettled(keyframePage);
  const keyframeAfter = await keyframePage.locator(".timeline-keyframe").first().getAttribute("aria-label");
  if (keyframeAfter === keyframeBefore) throw new Error("Keyframe drag did not change the keyframe time.");
  await capture(keyframePage, "07-keyframe-move", "02-settled.png");
  records.push({ name: "07-keyframe-move", frames: ["07-keyframe-move/00-drag-start.png", "07-keyframe-move/01-drag-over.png", "07-keyframe-move/02-settled.png"] });
  await closeContext(keyframeContext);

  const modulationContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(modulationContext);
  const modulationPage = await openStudio(modulationContext);
  await addGenerator(modulationPage, "Signal Field");
  await recordSequence(modulationPage, "08-modulator-open", async () => { await modulationPage.getByRole("button", { name: "Add modulation for Scale" }).first().click(); });
  await closeContext(modulationContext);

  const recipeContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(recipeContext);
  const recipePage = await openStudio(recipeContext);
  await openStudy(recipePage);
  await recipePage.getByRole("tab", { name: "Motion", exact: true }).click();
  await waitForSettled(recipePage);
  await recordSequence(recipePage, "09-motion-recipe-apply", async () => { await recipePage.getByRole("button", { name: "Apply / replace" }).click(); });
  await closeContext(recipeContext);

  const dialogContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  contexts.push(dialogContext);
  const dialogPage = await openStudio(dialogContext);
  await openStudy(dialogPage);
  await recordSequence(dialogPage, "10-export-dialog-open", async () => { await dialogPage.getByRole("button", { name: "Export", exact: true }).click(); });
  await scan(dialogPage, "settled export dialog");
  await recordSequence(dialogPage, "10-export-dialog-close", async () => { await dialogPage.getByRole("button", { name: "Close export dialog" }).click(); });
  await closeContext(dialogContext);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(mobileContext);
  const mobilePage = await openStudio(mobileContext);
  await recordSequence(mobilePage, "11-mobile-drawer-open", async () => { await mobilePage.getByRole("button", { name: "Open controls" }).click(); });
  await scan(mobilePage, "settled mobile controls drawer");
  await recordSequence(mobilePage, "11-mobile-drawer-close", async () => { await mobilePage.getByRole("button", { name: "Close controls" }).click(); });
  await closeContext(mobileContext);

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 980 }, reducedMotion: "reduce" });
  contexts.push(reducedContext);
  const reducedPage = await openStudio(reducedContext);
  const reducedMatches = await reducedPage.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  await recordSequence(reducedPage, "12-reduced-motion", async () => { await reducedPage.getByRole("button", { name: "Add", exact: true }).click(); });
  await recordSequence(reducedPage, "12-reduced-motion-inspector", async () => {
    await reducedPage.getByRole("button", { name: "Open First Study" }).click();
    await reducedPage.getByRole("tab", { name: "Effects", exact: true }).click();
  });
  await scan(reducedPage, "reduced-motion effects state");
  const canvasStable = await reducedPage.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return Boolean(canvas);
  });
  await closeContext(reducedContext);

  const failedAccessibility = accessibility.filter((entry) => entry.violations.length > 0);
  const result = {
    status: errors.length === 0 && failedAccessibility.length === 0 ? "PASS" : "FAIL",
    browser: "Google Chrome executablePath with SwiftShader",
    viewports: { desktop: "1440x980", mobile: "390x844" },
    reducedMotion: reducedMatches,
    canvasObserved: canvasStable,
    errors,
    accessibility,
    records,
  };
  await writeFile(join(evidenceDirectory, "verification.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (errors.length) throw new Error(errors.join("\n"));
  if (failedAccessibility.length) throw new Error(`Accessibility violations: ${JSON.stringify(failedAccessibility)}`);
} finally {
  for (const context of contexts) await context.close().catch(() => undefined);
  await browser.close();
  server.kill();
}
