import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
  await page.getByText("Warming the GPU compositor…").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
}

async function seekFraction(page: Page, fraction: number): Promise<void> {
  const ruler = page.getByLabel("Timeline scrubber");
  await ruler.scrollIntoViewIfNeeded();
  const box = await ruler.boundingBox();
  if (!box) throw new Error("Timeline ruler is not visible.");
  await page.mouse.click(box.x + Math.max(1, Math.min(box.width - 1, box.width * fraction)), box.y + 10);
}

test("imports multiple clips, uses the media bin, shows waveforms, and exposes quick clip controls", async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles([
    path.resolve("tests/fixtures/test-pattern-audio.mp4"),
    path.resolve("tests/fixtures/performance-720p.mp4"),
    path.resolve("tests/fixtures/trimmed-audio-source.mp4"),
  ]);
  await expect(page.locator(".sequence-clip")).toHaveCount(3, { timeout: 40_000 });
  await expect(page.locator(".clip-waveform")).toHaveCount(3);
  await expect(page.locator(".clip-waveform").first()).toHaveAttribute("role", "img");
  await expect(page.locator(".clip-waveform").first()).toHaveAttribute("aria-label", /waveform/i);

  await page.getByRole("button", { name: "Open media library" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  await expect(library).toBeVisible();
  await expect(library.locator(".media-card")).toHaveCount(3);
  await page.locator('input[aria-label="Import media to library"]').setInputFiles(path.resolve("tests/fixtures/music-bed-4s.mp3"));
  await expect(library.locator(".media-card")).toHaveCount(4, { timeout: 30_000 });
  const audioCard = library.locator(".media-card").filter({ hasText: "music-bed-4s.mp3" });
  await audioCard.getByRole("button", { name: /Use as music/ }).click();
  await expect(page.locator(".sequence-music-clip")).toHaveCount(1, { timeout: 20_000 });

  const videoCard = library.locator(".media-card").filter({ hasText: "performance-720p.mp4" });
  await videoCard.getByRole("button", { name: /Add to V1/ }).click();
  await expect(page.locator(".sequence-clip")).toHaveCount(4, { timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(library).toBeHidden();

  await page.locator(".sequence-clip").nth(1).click();
  await page.getByRole("button", { name: "Quick open transition controls" }).click();
  const transition = page.locator('.inspector-panel[aria-hidden="false"] [data-inspector-disclosure="transition"]');
  await expect(transition).toHaveJSProperty("open", true);
  await page.getByRole("button", { name: "Quick open audio controls" }).click();
  await expect(page.locator('.inspector-panel[aria-hidden="false"] [data-inspector-disclosure="audio"]')).toHaveJSProperty("open", true);
  await page.getByRole("button", { name: "Quick open color and look controls" }).click();
  await expect(page.locator('.inspector-panel[aria-hidden="false"] [data-inspector-disclosure="appearance"]')).toHaveJSProperty("open", true);

  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute("data-preview-quality", "draft");
  await page.getByRole("button", { name: "Full", exact: true }).click();
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute("data-preview-quality", "full");
});

test("persists soundtrack looping and ducking, and exposes waveform equivalents", async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles([
    path.resolve("tests/fixtures/test-pattern-audio.mp4"),
    path.resolve("tests/fixtures/performance-720p.mp4"),
  ]);
  await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 30_000 });
  await page.locator('input[aria-label="Add local soundtrack"]').setInputFiles(path.resolve("tests/fixtures/music-bed-4s.mp3"));
  await expect(page.locator(".sequence-music-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.locator(".music-mix").click();

  await page.getByRole("button", { name: "Toggle soundtrack looping" }).click();
  await expect(page.locator(".sequence-music-clip")).toHaveAttribute("aria-label", /looped/);
  await expect(page.locator(".music-loop-badge")).toBeVisible();
  await expect(page.locator(".soundtrack-loop-summary")).toContainText("repetition");

  await page.getByRole("button", { name: "Toggle automatic music ducking" }).click();
  await expect(page.locator(".music-duck-badge")).toBeVisible();
  await expect(page.locator(".music-waveform")).toHaveAttribute("aria-label", /Soundtrack waveform.*loop repetitions/i);

  await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".sequence-music-clip")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator(".sequence-music-clip")).toHaveAttribute("aria-label", /looped/);
  await expect(page.locator(".music-duck-badge")).toBeVisible();
  await expect(page.locator(".clip-waveform").first()).toHaveAttribute("aria-label", /waveform/i);
});

