import { expect, test } from "./studio-test";
import path from "node:path";
import {
  cancelVector,
  openVector,
  openVectorForLayer,
  publishVector,
  saveStudio,
  selectLayer,
  vectorFrame,
  waitForStudio,
} from "./studio-helpers";

const evidence = (name: string) =>
  path.resolve(process.cwd(), "../../docs/evidence/phase-1", name);

test("manually baked Vector artwork restores as editable lines", async ({ page }) => {
  await waitForStudio(page);
  await openVector(page);
  const frame = vectorFrame(page);

  await frame.getByRole("tab", { name: "Edit" }).click();
  await frame.getByRole("button", { name: "Make editable" }).click();
  await expect(frame.getByText("Editable lines", { exact: false })).toBeVisible();
  const beforeCount = await frame.locator("#meta").innerText();
  expect(beforeCount).toContain("62 lines");

  await frame.locator("#tAll").click();
  await frame.locator("#tDup").click();
  await expect(frame.locator("#meta")).toContainText("124 lines");
  await expect(frame.getByText("124 lines are now yours to edit.")).toBeVisible();
  await page.screenshot({ path: evidence("05-baked-vector-editor.png") });

  await publishVector(page);
  const layerId = (await page.locator(".canvas-layer").first().getAttribute("data-layer-id"))!;
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await saveStudio(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
  await selectLayer(page, layerId);
  await openVectorForLayer(page, layerId);
  await expect(frame.getByText("Editable lines", { exact: false })).toBeVisible();
  await expect(frame.locator("#meta")).toContainText("124 lines");
  await expect(frame.getByRole("tab", { name: "Edit" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(frame.getByText(/lines are now yours to edit/)).toBeVisible();
  await page.screenshot({ path: evidence("06-baked-source-reopened.png") });

  await cancelVector(page);
  await expect(page.getByTestId("canvas-layer")).toHaveCount(1);
});
