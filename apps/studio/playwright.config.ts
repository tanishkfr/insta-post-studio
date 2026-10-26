import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "node ../../scripts/serve-static.mjs tests/fixtures/fake-tool 4189",
      url: "http://127.0.0.1:4189/fake-adapter.html",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "node ../../scripts/serve-static.mjs ../../tools/legacy 4187",
      url: "http://127.0.0.1:4187/vector/arnav.html",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
