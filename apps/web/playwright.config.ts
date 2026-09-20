import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 10_000,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        actionTimeout: 10_000,
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
      },
    },
  ],
});
