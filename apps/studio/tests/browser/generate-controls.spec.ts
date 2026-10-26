import { expect, test } from "./studio-test";
import {
  generateFrame,
  openGenerate,
  openVector,
  publishActiveTool,
  readNewestProject,
  selectLayer,
  waitForGenerateReady,
  waitForStudio,
} from "./studio-helpers";

test("original Generate controls, static presets, carousel, Claude fallback and seed determinism remain intact", async ({
  page,
}) => {
  await waitForStudio(page);
  await openVector(page);
  await publishActiveTool(page);
  await openGenerate(page);
  const frame = generateFrame(page);
  await expect(frame.locator("#ct select")).toHaveCount(12);
  await expect(frame.locator(".var")).toHaveCount(3);

  // Layout style changes the generated alternatives.
  await frame.locator('#ct select[data-c="layout"]').selectOption("Grid-based");
  await expect(frame.locator(".var").first()).toContainText("Grid-based", {
    timeout: 10_000,
  });

  // Static curated presets still ignore the controls and render.
  await frame.locator("#mode").getByRole("button", { name: "Static" }).click();
  await expect(frame.locator("#st")).toContainText("Static mode", { timeout: 10_000 });
  await expect(frame.locator(".var")).toHaveCount(3);

  // Claude mode remains environment-dependent and falls back to rules.
  await frame.locator("#mode").getByRole("button", { name: "Claude" }).click();
  await expect(frame.locator("#st")).toContainText("Claude mode failed", { timeout: 10_000 });
  await expect(frame.locator(".var")).toHaveCount(3);

  // Rule-based carousel controls still generate per-slide arrangements.
  await frame.locator("#mode").getByRole("button", { name: "Rule-based" }).click();
  await frame.locator("#fmt").getByRole("button", { name: "Carousel" }).click();
  await frame.locator("#ns").selectOption("2");
  await expect(frame.locator(".var .slide")).toHaveCount(6, { timeout: 10_000 });
  await frame.locator("#fmt").getByRole("button", { name: "Single post" }).click();
  await expect(frame.locator(".var .slide")).toHaveCount(3, { timeout: 10_000 });

  // The original native asset bin remains usable alongside Studio layers.
  const rowsBefore = await frame.locator("#al .as").count();
  await frame.getByRole("button", { name: "+ Text" }).click();
  await expect(frame.locator("#al .as")).toHaveCount(rowsBefore + 1);

  // Regeneration changes the seed and produces a different deterministic
  // arrangement. Reopening the exact seed/state is covered by the round-trip
  // test, which compares the restored variations byte-for-byte.
  const serialize = async () => {
    const content = await frame.locator("body").evaluate(() => {
      const bridge = (
        window as unknown as {
          __STUDIO_GENERATE_BRIDGE__?: {
            serializeSourceState: () => { content: string };
          };
        }
      ).__STUDIO_GENERATE_BRIDGE__;
      return bridge?.serializeSourceState().content ?? "";
    });
    return JSON.parse(content);
  };
  const before = await serialize();
  await frame.getByRole("button", { name: "Regenerate" }).click();
  await expect
    .poll(async () => (await serialize()).seed)
    .not.toBe(before.seed);
  const after = await serialize();
  expect(JSON.stringify(after.variations)).not.toBe(JSON.stringify(before.variations));

  // Native +Text assets survive source storage and reopen beside host layers.
  await page.getByRole("button", { name: "Publish background layer" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 120_000 });
  const published = await readNewestProject(page);
  const generated = (published?.project.layers as Array<Record<string, unknown>>).find(
    (layer) => layer.sourceTool === "generate",
  )!;
  await page.reload();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 20_000 });
  await selectLayer(page, String(generated.id));
  await page.getByTestId("inspector-edit-generate").click();
  await waitForGenerateReady(page);
  await expect(frame.locator('#al input[type="text"]').last()).toHaveValue("New text");
});
