import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const root = process.cwd();
const port = 4173;
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDirectory = "output/evidence/phase5-1a";
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
  throw new Error("Vite did not become ready for the Phase 5.1A browser check.");
}

await mkdir(evidenceDirectory, { recursive: true });
await waitForServer();

const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader"] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/`);
  await page.getByRole("heading", { name: "Start with a moving image." }).waitFor();
  await page.screenshot({ path: `${evidenceDirectory}/manual-empty.png`, fullPage: false });

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Signal Field" }).click();
  await page.getByRole("heading", { name: "Signal Field", exact: true }).waitFor();
  await page.getByRole("button", { name: "Mute Signal Field" }).waitFor();
  await page.getByRole("button", { name: "Remove Signal Field" }).waitFor();
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  await page.getByText("Temporal effects", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("heading", { name: "Keyframes and modulation" }).waitFor();
  await page.screenshot({ path: `${evidenceDirectory}/manual-motion.png`, fullPage: false });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/`);
  await mobilePage.getByRole("heading", { name: "Start with a moving image." }).waitFor();
  await mobilePage.getByRole("button", { name: "Open controls" }).click();
  await mobilePage.getByRole("complementary", { name: "Inspector" }).waitFor();
  const dimensions = await mobilePage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
  if (dimensions.scrollWidth > dimensions.width || dimensions.bodyScrollWidth > dimensions.width) throw new Error(`Mobile overflow: ${JSON.stringify(dimensions)}`);
  await mobilePage.screenshot({ path: `${evidenceDirectory}/manual-mobile-controls.png`, fullPage: false });
  await mobile.close();
  await context.close();

  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ status: "PASS", errors, mobile: "390x844 no horizontal overflow" }));
} finally {
  await browser.close();
  server.kill();
}
