import { expect, test } from "./studio-test";
import {
  layerIds,
  openVector,
  publishVector,
  selectLayer,
  waitForStudio,
} from "./studio-helpers";

test("contextual handoffs focus the first option, support arrow keys and return focus on Escape", async ({
  page,
}) => {
  await waitForStudio(page);
  await openVector(page);
  await publishVector(page);
  const layerId = (await layerIds(page))[0];

  await selectLayer(page, layerId);
  const trigger = page.getByRole("button", { name: "Continue in…" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const first = page.getByTestId("animate-in-bend");
  await expect(first).toBeFocused();
  const menuBox = await page.locator("#p5a-continue-options").boundingBox();
  const viewport = page.viewportSize()!;
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThanOrEqual(0);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height);

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /Generate layouts/ })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});
