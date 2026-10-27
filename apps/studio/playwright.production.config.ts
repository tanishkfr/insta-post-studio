import { defineConfig, devices } from "@playwright/test";

/**
 * Production-route acceptance. This deliberately runs against the built
 * `apps/studio/dist` bundle via Vite preview so nested `/tools/bend/` assets,
 * dynamic chunks and the bridge hash boot are verified outside dev middleware.
 */
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["bend-production.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4186",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command:
      "npm run preview -- --host 127.0.0.1 --port 4186 --strictPort",
    url: "http://127.0.0.1:4186",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
