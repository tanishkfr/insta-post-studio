import { expect, test, addGenerator, canvasHash, exportStill, exportVideo, fixturePath, importVideo, openDisclosure, openStudio, openTab, saveDownload, scrub, selectLayer, waitForCanvasStable } from "./helpers";
import fs from "node:fs";
import path from "node:path";

const evidenceDirectory = path.resolve("output/evidence/phase7-0/creators");
fs.mkdirSync(evidenceDirectory, { recursive: true });

test.describe.configure({ timeout: 1_200_000 });

async function downloadSource(page: import("@playwright/test").Page, name: string): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".project-download-button").click();
  const download = await downloadPromise;
  const target = path.join(evidenceDirectory, name);
  await download.saveAs(target);
  return target;
}

async function saveNamed(download: import("@playwright/test").Download, name: string): Promise<string> {
  const target = path.join(evidenceDirectory, name);
  await download.saveAs(target);
  return target;
}

test.describe("creator acceptance projects", () => {
  test("Project A — Experimental Reel (10s portrait, footage + procedural, blend, animated mask, temporal effect, keyframes) @creator", async ({ page }, testInfo) => {
    await openStudio(page);
    await page.getByLabel("Canvas format").selectOption("9:16");
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await addGenerator(page, "Signal Field");
    const generator = page.getByRole("group", { name: "Signal Field generator controls" });
    await generator.getByLabel("Signal seed").fill("PHASE7-EXPERIMENTAL-REEL");
    await generator.getByRole("group", { name: "Signal Field preset" }).getByRole("button", { name: "Fracture", exact: true }).click();
    await generator.getByLabel("Duration value").fill("10");
    await generator.getByLabel("Duration value").press("Enter");
    await expect(page.locator(".timeline-duration").first()).toHaveText("/ 0:10.00");

    await openTab(page, "Effects");
    await page.locator(".temporal-library .effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await page.getByRole("group", { name: "Motion Echo preset" }).getByRole("button", { name: "Long Exposure", exact: true }).click();

    await openTab(page, "Edit");
    await openDisclosure(page, "Mask");
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse", exact: true }).click();
    await page.getByLabel("Width value").fill("0.62");
    await page.getByLabel("Height value").fill("0.74");
    await page.getByLabel("Feather value").fill("0.42");
    await scrub(page, 0);
    await page.getByLabel("Width value").fill("0.64");
    await scrub(page, 0.4);
    await page.getByLabel("Width value").fill("0.3");
    await openDisclosure(page, "Appearance");
    await page.getByLabel("Blend mode").selectOption("screen");
    await scrub(page, 0);
    const transform = page.getByRole("group", { name: "Transform", exact: true });
    await transform.getByLabel("Scale value").fill("1");
    await scrub(page, 0.9);
    await transform.getByLabel("Scale value").fill("1.08");
    await scrub(page, 0.4);
    await page.getByLabel("Project name").fill("Project A — Experimental Reel");
    await waitForCanvasStable(page, 900, 60_000);
    const hash = await canvasHash(page);
    expect(hash).not.toBe("");
    await page.screenshot({ path: path.join(evidenceDirectory, "project-a-preview.png"), fullPage: true });

    const videoDownload = await exportVideo(page, { quality: "high", timeout: 900_000 });
    const videoPath = await saveNamed(videoDownload, "project-a-experimental-reel.mp4");
    const still = await exportStill(page);
    await saveNamed(still, "project-a-poster.png");
    const sourcePath = await downloadSource(page, "project-a-experimental-reel.bendpkg");
    testInfo.annotations.push({ type: "creator-project", description: `A :: ${videoPath} :: ${fs.statSync(videoPath).size} bytes :: ${sourcePath}` });
    expect(fs.statSync(videoPath).size).toBeGreaterThan(100_000);
  });

  test("Project B — Procedural Loop (two generators, controlled variation, loop region, seamless mirrored export) @creator", async ({ page }, testInfo) => {
    await openStudio(page);
    await page.getByLabel("Canvas format").selectOption("9:16");
    await addGenerator(page, "Signal Field");
    await addGenerator(page, "Flow");
    await selectLayer(page, "Signal Field");
    const signal = page.getByRole("group", { name: "Signal Field generator controls" });
    await signal.getByRole("group", { name: "Signal Field preset" }).getByRole("button", { name: "Current", exact: true }).click();
    await page.getByText("Create a variation", { exact: false }).first().click();
    await page.getByLabel("Strength").selectOption("moderate");
    await page.getByRole("button", { name: "Vary", exact: true }).click();
    await selectLayer(page, "Flow");
    const flow = page.getByRole("group", { name: "Flow generator controls" });
    await flow.getByRole("group", { name: "Flow preset" }).getByRole("button", { name: "Orbit", exact: true }).click();
    await openDisclosure(page, "Appearance");
    await page.getByLabel("Blend mode").selectOption("screen");
    const flowTransform = page.getByRole("group", { name: "Transform", exact: true });
    await flowTransform.getByLabel("Opacity value").fill("0.8");
    await page.getByLabel("Loop start seconds").fill("1");
    await page.getByLabel("Loop end seconds").fill("4");
    await page.getByRole("button", { name: "Loop Off" }).click();
    await page.getByLabel("Project name").fill("Project B — Procedural Loop");
    await waitForCanvasStable(page);
    await page.screenshot({ path: path.join(evidenceDirectory, "project-b-preview.png"), fullPage: true });

    const download = await exportVideo(page, { quality: "high", range: "loop", seamless: true, timeout: 300_000 });
    const videoPath = await saveNamed(download, "project-b-procedural-loop.mp4");
    await page.getByLabel("Timeline scrubber").focus();
    // Capture the loop start and mirrored end as stills for boundary inspection.
    await scrub(page, 1 / 8);
    const startStill = await exportStill(page);
    await saveNamed(startStill, "project-b-loop-start.png");
    await scrub(page, 4 / 8);
    const endStill = await exportStill(page);
    await saveNamed(endStill, "project-b-loop-end.png");
    const sourcePath = await downloadSource(page, "project-b-procedural-loop.bendpkg");
    testInfo.annotations.push({ type: "creator-project", description: `B :: ${videoPath} :: ${fs.statSync(videoPath).size} bytes :: ${sourcePath}` });
    expect(fs.statSync(videoPath).size).toBeGreaterThan(50_000);
  });

  test("Project C — Footage Treatment (9:16 crop/reframe, color, trim, temporal effect, source audio, full quality) @creator", async ({ page }, testInfo) => {
    await openStudio(page);
    await page.getByLabel("Canvas format").selectOption("9:16");
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await page.getByLabel("In value", { exact: true }).fill("0.5");
    await page.getByLabel("Out value", { exact: true }).fill("4.5");
    await page.getByLabel("Out value", { exact: true }).press("Enter");
    await page.getByRole("group", { name: "Fit mode" }).getByRole("button", { name: "Fill", exact: true }).click();
    await openDisclosure(page, "Crop");
    await page.getByRole("group", { name: "Crop presets" }).getByRole("button", { name: "4:5", exact: true }).click();
    const transform = page.getByRole("group", { name: "Transform", exact: true });
    await transform.getByLabel("Position X value").fill("36");
    await transform.getByLabel("Position Y value").fill("-24");
    await transform.getByLabel("Scale value").fill("1.08");
    await openDisclosure(page, "Appearance");
    await page.getByLabel("Brightness value").fill("0.06");
    await page.getByLabel("Contrast value").fill("0.12");
    await page.getByLabel("Saturation value").fill("0.18");
    await page.getByLabel("Hue value").fill("4");
    await openTab(page, "Effects");
    await page.getByRole("button", { name: "Toggle Wave Displacement" }).click();
    await page.locator(".temporal-library .effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await page.getByRole("group", { name: "Motion Echo preset" }).getByRole("button", { name: "Ghost Trail", exact: true }).click();
    await page.getByLabel("Loop start seconds").fill("0");
    await page.getByLabel("Loop end seconds").fill("4.5");
    await page.getByRole("button", { name: "Loop Off" }).click();
    await page.getByLabel("Project name").fill("Project C — Footage Treatment");
    await scrub(page, 0.3);
    await waitForCanvasStable(page);
    await page.screenshot({ path: path.join(evidenceDirectory, "project-c-preview.png"), fullPage: true });

    const download = await exportVideo(page, { quality: "high", range: "loop", timeout: 600_000 });
    const videoPath = await saveNamed(download, "project-c-footage-treatment.mp4");
    const still = await exportStill(page);
    await saveNamed(still, "project-c-poster.png");
    const sourcePath = await downloadSource(page, "project-c-footage-treatment.bendpkg");
    testInfo.annotations.push({ type: "creator-project", description: `C :: ${videoPath} :: ${fs.statSync(videoPath).size} bytes :: ${sourcePath}` });
    expect(fs.statSync(videoPath).size).toBeGreaterThan(100_000);
  });
});
