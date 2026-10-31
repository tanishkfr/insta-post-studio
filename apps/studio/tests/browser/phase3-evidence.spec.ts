import { test } from "./studio-test";
import {
  chooseFormat,
  generateFrame,
  imageFrame,
  openGenerate,
  openImage,
  openShapes,
  openType,
  openVector,
  publishActiveTool,
  selectLayer,
  shapesFrame,
  typeFrame,
  waitForGenerateReady,
  waitForImageReady,
  waitForShapesReady,
  waitForStudio,
  waitForTypeReady,
} from "./studio-helpers";
import { makePng } from "../fixtures/png";

const evidence = (name: string) =>
  test.info().outputPath(name);

test("Phase 3 integrated workflows evidence", async ({ page }) => {
  await waitForStudio(page);
  await chooseFormat(page, "instagram-4-5");

  // Image base layer.
  await openImage(page);
  await imageFrame(page).locator("#file").setInputFiles({
    name: "evidence-background.png",
    mimeType: "image/png",
    buffer: makePng({ width: 600, height: 750 }),
  });
  await publishActiveTool(page);

  // Shapes editor and transparent publish.
  await openShapes(page);
  const shapes = shapesFrame(page);
  await shapes.getByRole("button", { name: "Add Cube" }).click();
  await shapes.getByRole("button", { name: "Add Sphere" }).click();
  await shapes.getByRole("tab", { name: "Material", exact: true }).click();
  await shapes.getByRole("button", { name: "#C4A574", exact: true }).click();
  await shapes.getByRole("button", { name: "soft", exact: true }).click().catch(() => undefined);
  await page.screenshot({ path: evidence("01-shapes-editor.png") });
  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await page.getByTestId("artboard").waitFor();
  await page.screenshot({ path: evidence("02-shapes-published.png") });

  await selectLayer(
    page,
    (await page.locator('[data-testid="canvas-layer"][data-layer-kind="shapes"]').first().getAttribute("data-layer-id"))!,
  );
  await page.getByTestId("inspector-edit-shapes").click();
  await waitForShapesReady(page);
  await page.screenshot({ path: evidence("03-shapes-source-restored.png") });
  await page.getByTestId("shapes-editor").getByRole("button", { name: "Canvas" }).click();

  // Shapes → Image derivative.
  await page.locator('[data-testid="canvas-layer"][data-layer-kind="shapes"]').first().click();
  await page.getByRole("button", { name: "Continue in…" }).click();
  await page.getByTestId("shapes-continue-in-image").click();
  await waitForImageReady(page);
  await page.screenshot({ path: evidence("04-shapes-to-image.png") });
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();

  // Add Vector and Type so Generate sees a full mixed composition.
  await openVector(page);
  await publishActiveTool(page);
  await openType(page);
  await waitForTypeReady(page, "library");
  await typeFrame(page)
    .locator("#status")
    .filter({ hasText: "Fonts ready" })
    .waitFor({ timeout: 60_000 });
  await typeFrame(page).locator("#text").fill("SHAPES + GENERATE");
  await publishActiveTool(page);
  await page.screenshot({ path: evidence("05-mixed-composition.png") });

  await openGenerate(page);
  const generate = generateFrame(page);
  await generate.locator(".var").nth(1).click();
  await page.screenshot({ path: evidence("06-generate-host-layers.png") });
  await page.getByTestId("generate-apply-layout").click();
  await page.getByTestId("generate-apply-notice").waitFor();
  await page.screenshot({ path: evidence("07-generate-applied.png") });
  await page.getByRole("button", { name: "Publish background layer" }).click();
  await page.getByTestId("artboard").waitFor({ timeout: 120_000 });
  await page.screenshot({ path: evidence("08-generate-background.png") });

  // Compact-width visual inspection.
  await page.setViewportSize({ width: 900, height: 700 });
  await page.getByTestId("tool-shapes").click();
  await waitForShapesReady(page);
  await shapesFrame(page).getByRole("button", { name: "Add Cube" }).click();
  await page.screenshot({ path: evidence("09-shapes-compact.png") });
  await page.getByTestId("shapes-editor").getByRole("button", { name: "Canvas" }).click();
  await page.getByTestId("tool-generate").click();
  await waitForGenerateReady(page);
  await page.screenshot({ path: evidence("10-generate-compact.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
});
