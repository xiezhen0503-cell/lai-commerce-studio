import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } }
  ],
  webServer: {
    command: "pnpm --filter @lai/web start",
    url: "http://127.0.0.1:3000/api/v1/health",
    env: {
      LAI_TEXT_PROVIDER: "mock",
      WORKBENCH_ACCESS_TOKEN: "e2e-workbench-access"
    },
    reuseExistingServer: true,
    timeout: 120_000
  }
});
