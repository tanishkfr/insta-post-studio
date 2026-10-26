import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BEND_DEPLOY_URL;
if (!baseURL) throw new Error("BEND_DEPLOY_URL is required for deployed acceptance tests.");
const hostname = new URL(baseURL).hostname;
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname) && process.env.BEND_ALLOW_LOCAL !== "1") {
  throw new Error("The deployed suite refuses a localhost origin. Set BEND_ALLOW_LOCAL=1 only for an explicit local production-preview run.");
}
if (!baseURL.startsWith("https://") && process.env.BEND_ALLOW_LOCAL !== "1") {
  throw new Error("Deployed acceptance tests require an HTTPS origin.");
}

const bypass = process.env.BEND_VERCEL_BYPASS?.trim();
if (!bypass) {
  console.warn("[BEND deployed tests] BEND_VERCEL_BYPASS is not set. Protected preview deployments will redirect to Vercel Authentication.");
}
const chromeChannel = process.env.BEND_BUNDLED_CHROMIUM === "1" ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./tests/deployed",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "output/playwright/deployed-results.json" }],
    ["html", { outputFolder: "output/playwright/deployed-report", open: "never" }],
  ],
  use: {
    baseURL,
    acceptDownloads: true,
    trace: process.env.BEND_TRACE === "1" ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
    video: process.env.BEND_VIDEO === "1" ? "retain-on-failure" : "off",
  },
  metadata: {
    deployment: baseURL,
    sourceDigest: process.env.BEND_SOURCE_DIGEST ?? null,
    testedAt: new Date().toISOString(),
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], ...chromeChannel },
    },
    {
      name: "edge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
      grep: /@smoke/,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      grep: /@smoke/,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grep: /@smoke/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
});
