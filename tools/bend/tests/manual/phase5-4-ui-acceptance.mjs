import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const port = 4188;
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDirectory = path.resolve("output/evidence/phase5-4");
const browserExecutable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const evidence = { checks: {}, consoleErrors: [], consoleWarnings: [], pageErrors: [], artifacts: [] };

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
      if ((await fetch(`${baseUrl}/`)).ok) return;
    } catch {
      // Keep waiting for Vite.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not become ready for the Phase 5.4 UI check.");
}

async function openStudio(context) {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
    if (message.type() === "warning") evidence.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.stack ?? error.message));
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
  await page.locator(".canvas-frame canvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  return page;
}

async function capture(page, name) {
  const output = path.join(evidenceDirectory, name);
  await page.screenshot({ path: output, fullPage: true });
  evidence.artifacts.push(path.relative(root, output));
}

async function main() {
  await mkdir(evidenceDirectory, { recursive: true });
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "ignore", windowsHide: true });
  await waitForServer();
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ["--use-angle=swiftshader"] });

  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await openStudio(context);
  await capture(page, "01-empty-before.png");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  check("addMenuVisible", await page.getByRole("menu", { name: "Add to composition" }).isVisible());
  check("firstStudyIsNotAddAction", await page.getByRole("menuitem", { name: "Open First Study" }).count() === 0);
  await capture(page, "02-add-menu.png");
  await page.getByRole("button", { name: "Close add menu" }).click();

  await page.getByRole("button", { name: "Open First Study" }).focus();
  await page.getByRole("button", { name: "Open First Study" }).press("Space");
  await page.waitForTimeout(500);
  check("firstStudyOpensFromLearningEntry", await page.getByRole("heading", { name: "BEND / First Study" }).isVisible());
  await capture(page, "03-first-study.png");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Signal Field" }).click();
  await page.waitForTimeout(650);
  check("inspectorExitPanelDoesNotReserveGap", await page.locator(".inspector-panel[aria-hidden='true']").count() === 0);
  const panelGeometry = await page.locator(".inspector-panel-stage, .inspector-panel:not([aria-hidden='true']) .inspector-section").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { className: element.className, top: rect.top, height: rect.height };
  }));
  check("inspectorHasImmediateContent", panelGeometry.some((entry) => entry.className.includes("inspector-section") && entry.top < 280), JSON.stringify(panelGeometry));
  const disclosure = (title) => page.locator("details.inspector-disclosure").filter({ has: page.locator("summary strong").filter({ hasText: new RegExp(`^${title}$`) }) });
  check("cropIsProgressivelyDisclosed", await disclosure("Crop").locator("summary").isVisible());
  check("appearanceStartsCollapsed", await disclosure("Appearance").evaluate((element) => !element.hasAttribute("open")));
  const scaleValue = page.getByLabel("Scale value").first();
  const scaleBefore = Number(await scaleValue.inputValue());
  await page.getByRole("button", { name: "Resize nw corner" }).focus();
  await page.getByRole("button", { name: "Resize nw corner" }).press("ArrowRight");
  await page.waitForTimeout(250);
  const scaleAfter = Number(await scaleValue.inputValue());
  check("canvasHandleHasKeyboardEquivalent", scaleAfter > scaleBefore, `${scaleBefore} → ${scaleAfter}`);
  await capture(page, "04-generated-settled.png");

  console.log("phase5.4: switching to Effects");
  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await page.waitForTimeout(450);
  console.log("phase5.4: switching to Motion");
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.waitForTimeout(450);
  console.log("phase5.4: checking Motion");
  check("rapidInspectorSwitchSettles", await page.getByRole("heading", { name: "Keyframes and modulation" }).isVisible());

  console.log("phase5.4: opening library");
  await page.getByRole("button", { name: "Open project library" }).click();
  const library = page.getByRole("dialog", { name: "Your projects" });
  check("projectLibraryOpens", await library.isVisible());
  check("firstStudyHasProjectEntry", await library.getByRole("button", { name: "Open First Study" }).isVisible());
  await library.getByRole("button", { name: "Open First Study" }).click();
  const exampleDialog = page.getByRole("dialog", { name: "Open First Study?" });
  check("exampleReplacementIsExplained", await exampleDialog.isVisible());
  await exampleDialog.getByRole("button", { name: "Keep working" }).click();
  await library.getByRole("button", { name: "Close project library" }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export composition" });
  await exportDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(450);
  check("exportSummaryVisible", await exportDialog.getByLabel("Export summary").isVisible());
  check("fullCanvasQualityIsDefault", await exportDialog.getByRole("button", { name: /High quality/ }).getAttribute("aria-pressed") === "true");
  check("exportAudioPolicyVisible", await exportDialog.locator(".export-summary").getByText(/Muted \/ no source|clip source/).isVisible());
  await capture(page, "05-export-dialog.png");
  await exportDialog.getByRole("button", { name: "Close export dialog" }).click();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(350);
  const laptopDimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
  check("laptopNoHorizontalOverflow", laptopDimensions.scrollWidth <= laptopDimensions.width && laptopDimensions.bodyScrollWidth <= laptopDimensions.width, JSON.stringify(laptopDimensions));
  await capture(page, "06-laptop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const mobileDimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
  check("mobileNoHorizontalOverflow", mobileDimensions.scrollWidth <= mobileDimensions.width && mobileDimensions.bodyScrollWidth <= mobileDimensions.width, JSON.stringify(mobileDimensions));
  await capture(page, "06-mobile.png");

  await context.close();
  console.log(JSON.stringify(evidence, null, 2));
}

try {
  await main();
} catch (error) {
  evidence.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser?.close().catch(() => undefined);
  server?.kill();
  await writeFile(path.join(evidenceDirectory, "phase5-4-ui-acceptance.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}
