import { expect, test, openDisclosure, openStudio } from "./helpers";

test.describe("local host reference harness", () => {
  test("round-trips a BEND layer through the local host while preserving host-owned placement @full @host", async ({ page }) => {
    await page.goto("/integration", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Place BEND inside the post\./ })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Add BEND layer" }).click();
    const row = page.locator(".host-layer-row").first();
    await expect(row.getByRole("button", { name: "Edit in BEND" })).toBeVisible({ timeout: 120_000 });
    const initialVersion = await row.getAttribute("data-source-version");
    expect(initialVersion).toBeTruthy();

    await page.getByLabel("X position").fill("120");
    await page.getByLabel("Y position").fill("-80");
    await page.getByLabel("Opacity").fill("0.72");
    await page.locator("#host-playback").selectOption("hold-last-frame");
    await page.getByRole("button", { name: "Raise BEND layer" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row).toHaveAttribute("data-stacking-order", "1");

    await row.getByRole("button", { name: "Edit in BEND" }).click();
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Host edit")).toBeVisible();
    await openDisclosure(page, "Mask");
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse", exact: true }).click();
    await page.getByRole("button", { name: "Update Post" }).click();
    await expect(page.getByRole("heading", { name: /Place BEND inside the post\./ })).toBeVisible({ timeout: 180_000 });
    const updatedRow = page.locator(".host-layer-row").first();
    await expect(updatedRow.getByRole("button", { name: "Edit in BEND" })).toBeVisible({ timeout: 120_000 });
    const nextVersion = await updatedRow.getAttribute("data-source-version");
    expect(nextVersion).toBeTruthy();
    expect(nextVersion).not.toBe(initialVersion);
    await expect(updatedRow).toHaveAttribute("data-stacking-order", "1");
    await expect(page.getByLabel("X position")).toHaveValue("120");
    await expect(page.getByLabel("Y position")).toHaveValue("-80");
    await expect(page.getByLabel("Opacity")).toHaveValue("0.72");
    await expect(page.locator("#host-playback")).toHaveValue("hold-last-frame");
    await expect(page.locator(".host-foreground")).toContainText("foreground / host layer");
    await page.screenshot({ path: "output/evidence/phase7-0/deployed-tests/host-roundtrip.png", fullPage: true });
  });
});
