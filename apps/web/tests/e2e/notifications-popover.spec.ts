import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createPlaygroundFixture } from "./playground-fixture";
import { credentials, localAdmin, localAgency, screenshotDirectory, signIn } from "./test-support";

test("account notifications open below the profile, persist read state and dismiss accessibly", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  const owner = await agency.auth.getUser();
  const id = randomUUID();
  const title = `Review ready ${id.slice(0, 8)}`;
  try {
    expect(
      (
        await localAdmin.from("notifications").insert({
          id,
          user_id: owner.data.user!.id,
          client_id: fixture.clientId,
          project_id: fixture.projectId,
          title,
          body: "Your campaign artwork is ready. Open the project to review the details and share feedback.",
        })
      ).error,
    ).toBeNull();
    await signIn(page, credentials.agency);
    for (const [width, height] of [
      [1600, 1000],
      [1024, 700],
      [390, 844],
      [320, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/projects/${fixture.projectId}`);
      const bell = page.getByRole("button", { name: /^Notifications/ });
      await expect(page.locator(".notifications-bell")).toHaveCount(1);
      await expect(bell).toBeVisible();
      expect(
        await page.locator(".board-account").evaluate((element) => {
          const bell = element.querySelector(".notifications-bell")!.getBoundingClientRect();
          const profile = element.querySelector(".board-profile")!.getBoundingClientRect();
          // Same row: the ringed avatar is taller than the bell, so compare vertical centres.
          const centre = (rect: DOMRect) => rect.top + rect.height / 2;
          return bell.right <= profile.left && Math.abs(centre(bell) - centre(profile)) < 3;
        }),
      ).toBe(true);
      await bell.click();
      const popover = page.getByRole("dialog", { name: "Notifications", exact: true });
      await expect(popover).toBeVisible();
      await expect(popover.getByRole("button", { name: "Close notifications" })).toBeFocused();
      await expect(popover.getByRole("heading", { name: title })).toBeVisible();
      await expect
        .poll(() =>
          popover.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const account = document.querySelector(".board-account")!.getBoundingClientRect();
            return (
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= account.bottom &&
              rect.bottom <= innerHeight
            );
          }),
        )
        .toBe(true);
      await popover.evaluate((element) =>
        Promise.all(element.getAnimations().map((animation) => animation.finished)),
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `${screenshotDirectory}/notifications-popover-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(popover).not.toBeVisible();
      await expect(bell).toBeFocused();
      await bell.click();
      // The viewport edge is outside the popup at every tested size.
      await page.mouse.click(3, 3);
      await expect(popover).not.toBeVisible();
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    for (const route of [
      `/clients/${fixture.clientId}/board`,
      `/clients/${fixture.clientId}/brand/assets`,
    ]) {
      await page.goto(route);
      await expect(page.locator(".notifications-bell")).toHaveCount(1);
      await page.getByRole("button", { name: /^Notifications/ }).click();
      await expect(page.getByRole("dialog", { name: "Notifications", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const popover = page.getByRole("dialog", { name: "Notifications", exact: true });
    expect(await popover.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      "none",
    );
    await popover.getByRole("button", { name: `Mark ${title} as read`, exact: true }).click();
    await expect(
      popover.getByRole("button", { name: `Mark ${title} as read`, exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await expect(popover.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      popover.getByRole("button", { name: `Mark ${title} as read`, exact: true }),
    ).toHaveCount(0);
    await popover.getByRole("link", { name: `Open project for ${title}`, exact: true }).click();
    await expect(page).toHaveURL(`/projects/${fixture.projectId}`);
    await expect(popover).not.toBeVisible();
  } finally {
    expect((await localAdmin.from("notifications").delete().eq("id", id)).error).toBeNull();
    await fixture.cleanup();
    await agency.auth.signOut();
  }
});
