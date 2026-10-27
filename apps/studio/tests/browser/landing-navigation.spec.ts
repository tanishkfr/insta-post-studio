import { expect, test } from "./studio-test";
import { waitForVectorReady, vectorFrame, openBend, bendFrame } from "./studio-helpers";

test("the cat's tool orbit rotates and opens the selected editor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sound off" }).click();
  await expect(page.getByRole("button", { name: "Sound on" })).toHaveAttribute("aria-pressed", "true");
  const image = page.getByRole("button", { name: "Open Image" });
  const initial = await image.boundingBox();
  await page.getByRole("button", { name: "Rotate tools right" }).click();
  const rotated = await image.boundingBox();
  expect(initial && rotated && Math.abs(initial.x - rotated.x)).toBeGreaterThan(10);
  const orbit = page.locator(".tool-orbit");
  const box = await orbit.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(100, 0);
  await expect.poll(async () => (await image.boundingBox())?.x).not.toBe(rotated?.x);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 100, box!.y + box!.height / 2, { steps: 5 });
  await page.mouse.up();
  const dragged = await image.boundingBox();
  expect(rotated && dragged && Math.abs(rotated.x - dragged.x)).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Open Vector" }).click();
  await expect(page.getByTestId("vector-editor")).toBeVisible();
});

test("landing, history and the empty workspace remain connected", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Less stress/ })).toBeVisible();
  await page.getByRole("button", { name: /Enter Studio/ }).first().click();
  await expect(page.getByTestId("artboard")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show panels" })).toBeVisible();
  await page.getByRole("textbox", { name: "Project name" }).fill("My composition");
  await page.getByRole("textbox", { name: "Project name" }).blur();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", { timeout: 20_000 });
  await page.getByRole("button", { name: "Studio home" }).click();
  await expect(page.getByRole("heading", { name: /Less stress/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("My composition");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("My composition");
});

test("tool tabs retain the active session when departure is declined", async ({ page }) => {
  await page.goto("/#studio");
  await page.getByTestId("tool-vector").click();
  await waitForVectorReady(page);
  await vectorFrame(page).getByRole("button", { name: "Randomise shape" }).click();
  await expect(page.getByText("Unpublished edits")).toBeVisible();
  await page.getByTestId("tool-image").click();
  await expect(page.getByTestId("leave-editor-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByTestId("vector-editor")).toBeVisible();
  await page.getByTestId("tool-image").click();
  await expect(page.getByTestId("leave-editor-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Discard and leave" }).click();
  await expect(page.getByTestId("image-editor")).toBeVisible();
  await expect(page.getByTestId("tool-image")).toHaveAttribute("aria-current", "page");
});

test("the tool rail remains available across the six editors", async ({ page }) => {
  await page.goto("/#studio");
  const tabs = [
    ["image", "image"],
    ["vector", "vector"],
    ["typography", "type"],
    ["shapes", "shapes"],
    ["bend", "bend"],
    ["generate", "generate"],
  ] as const;
  for (const [index, [tab, editor]] of tabs.entries()) {
    await page.getByTestId(`tool-${tab}`).click();
    if (index > 0) {
      await expect(page.getByTestId("leave-editor-dialog")).toBeVisible();
      await page.getByRole("button", { name: "Discard and leave" }).click();
    }
    await expect(page.getByTestId(`${editor}-editor`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`tool-${tab}`)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Studio tools" })).toBeVisible();
    await expect(page.locator(".publish-button")).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByTestId("tool-canvas").click();
  await expect(page.getByTestId("leave-editor-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Discard and leave" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
});

test("Video keeps one editor toolbar and a usable preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#studio");
  await openBend(page);
  const frame = bendFrame(page);
  await expect(page.getByRole("button", { name: "Publish video" })).toBeVisible();
  await expect(page.locator("#studio-session-controls .tool-session-bar")).toBeVisible();
  await expect(page.getByTestId("bend-editor").locator(".tool-session-bar")).toHaveCount(0);
  const canvas = await frame.locator(".canvas-frame").boundingBox();
  const viewport = await frame.locator(".canvas-viewport").boundingBox();
  expect(canvas).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(canvas!.height).toBeGreaterThan(180);
  expect(canvas!.y).toBeGreaterThanOrEqual(viewport!.y - 1);
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
});
