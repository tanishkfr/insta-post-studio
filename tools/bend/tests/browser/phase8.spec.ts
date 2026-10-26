import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

async function openStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
  await page.getByText("Warming the GPU compositor…").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
}

async function seekByFraction(page: import("@playwright/test").Page, fraction: number): Promise<void> {
  const ruler = page.getByLabel("Timeline scrubber");
  await ruler.scrollIntoViewIfNeeded();
  const box = await ruler.boundingBox();
  if (!box) throw new Error("Timeline ruler is not visible.");
  await page.mouse.click(box.x + Math.max(1, Math.min(box.width - 1, box.width * fraction)), box.y + 10);
}

test("imports, splits, transitions, adjusts speed, and restores the editable sequence", async ({ page }, testInfo) => {
  await openStudio(page);
  await page.getByLabel("Add local video").setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.locator(".sequence-clip").first().click();
  await seekByFraction(page, 0.5);
  await page.getByRole("button", { name: /Split selected clip at playhead/ }).click();
  await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 10_000 });

  await page.locator(".sequence-clip").nth(1).click();
  await page.locator('.inspector-panel[aria-hidden="false"] summary').filter({ hasText: "Transition in" }).click();
  await page.locator(".transition-section").getByRole("button", { name: "Apply transition" }).click();
  await expect(page.locator(".sequence-transition")).toHaveCount(1);

  await page.locator('.inspector-panel[aria-hidden="false"] summary').filter({ hasText: "Speed and time" }).click();
  const speed = page.locator('.clip-timing-section input[aria-label="Speed value"]');
  await speed.fill("1.5");
  await speed.blur();
  await expect(page.locator("summary").filter({ hasText: "Speed and time" })).toContainText("1.50×");

  await page.getByRole("button", { name: "Set cover", exact: true }).click();
  await expect(page.locator(".sequence-cover-marker")).toBeVisible();
  const coverBeforeReload = await page.locator(".canvas-social-tools span").innerText();
  await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator(".sequence-transition")).toHaveCount(1);
  await expect(page.locator('.inspector-panel[aria-hidden="false"] summary').filter({ hasText: "Transition in" })).toContainText("Dissolve");
  await expect(page.locator(".canvas-social-tools span")).toHaveText(coverBeforeReload);
  await page.screenshot({ path: testInfo.outputPath("phase8-sequence-reload.png"), fullPage: true });
});

test("exports a validated cover PNG at the chosen frame", async ({ page }, testInfo) => {
  test.skip(test.info().project.name !== "chromium", "Local H.264/AAC encode coverage runs in Chromium.");
  test.setTimeout(90_000);
  await openStudio(page);
  await page.getByLabel("Add local video").setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.selectOption('select[aria-label="Canvas format"]', "9:16");
  await seekByFraction(page, 0.5);
  await page.getByRole("button", { name: "Set cover", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export composition" });
  await dialog.getByRole("button", { name: /Cover frame/ }).click();
  await dialog.getByRole("button", { name: "Export cover PNG" }).click();
  await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 60_000 });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download bend-/ }).click();
  const download = await downloadPromise;
  const target = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(target);
  const bytes = fs.readFileSync(target);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1920);
});

test("imports a soundtrack at its true duration and exports mixed timeline audio", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium", "Local audio encode coverage runs in Chromium.");
  test.setTimeout(90_000);
  await openStudio(page);
  await page.getByLabel("Add local video").setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.getByLabel("Add local soundtrack").setInputFiles(path.resolve("tests/fixtures/music-bed-4s.mp3"));
  await expect(page.locator(".sequence-music-clip")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator(".sequence-music-clip")).toHaveAttribute("aria-label", /0:04\.0/);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export composition" });
  await dialog.getByRole("button", { name: /Quick preview/ }).click();
  await dialog.getByRole("button", { name: /Export social video/ }).click();
  await expect(page.getByText(/Export validated/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Mixed timeline audio included")).toBeVisible();
});
