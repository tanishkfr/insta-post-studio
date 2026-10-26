import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const root = process.cwd();
const port = 4176;
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDirectory = "output/evidence/phase5-1b";
const fixture = "tests/fixtures/test-pattern.mp4";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "ignore", windowsHide: true });

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
  throw new Error("Vite did not become ready for the Phase 5.1B browser check.");
}

async function openStudio(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`);
  await page.getByRole("heading", { name: "Start with a moving image." }).waitFor();
  await page.getByText("Warming the GPU compositor…", { exact: true }).waitFor({ state: "hidden", timeout: 30_000 });
  return page;
}

await mkdir(evidenceDirectory, { recursive: true });
await waitForServer();

const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader"] });
const errors = [];
const accessibility = [];
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await openStudio(desktop);
  const watchPage = (watchedPage) => {
    watchedPage.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
    watchedPage.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  };
  const scanAccessibility = async (scannedPage, label) => {
    const result = await new AxeBuilder({ page: scannedPage }).withTags(["wcag2a", "wcag2aa"]).analyze();
    accessibility.push({ label, violations: result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary })) })) });
  };
  watchPage(page);

  await page.screenshot({ path: `${evidenceDirectory}/01-studio-empty.png` });
  await scanAccessibility(page, "empty studio");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menu", { name: "Add to composition" }).waitFor();
  await page.screenshot({ path: `${evidenceDirectory}/14-add-popover.png` });
  await page.getByRole("menuitem", { name: "Liquid" }).click();
  await page.getByRole("button", { name: "Liquid generator" }).waitFor();
  await page.screenshot({ path: `${evidenceDirectory}/03-liquid-selected.png` });
  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await page.getByText("Temporal effects", { exact: true }).waitFor();
  await page.screenshot({ path: `${evidenceDirectory}/05-effects-inspector.png` });
  await scanAccessibility(page, "effects inspector");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("dialog", { name: "Start a new project?" }).waitFor();
  await page.screenshot({ path: `${evidenceDirectory}/16-new-project-dialog.png` });
  await scanAccessibility(page, "new project dialog");
  await page.getByRole("button", { name: "Keep working" }).click();

  const firstStudy = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const studyPage = await openStudio(firstStudy);
  watchPage(studyPage);
  await studyPage.getByRole("button", { name: "Open First Study" }).click();
  await studyPage.getByRole("tab", { name: "Motion", exact: true }).click();
  await studyPage.getByText("Keyframes and modulation", { exact: true }).waitFor();
  await studyPage.screenshot({ path: `${evidenceDirectory}/06-motion-inspector.png` });
  await studyPage.screenshot({ path: `${evidenceDirectory}/10-expanded-timeline.png` });
  await scanAccessibility(studyPage, "motion inspector");
  const recipes = studyPage.locator(".recipes-workspace");
  await recipes.scrollIntoViewIfNeeded();
  await recipes.screenshot({ path: `${evidenceDirectory}/09-recipe-library.png` });
  await studyPage.getByRole("button", { name: "Export", exact: true }).click();
  await studyPage.getByRole("dialog").waitFor();
  await studyPage.screenshot({ path: `${evidenceDirectory}/11-export-dialog.png` });
  await scanAccessibility(studyPage, "export dialog");
  await firstStudy.close();

  const imported = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const importedPage = await openStudio(imported);
  watchPage(importedPage);
  await importedPage.getByLabel("Add local video").setInputFiles(fixture);
  await importedPage.locator(".timeline-clip").waitFor({ state: "visible", timeout: 30_000 });
  await importedPage.screenshot({ path: `${evidenceDirectory}/02-imported-video.png` });
  await imported.close();

  const errorContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const errorPage = await openStudio(errorContext);
  watchPage(errorPage);
  await errorPage.getByLabel("Add local video").setInputFiles({ name: "not-video.txt", mimeType: "text/plain", buffer: Buffer.from("not a video") });
  await errorPage.getByRole("alert").waitFor();
  await errorPage.screenshot({ path: `${evidenceDirectory}/15-error-recovery.png` });
  await errorContext.close();

  const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const tabletPage = await openStudio(tablet);
  watchPage(tabletPage);
  await tabletPage.screenshot({ path: `${evidenceDirectory}/12-tablet.png` });
  const tabletDimensions = await tabletPage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
  if (tabletDimensions.scrollWidth > tabletDimensions.width || tabletDimensions.bodyScrollWidth > tabletDimensions.width) throw new Error(`Tablet overflow: ${JSON.stringify(tabletDimensions)}`);
  await tablet.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await openStudio(mobile);
  watchPage(mobilePage);
  await mobilePage.getByRole("button", { name: "Open controls" }).click();
  await mobilePage.getByRole("complementary", { name: "Inspector" }).waitFor();
  await mobilePage.screenshot({ path: `${evidenceDirectory}/13-mobile.png` });
  const mobileDimensions = await mobilePage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
  if (mobileDimensions.scrollWidth > mobileDimensions.width || mobileDimensions.bodyScrollWidth > mobileDimensions.width) throw new Error(`Mobile overflow: ${JSON.stringify(mobileDimensions)}`);
  await mobile.close();

  await page.close();
  await desktop.close();
  const accessibilityViolations = accessibility.filter((entry) => entry.violations.length > 0);
  const result = { status: "PASS", errors, accessibility, tablet: tabletDimensions, mobile: mobileDimensions };
  await writeFile(`${evidenceDirectory}/verification.json`, JSON.stringify(result, null, 2));
  if (accessibilityViolations.length) throw new Error(`Accessibility violations: ${JSON.stringify(accessibilityViolations)}`);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  server.kill();
}
