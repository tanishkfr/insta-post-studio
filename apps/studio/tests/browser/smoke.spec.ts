import { expect, test } from "./studio-test";

test("Studio shell exposes an empty persisted canvas and Image/Vector/Type entries", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Untitled Project",
  );
  await expect(page.getByRole("heading", { name: "Canvas workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Layers", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inspector", exact: true })).toBeVisible();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");
  await expect(page.getByRole("combobox", { name: "Project format" })).toHaveValue(
    "instagram-square",
  );
  await expect(page.getByTestId("tool-vector")).toBeEnabled();
  await expect(page.getByTestId("tool-image")).toBeEnabled();
  await expect(page.getByTestId("tool-typography")).toBeEnabled();
  await expect(page.getByTestId("tool-shapes")).toBeEnabled();
  await expect(page.getByTestId("tool-generate")).toBeEnabled();
  await expect(page.getByTestId("tool-bend")).toBeDisabled();
  await expect(page.getByText("No layers yet")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          document.documentElement.scrollHeight <= window.innerHeight + 1,
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "Instrument Sans Variable"')))
    .toBe(true);

  await page.getByTestId("tool-vector").click();
  await expect(page.getByTestId("vector-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to composition" })).toBeEnabled({
    timeout: 20_000,
  });
  const frame = page.frameLocator('iframe[title="Vector editor"]');
  await expect(frame.getByRole("button", { name: "Randomise shape" })).toBeVisible();
  for (const selector of [
    "#imp",
    "#tUndo",
    "#tRedo",
    "#tCopy",
    "#tArea",
    "#tCut",
    "#tPaste",
    "#tDup",
    "#tDel",
    "#tAll",
    "#tSnap",
    "#svg",
    "#png",
    "#cs",
    "#cj",
    "#lj",
  ]) {
    await expect(frame.locator(selector)).toBeAttached();
  }
  await expect(frame.locator("#modes button")).toHaveCount(3);
  await expect(frame.locator("#presets button")).toHaveCount(4);
  await expect(frame.locator("#palettes button")).toHaveCount(4);
  await expect(frame.getByRole("tab", { name: "Generate" })).toBeVisible();
  await expect(frame.getByRole("tab", { name: "Edit" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          document.documentElement.scrollHeight <= window.innerHeight + 1,
      ),
    )
    .toBe(true);
});

test("preserved standalone Vector baseline still loads", async ({ page }) => {
  await page.goto("http://127.0.0.1:4187/vector/arnav.html");
  await expect(page.getByRole("button", { name: "Randomise shape" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export SVG" })).toBeVisible();
  await expect(page.locator("#stage svg [data-i]").first()).toBeVisible();
  await page.getByRole("button", { name: "Randomise shape" }).click();
  await expect(page.locator("#stage svg [data-i]").first()).toBeVisible();
});

test("preserved standalone Generate baseline still loads and regenerates", async ({ page }) => {
  await page.goto("http://127.0.0.1:4187/generate/generator.html");
  await expect(page.getByRole("heading", { name: "Generative Art" })).toBeVisible();
  await expect(page.locator(".var")).toHaveCount(3);
  await expect(page.locator("#al .as")).toHaveCount(6);
  await expect(page.locator("#ct select")).toHaveCount(12);
  const first = await page.locator(".var").first().innerText();
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.locator(".var")).toHaveCount(3);
  expect(await page.locator(".var").first().innerText()).not.toBe("");
  void first;
});

test("independently bundled Shapes baseline still loads without Studio boot config", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4175/tools/shapes/index.html");
  await expect(page.getByRole("heading", { name: "shapes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Cube" })).toBeVisible();
  await expect(page.locator("#studioShapesBridgeReady")).toHaveCount(0);
});
