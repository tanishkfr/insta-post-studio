import { expect, test, addGenerator, canvasHash, exportStill, fixturePath, importVideo, openStudio, saveDownload, scrub } from "./helpers";
import fs from "node:fs";
import path from "node:path";

const evidenceDirectory = path.resolve("output/evidence/phase7-0/deployed-tests");

test.describe("deployed editor smoke", () => {
  test("creates a generator, edits it, scrubs, and downloads a valid PNG @smoke", async ({ page }, testInfo) => {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await expect(page.getByRole("group", { name: "Signal Field preset" })).toBeVisible();
    const before = await canvasHash(page);
    await page.getByRole("group", { name: "Signal Field preset" }).getByRole("button", { name: "Fracture", exact: true }).click();
    await page.getByLabel("Signal seed").fill("PHASE7-DEPLOYED");
    await page.waitForTimeout(900);
    const after = await canvasHash(page);
    expect(after).not.toBe(before);
    expect(await page.locator(".timeline-track").count()).toBe(1);

    await scrub(page, 0.35);
    expect(await page.locator(".timeline-timecode").innerText()).not.toBe("0:00.00");
    const download = await exportStill(page);
    expect(download.suggestedFilename()).toMatch(/^bend-.+-frame\.png$/);
    const file = await saveDownload(download, path.join(evidenceDirectory, testInfo.project.name));
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1350);
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "generator-editor.png"), fullPage: true });
  });

  test("imports real footage, decodes, seeks, plays, trims, and restores it after reload @smoke", async ({ page, browserName }, testInfo) => {
    await openStudio(page);
    const primary = browserName === "webkit" ? "bend-portrait-vp9-opus.webm" : "bend-portrait-916.mp4";
    await page.getByLabel("Add local video").setInputFiles(fixturePath(primary));
    await page.waitForFunction(() => Boolean(document.querySelector(".inspector-layer-type")?.textContent?.includes("Imported footage") || document.querySelector(".capability-banner[role='alert']")), undefined, { timeout: 30_000 });
    const alert = page.locator(".capability-banner[role='alert']");
    if (await alert.count()) {
      const message = await alert.first().innerText();
      expect(message, "unsupported codec must produce an actionable message").toMatch(/browser-compatible|could not read|Unsupported/i);
      testInfo.annotations.push({ type: "codec-fallback", description: `${primary}: ${message.slice(0, 180)}` });
      if (browserName === "webkit") {
        await page.getByLabel("Add local video").setInputFiles(fixturePath("bend-portrait-vp9-opus.webm"));
        await page.waitForTimeout(2_000);
      }
      if (await page.locator(".capability-banner[role='alert']").count()) {
        test.skip(true, `This ${browserName} build lacks a decodable MP4/WebM fixture; actionable error was verified.`);
      }
    }

    await expect(page.locator(".inspector-layer-type")).toContainText("Imported footage");
    await expect(page.locator(".inspector-section").filter({ hasText: "Source / trim" })).toContainText("540 × 960");
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await scrub(page, 0.35);
    const seeked = await page.locator(".timeline-timecode").innerText();
    expect(seeked).not.toBe("0:00.00");
    await page.getByRole("button", { name: "Play timeline" }).click();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Pause timeline" }).click();
    const played = await page.locator(".timeline-timecode").innerText();
    expect(played).not.toBe(seeked);

    await page.getByLabel("Out value", { exact: true }).fill("3.5");
    await page.getByLabel("Out value", { exact: true }).press("Enter");
    await expect(page.locator(".timeline-duration").first()).toHaveText("/ 0:03.50");
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".inspector-layer-type")).toContainText("Imported footage", { timeout: 45_000 });
    await expect(page.locator(".timeline-track")).toHaveCount(1);
    await expect(page.getByLabel("Out value", { exact: true })).toHaveValue("3.5");
    expect(await page.locator(".canvas-frame canvas").isVisible()).toBe(true);
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "footage-reload.png"), fullPage: true });
  });

  test("keeps the studio usable at a phone viewport with touch and no horizontal overflow @mobile", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, "Touch assertion runs in the mobile device project.");
    await openStudio(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Add", exact: true }).tap();
    await page.getByRole("menuitem", { name: "Signal Field" }).tap();
    await expect(page.locator(".timeline-track")).toHaveCount(1);
    await page.getByRole("button", { name: "Open controls" }).tap();
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Signal Field controls", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "mobile-editor.png"), fullPage: true });
  });
});
