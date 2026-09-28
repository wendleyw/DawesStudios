import { expect, test, type Page } from "@playwright/test";
import { credentials, localAdmin, screenshotDirectory, signIn } from "./test-support";

type MotionWindow = typeof window & { identityMoves: { from: string; duration: number }[] };

async function observeMotion(page: Page) {
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    (window as MotionWindow).identityMoves = [];
    Element.prototype.animate = function (...args: Parameters<Element["animate"]>) {
      const animation = original.apply(this, args);
      if (this.matches(".board-identity-logo")) {
        const effect = animation.effect as KeyframeEffect;
        (window as MotionWindow).identityMoves.push({
          from: String(effect.getKeyframes()[0].transform),
          duration: Number(effect.getTiming().duration),
        });
      }
      return animation;
    };
  });
}

const motionCount = (page: Page) =>
  page.evaluate(() => (window as MotionWindow).identityMoves.length);
async function settledLogo(page: Page) {
  const logo = page.locator("main .board-identity-logo");
  await expect(logo).toHaveCount(1);
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((node) => node.getAnimations().length)).toBe(0);
  return logo;
}

for (const setup of [
  { role: "client" as const, width: 1600, height: 1000 },
  { role: "agency" as const, width: 390, height: 844 },
]) {
  test(`${setup.role} moves one client logo between Overview and navigation at ${setup.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: setup.width, height: setup.height });
    await observeMotion(page);
    const client = (await localAdmin.from("clients").select("id").eq("slug", "sabre").single())
      .data!;
    await signIn(page, credentials[setup.role]);
    if (setup.role === "agency") await page.goto(`/clients/${client.id}/overview`);
    const welcome = page.locator(".overview-welcome");
    await expect(welcome.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back/);
    await expect(welcome.getByRole("img", { name: "SABRE" })).toBeVisible();
    await expect(welcome.locator("time")).toContainText(
      /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/,
    );
    await expect(page.locator(".board-header .board-identity-logo")).toHaveCount(0);
    await settledLogo(page);
    await page.screenshot({ path: `${screenshotDirectory}/overview-identity-${setup.width}.png` });

    const nav = page.getByRole("navigation", { name: "SABRE navigation" });
    const board = nav.locator('a[href$="/board"]');
    await board.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/clients/${client.id}/board$`));
    await expect.poll(() => motionCount(page)).toBe(1);
    const navigationLogo = await settledLogo(page);
    await expect(page.locator(".overview-welcome")).toHaveCount(0);
    const logoBox = (await navigationLogo.boundingBox())!;
    const menuBox = (await page.locator(".board-identity").boundingBox())!;
    expect(logoBox.x).toBeGreaterThanOrEqual(menuBox.x);
    expect(logoBox.y).toBeGreaterThanOrEqual(menuBox.y);
    expect(logoBox.y + logoBox.height).toBeLessThanOrEqual(menuBox.y + menuBox.height);
    await page.screenshot({
      path: `${screenshotDirectory}/overview-identity-docked-${setup.width}.png`,
    });

    await page.goBack();
    await expect(welcome).toBeVisible();
    await expect.poll(() => motionCount(page)).toBe(2);
    await settledLogo(page);
    // Another destination uses the same docking behavior; its logo returns to Overview.
    await nav.getByRole("link", { name: "Reviews", exact: true }).click();
    await expect.poll(() => motionCount(page)).toBe(3);
    await (await settledLogo(page)).click();
    await expect(welcome).toBeVisible();
    await expect.poll(() => motionCount(page)).toBe(4);
    await settledLogo(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const moves = await page.evaluate(() => (window as MotionWindow).identityMoves);
    expect(moves.every((move) => move.duration > 0 && move.from !== "none")).toBe(true);
  });
}

test("reduced motion and direct visits retain one correctly placed logo", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await observeMotion(page);
  const client = (await localAdmin.from("clients").select("id").eq("slug", "sabre").single()).data!;
  await signIn(page, credentials.client);
  await expect(page.locator(".overview-welcome .board-identity-logo")).toBeVisible();
  await page
    .getByRole("navigation", { name: "SABRE navigation" })
    .getByRole("link", { name: "Briefings", exact: true })
    .click();
  await settledLogo(page);
  await expect(page.locator(".board-header .board-identity-logo")).toBeVisible();
  expect(await motionCount(page)).toBe(0);
  await (await settledLogo(page)).click();
  await expect(page.locator(".overview-welcome .board-identity-logo")).toBeVisible();
  await settledLogo(page);
  expect(await motionCount(page)).toBe(0);
  await page.goto(`/clients/${client.id}/board`);
  await settledLogo(page);
  await expect(page.locator(".board-header .board-identity-logo")).toBeVisible();
  expect(await motionCount(page)).toBe(0);
});
