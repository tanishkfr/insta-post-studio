import { expect, test, addGenerator, canvasHash, exportStill, fixturePath, importVideo, openDisclosure, openStudio, openTab, scrub, selectLayer, waitForCanvasStable } from "./helpers";
import fs from "node:fs";
import path from "node:path";

const evidenceDirectory = path.resolve("output/evidence/phase7-0/deployed-tests");

test.describe("deployed creative tools", () => {
  test("applies each temporal effect and preset, keeps stacks valid, and exports a treated frame @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await importVideo(page, fixturePath("bend-portrait-916.mp4"));
    await scrub(page, 0.3);
    await waitForCanvasStable(page);
    const baseline = await canvasHash(page);
    await openTab(page, "Effects");
    const library = page.locator(".temporal-library");
    const effectHashes: Record<string, string> = {};
    for (const [name, preset] of [["Motion Echo", "Long Exposure"], ["Time Slice", "Temporal Fracture"], ["Channel Delay", "Signal Drift"], ["Frame Feedback", "Recursive Drift"]] as const) {
      // Evaluate one effect at a time. Nesting every sampling effect produces a
      // combinatorial read load; compatibility and ordering are covered below
      // with a performant pair.
      for (const remove of await page.locator(".temporal-stack").getByRole("button", { name: /^Remove / }).all()) {
        await remove.click();
      }
      await library.locator(".effect-library-item").filter({ hasText: name }).click();
      await expect(page.locator(".temporal-stack-row")).toHaveCount(1);
      const group = page.getByRole("group", { name: `${name} preset` });
      await group.getByRole("button", { name: preset, exact: true }).click();
      await expect(group.getByRole("button", { name: preset, exact: true })).toHaveAttribute("aria-pressed", "true");
      await waitForCanvasStable(page, 800, 45_000);
      const hash = await canvasHash(page);
      effectHashes[name] = hash;
      expect(hash, `${name} changed the preview`).not.toBe(baseline);
    }
    expect(new Set(Object.values(effectHashes)).size).toBeGreaterThan(2);

    // A practical pair: two sampling effects, both presets selectable.
    for (const remove of await page.locator(".temporal-stack").getByRole("button", { name: /^Remove / }).all()) {
      await remove.click();
    }
    await library.locator(".effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await library.locator(".effect-library-item").filter({ hasText: "Channel Delay" }).click();
    await expect(page.locator(".temporal-stack-row")).toHaveCount(2);
    // A bypassed effect stays bypassed when a preset is selected (regression G3).
    await page.locator(".temporal-stack-select").filter({ hasText: "Channel Delay" }).click();
    await page.getByRole("button", { name: "Bypass Channel Delay in stack" }).click();
    await page.getByRole("group", { name: "Channel Delay preset" }).getByRole("button", { name: "RGB Stutter", exact: true }).click();
    await expect(page.locator(".temporal-stack-row").filter({ hasText: "Channel Delay" })).toContainText("Bypassed");
    await page.getByRole("button", { name: "Enable Channel Delay in stack" }).click();

    // Frame Feedback must remain terminal; no state-changing move is allowed.
    await library.locator(".effect-library-item").filter({ hasText: "Frame Feedback" }).click();
    await page.getByRole("button", { name: "Move Frame Feedback up" }).click();
    await expect(page.getByText("Frame Feedback must remain the final temporal pass.")).toBeVisible();
    const order = await page.locator(".temporal-stack-row strong").allInnerTexts();
    expect(order.at(-1)).toBe("Frame Feedback");
    expect(await page.getByText(/Heavy temporal stack:/).isVisible()).toBe(true);
    await page.getByRole("button", { name: "Remove Frame Feedback" }).click();

    // The effect stack can be copied as a treatment and exported with Wave.
    await page.getByRole("button", { name: "Copy stack" }).click();
    await expect(page.getByText(/Copied .*Motion Echo/)).toBeVisible();
    await page.getByRole("button", { name: "Toggle Wave Displacement" }).click();
    const waveSection = page.locator(".inspector-section").filter({ has: page.getByRole("button", { name: "Toggle Wave Displacement" }) });
    await waveSection.getByLabel("Intensity value").fill("0.6");
    await waitForCanvasStable(page);
    const download = await exportStill(page);
    const file = path.join(evidenceDirectory, testInfo.project.name, download.suggestedFilename());
    await download.saveAs(file);
    expect(fs.statSync(file).size).toBeGreaterThan(10_000);
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "temporal-stack.png"), fullPage: true });
  });

  test("composites blend modes and masks, keeps animated masks across toggles, and compares the original @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await addGenerator(page, "Flow");
    await addGenerator(page, "Signal Field");
    await expect(page.locator(".timeline-track")).toHaveCount(2);
    const beforeBlend = await canvasHash(page);
    await openDisclosure(page, "Appearance");
    await page.getByLabel("Blend mode").selectOption("multiply");
    await waitForCanvasStable(page);
    const afterBlend = await canvasHash(page);
    expect(afterBlend).not.toBe(beforeBlend);

    await openDisclosure(page, "Mask");
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse", exact: true }).click();
    const autoKey = page.getByRole("button", { name: "Auto-Key", exact: true });
    if ((await autoKey.getAttribute("aria-pressed")) === "true") await autoKey.click();
    await page.getByLabel("Width value").fill("0.55");
    await page.getByLabel("Height value").fill("0.4");
    await page.getByLabel("Feather value").fill("0.35");
    await page.getByRole("button", { name: "Invert mask" }).click();
    await expect(page.getByRole("button", { name: "Invert mask" })).toHaveAttribute("aria-pressed", "true");

    // Add explicit width keyframes so only the animated mask track is counted.
    await scrub(page, 0);
    await page.getByLabel("Width value").fill("0.6");
    await page.getByRole("button", { name: "Set keyframe for Width" }).click();
    await scrub(page, 0.3);
    await page.getByLabel("Width value").fill("0.3");
    await page.getByRole("button", { name: "Set keyframe for Width" }).click();
    await expect(page.locator(".timeline-keyframe")).toHaveCount(2);

    // Turning the mask off must not erase the animation (regression G18).
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "None", exact: true }).click();
    await expect(page.locator(".timeline-keyframe")).toHaveCount(2);
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse", exact: true }).click();
    await expect(page.locator(".timeline-keyframe")).toHaveCount(2);

    // Compare strips the treatment while held.
    await openTab(page, "Effects");
    const compare = page.getByRole("button", { name: /Hold to compare original source and edited result/ });
    const treated = await canvasHash(page);
    const box = await compare.boundingBox();
    if (!box) throw new Error("Compare control is not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400);
    const original = await canvasHash(page);
    await page.mouse.up();
    expect(original).not.toBe(treated);
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "mask-blend.png"), fullPage: true });
  });

  test("edits keyframe groups, easing, modulation, and effect-stack clipboard @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    const transform = page.getByRole("group", { name: "Transform", exact: true });
    await transform.getByLabel("Scale value").fill("1.2");
    await scrub(page, 0.35);
    await transform.getByLabel("Scale value").fill("0.8");
    await expect(page.locator(".timeline-keyframe")).toHaveCount(2);

    const keys = page.locator(".timeline-keyframe");
    await keys.nth(0).click({ modifiers: ["Shift"] });
    await keys.nth(1).click({ modifiers: ["Shift"] });
    await expect(page.getByRole("group", { name: "Selected keyframe actions" })).toContainText("2 selected");
    await page.getByRole("button", { name: "Copy selected keyframes" }).click();
    await scrub(page, 0.7);
    await page.getByRole("button", { name: "Paste keyframes at playhead" }).click();
    await expect(page.locator(".timeline-keyframe")).toHaveCount(4);

    await openTab(page, "Motion");
    await expect(page.getByRole("heading", { name: "Selected keyframes" })).toBeVisible();
    await page.getByRole("group", { name: "Easing presets" }).getByRole("button", { name: "Snappy", exact: true }).click();
    await expect(page.getByText(/Changed easing for 2 keyframes\./)).toBeVisible();
    await openTab(page, "Edit");
    await transform.getByRole("button", { name: "Add modulation for Scale" }).click();
    await openTab(page, "Motion");
    await expect(page.getByLabel("Waveform")).toBeVisible();
    await page.getByLabel("Waveform", { exact: true }).selectOption("sine");
    await page.getByLabel("Mode", { exact: true }).selectOption("multiply");

    // Effects clipboard across layers.
    await openTab(page, "Effects");
    await page.locator(".temporal-library .effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await page.getByRole("button", { name: "Copy stack" }).click();
    await addGenerator(page, "Refraction");
    await openTab(page, "Effects");
    await page.getByRole("button", { name: "Paste append" }).click();
    await expect(page.locator(".temporal-stack-row").filter({ hasText: "Motion Echo" })).toHaveCount(1);
    await expect(page.getByText(/Pasted|Appended/i).first()).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "keyframes-effects.png"), fullPage: true });
  });

  test("applies seeded variation and motion recipes without invalid stacks @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await page.getByText("Create a variation", { exact: false }).first().click();
    await page.getByLabel("Strength").selectOption("wild");
    await page.getByRole("button", { name: "Vary", exact: true }).click();
    await expect(page.getByText(/Varied \d+ parameter/)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();

    await openTab(page, "Motion");
    const recipes = page.getByRole("region", { name: "Motion recipes" });
    await expect(recipes).toBeVisible();
    await recipes.getByRole("option", { name: /Signal Breakdown/ }).click();
    await recipes.getByRole("button", { name: "Apply / replace" }).click();
    await openTab(page, "Effects");
    await expect(page.locator(".temporal-stack-row").filter({ hasText: "Channel Delay" })).toHaveCount(1);
    // Recursive Dream uses Frame Feedback; appending it must remain terminal and valid.
    await openTab(page, "Motion");
    const recipesAgain = page.getByRole("region", { name: "Motion recipes" });
    await recipesAgain.getByRole("option", { name: /Recursive Dream/ }).click();
    await recipesAgain.getByRole("button", { name: "Append to layer" }).click();
    await openTab(page, "Effects");
    const stack = await page.locator(".temporal-stack-row strong").allInnerTexts();
    expect(stack.at(-1)).toBe("Frame Feedback");
    await expect(page.getByText(/Frame Feedback must remain the last temporal pass/)).toHaveCount(0);
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "recipes.png"), fullPage: true });
  });

  test("supports project library create, rename, duplicate, delete, and shared media safety @full", async ({ page }, testInfo) => {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await page.getByLabel("Project name").fill("Phase 7 Library");
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });
    await page.getByRole("button", { name: "Open project library" }).click();
    const library = page.getByRole("dialog", { name: "Your projects" });
    await expect(library.getByText("Phase 7 Library")).toBeVisible();
    await library.getByRole("button", { name: "Duplicate current" }).click();
    await expect(page.getByLabel("Project name")).toHaveValue("Phase 7 Library copy");
    await expect(page.locator(".save-status")).toHaveText("Saved locally", { timeout: 20_000 });

    await page.getByRole("button", { name: "Open project library" }).click();
    const libraryAgain = page.getByRole("dialog", { name: "Your projects" });
    await expect(libraryAgain.getByText("Phase 7 Library copy")).toBeVisible();
    await libraryAgain.getByRole("button", { name: "Close project library" }).click();

    await page.getByRole("button", { name: "Open project library" }).click();
    await expect(page.getByRole("dialog", { name: "Your projects" }).getByRole("button", { name: "Open Phase 7 Library copy", exact: true })).toBeDisabled();
    const deleteDialog = page.getByRole("dialog", { name: "Your projects" });
    await deleteDialog.getByRole("button", { name: "Delete Phase 7 Library copy" }).click();
    await expect(deleteDialog.getByText(/Delete (this|the open) project\?/)).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(deleteDialog.getByText("Phase 7 Library", { exact: true })).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Close project library" }).click();
    await expect(page.getByLabel("Project name")).toHaveValue("Phase 7 Library");
    await expect(page.locator(".timeline-track")).toHaveCount(1);
    await expect(page.locator(".canvas-frame canvas")).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDirectory, testInfo.project.name, "project-library.png"), fullPage: true });
  });
});
