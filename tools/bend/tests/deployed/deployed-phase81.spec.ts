import path from "node:path";
import fs from "node:fs";
import { expect, test, openStudio } from "./helpers";

test.describe("Phase 8.1 deployed creator refinements", () => {
  test("exposes media, shortcuts, waveform surfaces and Draft/Full without breaking procedural editing @smoke", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Signal Field" }).click();
    await expect(page.getByRole("heading", { name: "Signal Field controls", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Open media library" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keyboard shortcuts" })).toBeVisible();

    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(page.getByRole("dialog", { name: "Shortcuts" })).toContainText("Ripple delete");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Shortcuts" })).toBeHidden();

    await page.getByRole("button", { name: "Open media library" }).click();
    await expect(page.getByRole("dialog", { name: "Media library" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(page.getByTestId("editor-canvas")).toHaveAttribute("data-preview-quality", "draft");
    await page.getByRole("button", { name: "Full", exact: true }).click();
    await expect(page.getByTestId("editor-canvas")).toHaveAttribute("data-preview-quality", "full");
    await expect(page.locator(".sequence-editor")).toBeVisible();
  });

  test("imports multiple shots, shows waveforms, loops and ducks music, and exports validated audio @full", async ({ page }, testInfo) => {
    test.skip(!["chrome", "edge"].includes(testInfo.project.name), "Full media encode acceptance runs on Chromium-based deployed projects.");
    test.setTimeout(240_000);
    await openStudio(page);
    await page.getByLabel("Add local video").setInputFiles([
      path.resolve("tests/fixtures/test-pattern-audio.mp4"),
      path.resolve("tests/fixtures/performance-720p.mp4"),
    ]);
    await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 60_000 });
    await expect(page.locator(".clip-waveform")).toHaveCount(2);
    await expect(page.locator(".clip-waveform").first()).toHaveAttribute("aria-label", /waveform/i);

    await page.getByRole("button", { name: "Open media library" }).click();
    const library = page.getByRole("dialog", { name: "Media library" });
    await expect(library.locator(".media-card")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(library).toBeHidden();

    await page.getByLabel("Add local soundtrack").setInputFiles(path.resolve("tests/fixtures/music-bed-4s.mp3"));
    await expect(page.locator(".sequence-music-clip")).toHaveCount(1, { timeout: 45_000 });
    await page.locator(".music-mix").click();
    await page.getByRole("button", { name: "Toggle soundtrack looping" }).click();
    await page.getByRole("button", { name: "Toggle automatic music ducking" }).click();
    await expect(page.locator(".sequence-music-clip")).toHaveAttribute("aria-label", /looped/);
    await expect(page.locator(".music-duck-badge")).toBeVisible();
    await expect(page.locator(".music-waveform")).toHaveAttribute("aria-label", /Soundtrack waveform/i);
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 30_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 45_000 });
    await expect(page.locator(".sequence-music-clip")).toHaveAttribute("aria-label", /looped/);
    await expect(page.locator(".music-duck-badge")).toBeVisible();

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await dialog.getByRole("button", { name: /Quick preview/ }).click();
    await dialog.getByRole("button", { name: /Export social video/ }).click();
    await expect(page.getByText(/Export validated/)).toBeVisible({ timeout: 180_000 });
    await expect(dialog.locator(".export-result")).toContainText(/Ducking reduced|Ducking is enabled/);
    await expect(page.getByText(/Mixed timeline audio included/)).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download bend-/ }).click();
    const download = await downloadPromise;
    const target = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(target);
    expect(fs.statSync(target).size).toBeGreaterThan(10_000);
  });
});
