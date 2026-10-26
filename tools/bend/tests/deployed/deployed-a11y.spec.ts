import AxeBuilder from "@axe-core/playwright";
import { expect, test, addGenerator, openStudio } from "./helpers";
import path from "node:path";
import fs from "node:fs";

const evidenceDirectory = path.resolve("output/evidence/phase7-0/deployed-tests");

async function analyze(page: import("@playwright/test").Page, label: string, testInfo: import("@playwright/test").TestInfo): Promise<void> {
  // Let panel transitions finish so axe evaluates the settled colours, not a
  // partially transparent exit/enter frame.
  await page.waitForTimeout(700);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  fs.mkdirSync(path.join(evidenceDirectory, testInfo.project.name), { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, testInfo.project.name, `axe-${label}.json`), JSON.stringify(results.violations, null, 2));
  testInfo.annotations.push({ type: "axe", description: `${label}: ${results.violations.length} total, ${blocking.length} serious/critical` });
  expect(blocking.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target).slice(0, 4) })), `${label} serious/critical axe findings`).toEqual([]);
}

test.describe("deployed accessibility and responsive usability", () => {
  test("has no serious or critical axe findings across the editor, effect/motion panels, export, and library @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await analyze(page, "empty-editor", testInfo);
    await addGenerator(page, "Signal Field");
    await analyze(page, "editor-layer", testInfo);
    await page.getByRole("tab", { name: "Effects", exact: true }).click();
    await analyze(page, "effects-panel", testInfo);
    await page.getByRole("tab", { name: "Motion", exact: true }).click();
    await analyze(page, "motion-panel", testInfo);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("dialog", { name: "Export composition" }).waitFor();
    await analyze(page, "export-dialog", testInfo);
    await page.getByRole("button", { name: "Close export dialog" }).click();
    await page.getByRole("button", { name: "Open project library" }).click();
    await page.getByRole("dialog", { name: "Your projects" }).waitFor();
    await analyze(page, "project-library", testInfo);
    await page.getByRole("button", { name: "Close project library" }).click();
  });

  test("supports keyboard-only operation for menus, dialogs, sliders, loop handles, and the timeline @full", async ({ page }) => {
    await openStudio(page);
    const add = page.getByRole("button", { name: "Add", exact: true });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "Add to composition" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Add to composition" })).toHaveCount(0, { timeout: 5_000 });

    // Timeline scrubber keyboard.
    const scrubber = page.getByLabel("Timeline scrubber");
    await scrubber.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".timeline-timecode")).not.toHaveText("0:00.00");

    // Loop handle is a slider with arrow-key support.
    await page.getByRole("button", { name: "Loop Off" }).click();
    const loopEnd = page.getByRole("slider", { name: "Drag loop end" });
    const beforeLoop = Number(await loopEnd.getAttribute("aria-valuenow"));
    await loopEnd.focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);
    expect(Number(await loopEnd.getAttribute("aria-valuenow"))).toBeLessThan(beforeLoop);

    // Export dialog focus management and return.
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    await exportButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Export composition" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Close export dialog" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
    await expect(exportButton).toBeFocused();

    // Project library focus/Escape.
    const libraryButton = page.getByRole("button", { name: "Open project library" });
    await libraryButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Your projects" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Your projects" })).toHaveCount(0, { timeout: 5_000 });
    await expect(libraryButton).toBeFocused();
  });

  test("keeps representative viewports and a 200%-zoom-equivalent layout free of horizontal overflow @full", async ({ page }, testInfo) => {
    for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844], [720, 450]] as const) {
      await page.setViewportSize({ width, height });
      await openStudio(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}px overflow`).toBe(true);
      await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, `viewport-${width}.png`), fullPage: true });
    }
    testInfo.annotations.push({ type: "zoom", description: "720x450 CSS viewport used as a 200% browser-zoom equivalent; not a native zoom automation." });
  });

  test("honours reduced motion and remains inspectable in forced colors @full", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStudio(page);
    const reduced = await page.evaluate(() => {
      const element = document.querySelector(".workspace-guide, .inspector-panel, .timeline-layer-group");
      if (!element) return null;
      const style = getComputedStyle(element);
      return { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration };
    });
    expect(reduced).not.toBeNull();
    const maxDuration = Math.max(parseFloat(reduced!.animationDuration) || 0, parseFloat(reduced!.transitionDuration) || 0);
    expect(maxDuration).toBeLessThanOrEqual(0.011);
    await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
    await addGenerator(page, "Signal Field");
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "forced-colors.png"), fullPage: true });
    await analyze(page, "forced-colors", testInfo);
  });
});
