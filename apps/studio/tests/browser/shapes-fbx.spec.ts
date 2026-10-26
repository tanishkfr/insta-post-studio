import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "./studio-test";
import {
  openShapes,
  publishActiveTool,
  readNewestProject,
  readSourceStateRecords,
  shapesFrame,
  waitForStudio,
} from "./studio-helpers";

test("Shapes FBX import accepts a known mesh fixture and serializes its triangles", async ({
  page,
}) => {
  await waitForStudio(page);
  await openShapes(page);
  const fixturePath = fileURLToPath(
    new URL("../../../../tools/shapes/src/editor/fixtures/cube-ascii.fbx", import.meta.url),
  );
  const frame = shapesFrame(page);
  await frame.getByLabel("Add FBX").setInputFiles({
    name: "cube-ascii.fbx",
    mimeType: "application/octet-stream",
    buffer: readFileSync(fixturePath),
  });
  await expect(frame.locator(".object-name", { hasText: "cube-ascii" })).toBeVisible();
  await page.getByRole("button", { name: "Publish transparent Shapes" }).click();
  await expect(page.getByTestId("artboard")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("save-state")).toContainText("Saved locally", {
    timeout: 30_000,
  });

  const project = await readNewestProject(page);
  const layer = (project?.project.layers as Array<Record<string, unknown>>)[0];
  expect(layer.kind).toBe("shapes");
  const source = (await readSourceStateRecords(page)).find((record) => record.tool === "shapes")!;
  const document = JSON.parse(source.content);
  expect(document.document.objects).toHaveLength(1);
  const object = document.document.objects[0];
  expect(object.kind).toBe("fbx");
  expect(object.triangles.positions.length).toBeGreaterThanOrEqual(9);
  expect(object.triangles.indices.length).toBeGreaterThanOrEqual(3);
  expect(object.mesh).toBeNull();
});
