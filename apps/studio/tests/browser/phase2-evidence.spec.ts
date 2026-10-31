import { expect, test } from "./studio-test";
import {
  chooseFormat,
  imageFrame,
  openImage,
  openType,
  publishActiveTool,
  readNewestProject,
  setRange,
  switchTypeMode,
  typeFrame,
  waitForImageReady,
  waitForStudio,
  waitForTypeReady,
  waitForVectorReady,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

const evidence = (name: string) =>
  test.info().outputPath(name);

test("Phase 2 integrated workflow evidence", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");

  // Integrated Image with effects and painted mask.
  await openImage(page);
  const image = imageFrame(page);
  await image.locator("#file").setInputFiles({
    name: "seafoam-portrait.png",
    mimeType: "image/png",
    buffer: makePng({ width: 720, height: 900 }),
  });
  await expect(image.locator("#hn")).toHaveValue("seafoam-portrait");
  await image.locator('#cats .t', { hasText: "Dots" }).first().click();
  await image.getByRole("tab", { name: "Effects" }).click();
  await image.locator('#cats .t', { hasText: "Paint" }).first().click();
  const wrap = await image.locator("#wrap").boundingBox();
  await page.mouse.move(wrap!.x + wrap!.width * 0.3, wrap!.y + wrap!.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(wrap!.x + wrap!.width * 0.66, wrap!.y + wrap!.height * 0.62, {
    steps: 12,
  });
  await page.mouse.up();
  await image.locator("#L").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByTestId("image-editor").screenshot({
    path: evidence("01-image-integrated.png"),
  });
  await publishActiveTool(page);
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await page.screenshot({ path: evidence("02-image-published.png") });

  // Reopen the exact source.
  const project = await readNewestProject(page);
  const imageLayer = (project?.project.layers as Array<Record<string, unknown>>)[0];
  const imageLayerId = String(imageLayer.id);
  await page.locator(`[data-testid="layer-row-${imageLayerId}"] .layer-name-button`).click();
  await page.getByTestId("inspector-edit-layer").click();
  await waitForImageReady(page);
  await image.getByRole("tab", { name: "Effects" }).click();
  await page.getByTestId("image-editor").screenshot({
    path: evidence("03-image-source-restored.png"),
  });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();

  // Image -> Vector tracing.
  await page.locator(`[data-testid="layer-row-${imageLayerId}"] .layer-name-button`).click();
  await page.getByRole("button", { name: "Continue in…" }).click();
  await page.getByTestId("continue-in-vector").click();
  await waitForVectorReady(page);
  await page.frameLocator('iframe[title="Vector editor"]').getByRole("button", {
    name: "Randomise shape",
  }).waitFor({ state: "visible" });
  await page.screenshot({ path: evidence("04-image-to-vector-trace.png") });
  await publishActiveTool(page);

  // Image -> Custom Type motif.
  await page.locator(`[data-testid="layer-row-${imageLayerId}"] .layer-name-button`).click();
  await page.getByRole("button", { name: "Continue in…" }).click();
  await page.getByTestId("use-as-type-pattern").click();
  await waitForTypeReady(page, "custom");
  await typeFrame(page, "custom").locator("#text").fill("TYPE");
  await page.screenshot({ path: evidence("05-image-to-type-motif.png") });
  await publishActiveTool(page);
  await expect(page.locator(".canvas-layer")).toHaveCount(3);
  await page.screenshot({ path: evidence("06-mixed-composition.png") });

  // Type Library distortion and Custom Type.
  await openType(page);
  const library = typeFrame(page);
  await expect(library.locator("#status")).toContainText("Fonts ready", { timeout: 60_000 });
  await library.locator(".font-row", { hasText: "Goozette" }).click();
  await library.locator("#text").fill("STUDIO TYPE");
  await setRange(library, "#size", 200);
  await setRange(library, "#strength", 80);
  const preview = await library.locator("#preview").boundingBox();
  await page.mouse.move(preview!.x + preview!.width * 0.34, preview!.y + preview!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(preview!.x + preview!.width * 0.6, preview!.y + preview!.height * 0.46, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await page.getByTestId("type-editor").screenshot({
    path: evidence("07-type-library-distortion.png"),
  });
  await switchTypeMode(page, "custom");
  const custom = typeFrame(page, "custom");
  const draw = await custom.locator("#draw").boundingBox();
  await page.mouse.move(draw!.x + draw!.width * 0.4, draw!.y + draw!.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(draw!.x + draw!.width * 0.6, draw!.y + draw!.height * 0.62, {
    steps: 10,
  });
  await page.mouse.up();
  await page.getByTestId("type-editor").screenshot({
    path: evidence("08-custom-type.png"),
  });
  await page.getByTestId("type-editor").getByRole("button", { name: "Canvas" }).click();

  // Narrower layout.
  await page.setViewportSize({ width: 1024, height: 768 });
  await openImage(page);
  await page.getByTestId("image-editor").screenshot({
    path: evidence("09-image-narrow-layout.png"),
  });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();
});
