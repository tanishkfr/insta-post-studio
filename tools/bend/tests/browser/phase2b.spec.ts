import { expect, test } from "@playwright/test";
import { openGenerated } from "./studio-helpers";

const generators = [
  { name: "Signal Field", seed: "Signal seed", presets: ["Pulse", "Drift", "Current", "Fracture"] },
  { name: "Liquid", seed: "Liquid seed", presets: ["Ink Spill", "Vortex", "Tidal", "Nebula"] },
  { name: "Flow", seed: "Flow seed", presets: ["Threads", "Current", "Orbit", "Drift"] },
  { name: "Refraction", seed: "Refraction seed", presets: ["Pool", "Glass", "Prism", "Mirage"] },
] as const;

async function openGeneratorWorkspace(page: import("@playwright/test").Page): Promise<void> {
  await openGenerated(page);
  await expect(page.getByRole("group", { name: "Procedural generator library" })).toBeVisible();
}

test.describe("BEND Phase 2B procedural generators", () => {
  test("exposes the four generator systems with grouped controls and presets", async ({ page }) => {
    await openGeneratorWorkspace(page);

    const library = page.getByRole("group", { name: "Procedural generator library" });
    await expect(library.getByRole("button")).toHaveCount(4);
    await expect(page.locator(".generator-thumbnail")).toHaveCount(4);

    for (const generator of generators) {
      const card = library.getByRole("button", { name: `${generator.name} generator` });
      await expect(card).toBeVisible();
      await card.click();
      await expect(page.getByRole("heading", { name: `${generator.name} controls` })).toBeVisible();
      await expect(page.getByLabel(generator.seed)).toBeVisible();
      await expect(page.locator(".timeline-clip-label").first()).toContainText(generator.name);
      await expect(page.locator(".timeline-clip-sub").first()).toContainText(generator.name.toUpperCase());
      const presetGroup = page.getByRole("group", { name: `${generator.name} preset` });
      await expect(presetGroup.getByRole("button")).toHaveCount(4);
      for (const preset of generator.presets) await expect(presetGroup.getByRole("button", { name: preset, exact: true })).toBeVisible();
      await expect(page.locator(".generator-group h4")).toContainText(["Motion", "Structure", "Appearance", "Simulation"]);
    }

    await page.getByRole("button", { name: "Liquid generator" }).click();
    const liquidSeed = page.getByLabel("Liquid seed");
    await liquidSeed.fill("LIQUID-BROWSER");
    await page.getByRole("button", { name: "Randomize" }).click();
    await expect(liquidSeed).toHaveValue(/^BEND-/);
    await expect(page.getByText("STATEFUL", { exact: true })).toBeVisible();
    await page.screenshot({ path: `output/playwright/${test.info().project.name}-phase2b-library.png`, fullPage: true });
  });

  test("seeks and exports a short still frame for every generator", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Still-frame export evidence is collected in Chromium.");
    const runtimeErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`); });
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    await openGeneratorWorkspace(page);
    await page.getByLabel("Duration value").fill("0.5");

    for (const generator of generators) {
      await page.getByRole("button", { name: `${generator.name} generator` }).click();
      await page.getByLabel("Timeline scrubber").click({ position: { x: 190, y: 14 } });
      await expect(page.locator(".timeline-timecode")).not.toHaveText("0:00.00");
      await page.getByRole("button", { name: "Export" }).click();
      await page.getByRole("button", { name: "Still frame" }).click();
      await page.getByRole("button", { name: "Export PNG" }).click();
      await expect(page.getByText(/Export complete/)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".export-result img")).toBeVisible();
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);
  });
});
