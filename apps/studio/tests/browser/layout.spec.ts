import { expect, test } from "./studio-test";
import {
  imageFrame,
  openImage,
  openType,
  typeFrame,
  waitForStudio,
} from "./studio-helpers";

function noHostOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <= window.innerWidth + 1 &&
      document.documentElement.scrollHeight <= window.innerHeight + 1,
  );
}

test("Image and Type sessions remain usable at narrower desktop widths", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await waitForStudio(page);
  await openImage(page);
  await expect(page.getByTestId("tool-canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add to composition|Update layer/ }),
  ).toBeVisible();
  await expect(imageFrame(page).getByRole("button", { name: "Upload photo" })).toBeVisible();
  await expect.poll(() => noHostOverflow(page)).toBe(true);
  await page.getByTestId("image-editor").getByRole("button", { name: "Canvas" }).click();

  await page.setViewportSize({ width: 900, height: 700 });
  await openType(page);
  await expect(page.getByTestId("tool-canvas")).toBeVisible();
  await expect(page.getByTestId("type-mode-library")).toBeVisible();
  await expect(page.getByTestId("type-mode-custom")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add to composition|Update layer/ }),
  ).toBeVisible();
  await expect(typeFrame(page).locator("#text")).toBeVisible();
  await expect.poll(() => noHostOverflow(page)).toBe(true);
  await page.getByTestId("type-editor").getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible();
});
