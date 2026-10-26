import { expect, test } from "./helpers";

test.describe("deployed routing and static delivery", () => {
  test("serves every supported route directly and survives refresh @smoke", async ({ page }) => {
    const routes = [
      { path: "/studio", heading: /BEND editor:/ },
      { path: "/studio/edit", heading: /BEND editor:/ },
      { path: "/integration", heading: /Place BEND inside the post\./ },
    ];

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible({ timeout: 45_000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible({ timeout: 45_000 });
      await expect(page).toHaveURL(new RegExp(`${route.path.replace("/", "\\/")}(\\?|$)`));
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
  });

  test("returns a real 404 instead of HTML for missing static files and unknown paths @smoke", async ({ context, baseURL }) => {
    for (const path of ["/assets/phase7-does-not-exist.js", "/phase7-does-not-exist"]) {
      const response = await context.request.get(`${baseURL}${path}`, { failOnStatusCode: false });
      expect(response.status(), path).toBe(404);
      expect(response.headers()["content-type"], path).toContain("text/plain");
      const body = await response.text();
      expect(body, path).not.toContain("<!doctype html");
    }
  });

  test("sets correct MIME types and immutable caching for generated assets @smoke", async ({ context, baseURL }) => {
    const response = await context.request.get(`${baseURL}/studio`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    const html = await response.text();
    const assetPaths = [...new Set([
      ...Array.from(html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g), (match) => match[1]),
    ].filter((path): path is string => Boolean(path)))];
    expect(assetPaths.length).toBeGreaterThan(0);
    for (const assetPath of assetPaths) {
      const asset = await context.request.get(new URL(assetPath, baseURL).toString());
      expect(asset.status(), assetPath).toBe(200);
      expect(asset.headers()["content-type"], assetPath).toMatch(assetPath.endsWith(".css") ? /text\/css/ : /javascript/);
      expect(asset.headers()["cache-control"], assetPath).toContain("immutable");
      expect(asset.headers()["x-content-type-options"], assetPath).toBe("nosniff");
    }
  });

  test("loads no assets from localhost or an unexpected third party @smoke", async ({ page, baseURL }) => {
    const unexpected: string[] = [];
    const failed: string[] = [];
    const origin = new URL(baseURL!).origin;
    page.on("request", (request) => {
      const url = request.url();
      if (!/^https?:/.test(url)) return;
      const requestOrigin = new URL(url).origin;
      // The preview platform injects its live toolbar. A local antivirus
      // browser extension is outside the application and is recorded rather
      // than treated as a BEND dependency. The application itself must use
      // only its deployed origin.
      if (/vercel\.live$/.test(new URL(url).hostname) || /kaspersky-labs\.com$/.test(new URL(url).hostname)) return;
      if (requestOrigin !== origin) unexpected.push(url);
    });
    page.on("response", (response) => {
      if (response.url().startsWith(origin) && response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });
    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /BEND editor:/ })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".canvas-frame canvas")).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1_000);
    expect(unexpected.filter((url) => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url)), "localhost dependencies").toEqual([]);
    expect(unexpected, "non-allowlisted third-party origins").toEqual([]);
    expect(failed, "failed same-origin responses").toEqual([]);
  });
});
