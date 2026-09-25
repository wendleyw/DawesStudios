import { test as base, expect } from "@playwright/test";
import { createPlaygroundFixture } from "./playground-fixture";
import { credentials, signIn } from "./test-support";

const test = base.extend<{ workspace: Awaited<ReturnType<typeof createPlaygroundFixture>> }>({
  workspace: async ({}, runWithFixture) => {
    const workspace = await createPlaygroundFixture();
    try {
      await runWithFixture(workspace);
    } finally {
      await workspace.cleanup();
    }
  },
});

/** `--background` in each theme, as the browser computes it on `<html>`. */
const darkPage = "rgb(19, 20, 22)";
const lightPage = "rgb(247, 248, 250)";
const rootBackground = () => getComputedStyle(document.documentElement).backgroundColor;

test("a saved theme is on the page before any script bundle runs", async ({ page }) => {
  await signIn(page, credentials.agency);
  const toggle = page.getByRole("button", { name: /^Theme: / });
  await expect(toggle).toHaveAccessibleName("Theme: System");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: Light");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Hold every script bundle, so what follows comes from the server HTML and the head script alone.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const bundle = (url: URL) =>
    url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js");
  await page.route(bundle, async (route) => {
    await held;
    // Unrouting below can finalize a still-queued request (for example one waiting behind
    // Chromium's per-origin connection limit) before this call reaches it; that request already
    // proceeded, so the resulting "Route is already handled" is benign here.
    await route.continue().catch(() => {});
  });
  await page.reload({ waitUntil: "commit" });
  await page.waitForFunction(() => document.body !== null);
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).backgroundColor !== "rgba(0, 0, 0, 0)",
  );
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(rootBackground)).toBe(darkPage);
  release();
  await page.unroute(bundle);
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();
});

test("System follows the operating system's colour scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect.poll(() => page.evaluate(rootBackground)).toBe(darkPage);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => page.evaluate(rootBackground)).toBe(lightPage);
});

test("the project canvas takes the dark canvas colour", async ({ page, workspace }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${workspace.projectId}`);
  const background = page.locator(".project-canvas .react-flow__background");
  await expect(background).toBeVisible();
  expect(await background.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    darkPage,
  );
});
