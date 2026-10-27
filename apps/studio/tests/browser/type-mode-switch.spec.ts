import { expect, test } from "./studio-test";
import {
  openType,
  publishActiveTool,
  readNewestProject,
  setRange,
  switchTypeMode,
  typeFrame,
  waitForStudio,
} from "./studio-helpers";

test("switching Type modes keeps both unsaved drafts and publishes the active one", async ({ page }) => {
  await waitForStudio(page);
  await openType(page);
  const library = typeFrame(page, "library");
  await expect(library.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await library.locator(".font-row", { hasText: "Rami" }).click();
  await library.locator("#text").fill("LIBRARY DRAFT");
  await setRange(library, "#size", 140);

  await switchTypeMode(page, "custom");
  const custom = typeFrame(page, "custom");
  const drawBox = await custom.locator("#draw").boundingBox();
  expect(drawBox).toBeTruthy();
  await page.mouse.move(drawBox!.x + drawBox!.width * 0.44, drawBox!.y + drawBox!.height * 0.46);
  await page.mouse.down();
  await page.mouse.move(drawBox!.x + drawBox!.width * 0.56, drawBox!.y + drawBox!.height * 0.58, {
    steps: 10,
  });
  await page.mouse.up();
  await custom.locator("#to-type").click();
  await custom.locator("#text").fill("CUSTOM DRAFT");
  await setRange(custom, "#letterSize", 190);

  await switchTypeMode(page, "library");
  const libraryAgain = typeFrame(page, "library");
  const librarySnapshot = await libraryAgain.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_TYPE_LIBRARY_BRIDGE__?: { snapshot: () => unknown };
    }).__STUDIO_TYPE_LIBRARY_BRIDGE__;
    return bridge?.snapshot();
  });
  expect(librarySnapshot).toMatchObject({
    font: "Rami",
    text: "LIBRARY DRAFT",
    size: 140,
  });

  await switchTypeMode(page, "custom");
  const customAgain = typeFrame(page, "custom");
  const customSnapshot = await customAgain.locator("body").evaluate(() => {
    const bridge = (window as unknown as {
      __STUDIO_CUSTOM_TYPE_BRIDGE__?: { snapshot: () => unknown };
    }).__STUDIO_CUSTOM_TYPE_BRIDGE__;
    return bridge?.snapshot();
  });
  expect(customSnapshot).toMatchObject({
    text: "CUSTOM DRAFT",
    letterSize: 190,
  });
  expect(
    (customSnapshot as { strokes?: unknown[] }).strokes?.length ?? 0,
  ).toBeGreaterThan(0);

  await publishActiveTool(page);
  const project = await readNewestProject(page);
  const layers = project?.project.layers as Array<Record<string, unknown>>;
  expect(layers).toHaveLength(1);
  expect(layers[0].kind).toBe("typography");
  expect((layers[0].metadata as { tags?: string[] }).tags).toContain("type-mode:custom");
});