test("supports keyboard editing, ripple undo, edit-point navigation, and shortcut discovery", async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles([
    path.resolve("tests/fixtures/test-pattern-audio.mp4"),
    path.resolve("tests/fixtures/performance-720p.mp4"),
  ]);
  await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 30_000 });
  await page.locator(".sequence-clip").first().click();
  await seekFraction(page, 0.125);
  await page.keyboard.press("s");
  await expect(page.locator(".sequence-clip")).toHaveCount(3, { timeout: 20_000 });
  await page.keyboard.press("Control+d");
  await expect(page.locator(".sequence-clip")).toHaveCount(4, { timeout: 20_000 });
  await page.keyboard.press("Shift+Delete");
  await expect(page.locator(".sequence-clip")).toHaveCount(3, { timeout: 20_000 });
  await page.keyboard.press("Control+z");
  await expect(page.locator(".sequence-clip")).toHaveCount(4, { timeout: 20_000 });

  await page.keyboard.press("?");
  const shortcuts = page.getByRole("dialog", { name: "Shortcuts" });
  await expect(shortcuts).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shortcuts).toBeHidden();

  // Focus the timeline clip button, then use arrow keys for edit-point navigation.
  await page.locator(".sequence-clip-hit").first().focus();
  const before = await page.locator(".timeline-timecode").innerText();
  await page.keyboard.press("ArrowDown");
  const after = await page.locator(".timeline-timecode").innerText();
  expect(after).not.toBe(before);

  await page.keyboard.press("Shift+m");
  await expect(page.getByRole("dialog", { name: "Media library" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("cover preview and export summary reflect looped and ducked audio", async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.locator('input[aria-label="Add local soundtrack"]').setInputFiles(path.resolve("tests/fixtures/music-bed-4s.mp3"));
  await expect(page.locator(".sequence-music-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.locator(".music-mix").click();
  await page.getByRole("button", { name: "Toggle soundtrack looping" }).click();
  await page.getByRole("button", { name: "Toggle automatic music ducking" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export composition" });
  await expect(dialog.locator(".export-summary")).toContainText("ducked");
  await dialog.getByRole("button", { name: /Cover frame/ }).click();
  await expect(dialog.locator(".cover-preview-panel img")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator(".cover-time-field input")).toBeEditable();
  await dialog.getByRole("button", { name: "Close export dialog" }).click();
});

test("keeps V1, ruler, and detail tracks aligned while zoomed and exposes the music lane on mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles([
    path.resolve("tests/fixtures/test-pattern-audio.mp4"),
    path.resolve("tests/fixtures/performance-720p.mp4"),
  ]);
  await expect(page.locator(".sequence-clip")).toHaveCount(2, { timeout: 30_000 });
  await page.getByRole("button", { name: "Zoom timeline in" }).click();
  await page.getByRole("button", { name: "Zoom timeline in" }).click();

  const scrolled = await page.evaluate(async () => {
    const sequence = document.querySelector<HTMLElement>(".sequence-scroll");
    const timeline = document.querySelector<HTMLElement>(".timeline-scroll");
    if (!sequence || !timeline) return null;
    sequence.scrollLeft = 180;
    sequence.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { sequence: sequence.scrollLeft, timeline: timeline.scrollLeft };
  });
  expect(scrolled).not.toBeNull();
  expect(Math.abs((scrolled?.sequence ?? 0) - (scrolled?.timeline ?? 0))).toBeLessThan(2);

  const alignment = await page.evaluate(() => {
    const lane = document.querySelector(".sequence-row .sequence-lane")?.getBoundingClientRect();
    const ruler = document.querySelector(".timeline-ruler")?.getBoundingClientRect();
    if (!lane || !ruler) return null;
    return { left: lane.left - ruler.left, width: lane.width - ruler.width };
  });
  expect(alignment).not.toBeNull();
  expect(Math.abs(alignment?.left ?? 99)).toBeLessThan(2);
  expect(Math.abs(alignment?.width ?? 99)).toBeLessThan(2);

  await page.getByRole("button", { name: "Zoom timeline to fit" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".sequence-clip-hit").first().click();
  const quickActions = page.locator(".sequence-context-bar");
  await expect(quickActions.getByRole("button", { name: "Quick open color and look controls" })).toBeVisible();
  const spills = await quickActions.evaluate((bar) => {
    const right = bar.getBoundingClientRect().right;
    return Array.from(bar.querySelectorAll("button")).some((button) => button.getBoundingClientRect().right > right + 1);
  });
  expect(spills).toBe(false);
  const musicLane = page.locator(".sequence-row.is-music .sequence-lane");
  await musicLane.scrollIntoViewIfNeeded();
  await expect(musicLane).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("reorders layers without dropping a hidden video layer", async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });
  for (const name of ["Signal Field", "Liquid"]) {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name }).click();
    await expect(page.getByRole("heading", { name: `${name} controls`, exact: true })).toBeVisible({ timeout: 20_000 });
  }
  await page.locator(".sequence-clip-hit").first().focus();
  await page.keyboard.press("Enter");
  const labels = page.locator(".track-label");
  await expect(labels).toHaveCount(3, { timeout: 20_000 });
  await labels.nth(1).scrollIntoViewIfNeeded();
  const first = await labels.nth(0).boundingBox();
  const second = await labels.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  await page.mouse.move((first?.x ?? 0) + (first?.width ?? 0) / 2, (first?.y ?? 0) + (first?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((second?.x ?? 0) + (second?.width ?? 0) / 2, (second?.y ?? 0) + (second?.height ?? 0) / 2, { steps: 10 });
  await page.mouse.up();
  await expect(labels).toHaveCount(3, { timeout: 15_000 });
  await labels.nth(0).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(labels).toHaveCount(2, { timeout: 15_000 });
  await page.locator(".sequence-clip-hit").first().focus();
  await page.keyboard.press("Enter");
  await expect(labels).toHaveCount(3, { timeout: 15_000 });
});

test("keeps the ruler and detail timeline reachable with long clip names at compact desktop", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles({
    name: "kitchen-interview-camera-a-long-take-for-social-edit.mp4",
    mimeType: "video/mp4",
    buffer: fs.readFileSync(path.resolve("tests/fixtures/test-pattern-audio.mp4")),
  });
  await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });

  const panel = page.locator(".timeline-panel");
  const scrollable = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.overflowY === "auto" || style.overflowY === "scroll") && element.scrollHeight > element.clientHeight;
  });
  expect(scrollable, "The compact desktop timeline must scroll instead of clipping its detail lanes.").toBe(true);

  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const panelBox = await panel.boundingBox();
  const ruler = page.getByLabel("Timeline scrubber");
  const rulerBox = await ruler.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(rulerBox).not.toBeNull();
  expect(rulerBox!.y).toBeGreaterThanOrEqual(panelBox!.y - 1);
  expect(rulerBox!.y + rulerBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 1);

  const before = await page.locator(".timeline-timecode").innerText();
  await page.mouse.click(rulerBox!.x + rulerBox!.width * 0.5, rulerBox!.y + 10);
  await expect.poll(async () => page.locator(".timeline-timecode").innerText()).not.toBe(before);
});

