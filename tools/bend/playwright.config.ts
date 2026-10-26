import { defineConfig, devices } from "@playwright/test";

const testPort = Number.parseInt(process.env.BEND_TEST_PORT ?? "5181", 10);
const testBaseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["studio2.spec.ts", "capabilities.spec.ts", "phase8.spec.ts", "phase81.spec.ts"],
  fullyParallel: false,
  timeout: 60_000,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  use: {
    baseURL: testBaseURL,
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${testPort}`,
    url: testBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
