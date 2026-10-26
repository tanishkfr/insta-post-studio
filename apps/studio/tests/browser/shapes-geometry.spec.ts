import { expect, test } from "./studio-test";
import {
  openShapes,
  readNewestProject,
  readSourceStateRecords,
  shapesFrame,
  waitForStudio,
} from "./studio-helpers";

test("Shapes geometry editing, deformation, duplication and arrays serialize their real state", async ({
  page,
}) => {
  await waitForStudio(page);
  await openShapes(page);
  const frame = shapesFrame(page);
  await frame.getByRole("button", { name: "Add Custom" }).click();
  await expect(frame.locator(".object-name", { hasText: "Custom 1" })).toBeVisible();

  await frame.getByRole("button", { name: "Loop cut" }).click();
  await frame.getByRole("button", { name: "Extrude" }).click();
  await frame.getByRole("button", { name: "Inset" }).click();
  await frame.getByRole("button", { name: "Duplicate" }).click();
  await frame.getByRole("tab", { name: "Modifiers", exact: true }).click();
  const twist = frame.getByLabel("twist");
  await twist.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "36";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  await frame.getByRole("button", { name: "line", exact: true }).click();
  const count = frame.getByLabel("array count");
  await count.fill("4");
  await count.blur();

  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  const project = await readNewestProject(page);
  expect((project?.project.layers as unknown[]).length).toBe(1);
  const source = (await readSourceStateRecords(page)).find((record) => record.tool === "shapes")!;
  const document = JSON.parse(source.content);
  expect(document.document.objects.length).toBeGreaterThanOrEqual(2);
  const custom = document.document.objects.find((object: { kind: string }) => object.kind === "custom");
  expect(custom).toBeTruthy();
  expect(custom.mesh.faces.length).toBeGreaterThan(6);
  const deformed = document.document.objects.find(
    (object: { deform: { twist: number } }) => object.deform.twist === 36,
  );
  expect(deformed).toBeTruthy();
  const arrayed = document.document.objects.find(
    (object: { array: { count: number } | null }) => object.array?.count === 4,
  );
  expect(arrayed).toBeTruthy();
  expect(document.history.past.length).toBeGreaterThan(4);
});
