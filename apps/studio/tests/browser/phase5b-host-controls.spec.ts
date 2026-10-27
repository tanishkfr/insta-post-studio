import { expect, test } from "./studio-test";
import { chooseFormat, waitForStudio } from "./studio-helpers";

test("project name, format, save and reload stay authoritative through the host header", async ({
  page,
}) => {
  await waitForStudio(page);

  const name = page.getByRole("textbox", { name: "Project name" });
  await name.fill("Phase 5B Campaign");
  await name.press("Enter");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await chooseFormat(page, "instagram-story");
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toContainText("Saved locally");

  await page.reload();
  await expect(name).toHaveValue("Phase 5B Campaign", { timeout: 20_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 20_000,
  });
  await expect(page.getByRole("combobox", { name: "Project format" })).toHaveValue(
    "instagram-story",
  );
  await expect(page.locator(".artboard-ruler")).toContainText("1080 × 1920");

  const canvas = page.getByTestId("tool-canvas");
  await canvas.focus();
  await expect(canvas).toBeFocused();
  const focusOutline = await canvas.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focusOutline).toEqual({ style: "solid", width: "2px" });
});
