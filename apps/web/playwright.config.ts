import { defineConfig, devices } from "@playwright/test";
const enabledBrowsers = (process.env.PLAYWRIGHT_BROWSERS ?? "chromium")
  .split(",")
  .map((browser) => browser.trim());
const browserDevices = {
  chromium: "Desktop Chrome",
  firefox: "Desktop Firefox",
  webkit: "Desktop Safari",
} as const;
if (enabledBrowsers.some((browser) => !Object.hasOwn(browserDevices, browser)))
  throw new Error("PLAYWRIGHT_BROWSERS must contain chromium, firefox or webkit.");

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
  projects: [...new Set(enabledBrowsers)].map((name) => ({
    name,
    use: {
      ...devices[browserDevices[name as keyof typeof browserDevices]],
      viewport: { width: 1600, height: 1000 },
    },
  })),
});