test("removes unused media and relinks a missing source without changing the edit", async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page);
  await page.locator('input[aria-label="Add local video"]').setInputFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.locator(".sequence-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.locator('input[aria-label="Import media to library"]').setInputFiles(path.resolve("tests/fixtures/performance-720p.mp4"));
  const library = page.getByRole("dialog", { name: "Media library" });
  await expect(library.locator(".media-card")).toHaveCount(2, { timeout: 30_000 });
  const unused = library.locator(".media-card").filter({ hasText: "performance-720p.mp4" });
  await expect(unused).toContainText("Unused");
  await unused.getByRole("button", { name: /Remove/ }).click();
  await expect(library.locator(".media-card")).toHaveCount(1, { timeout: 20_000 });
  await page.keyboard.press("Control+z");
  await expect(library.locator(".media-card")).toHaveCount(2, { timeout: 20_000 });
  const unusedAgain = library.locator(".media-card").filter({ hasText: "performance-720p.mp4" });
  await unusedAgain.getByRole("button", { name: /Remove/ }).click();
  await expect(library.locator(".media-card")).toHaveCount(1, { timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(library).toBeHidden();
  await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const storedAssetCount = await page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open("bend-local", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("assets", "readonly");
        const keys = transaction.objectStore("assets").getAllKeys();
        keys.onerror = () => reject(keys.error);
        keys.onsuccess = () => { db.close(); resolve(keys.result.length); };
      };
    });
  });
  expect(storedAssetCount).toBe(1);

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("bend-local", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("assets", "readwrite");
        transaction.objectStore("assets").clear();
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".missing-media-banner")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Open media library" }).click();
  const missingLibrary = page.getByRole("dialog", { name: "Media library" });
  const missingCard = missingLibrary.locator(".media-card").filter({ hasText: "test-pattern-audio.mp4" });
  await expect(missingCard).toContainText("Missing source");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await missingCard.getByRole("button", { name: /Relink/ }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(path.resolve("tests/fixtures/test-pattern-audio.mp4"));
  await expect(page.locator(".missing-media-banner")).toBeHidden({ timeout: 30_000 });
  await expect(missingLibrary.locator(".media-card").filter({ hasText: "test-pattern-audio.mp4" })).not.toContainText("Missing source");
  await expect(page.locator(".sequence-clip")).toHaveCount(1);
});
