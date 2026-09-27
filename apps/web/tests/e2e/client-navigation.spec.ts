import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  credentials,
  localAgency,
  boardLink,
  openBoardSearch,
  screenshotDirectory,
  signIn,
} from "./test-support";

test("the client switcher searches authorized workspaces and keeps one navigation context", async ({
  page,
}) => {
  await signIn(page, credentials.agency);
  const caller = await localAgency();
  const clients = await caller
    .from("clients")
    .select("id,name")
    .eq("archived", false)
    .order("name");
  expect(clients.error).toBeNull();
  const sabre = clients.data!.find((client) => client.name === "SABRE")!;
  const other = clients.data!.find((client) => client.id !== sabre.id)!;
  await page.getByRole("button", { name: "Select a client", exact: true }).click();
  const panel = page.getByRole("region", { name: "Choose a client", exact: true });
  const search = page.getByRole("textbox", { name: "Find a client", exact: true });
  await expect(search).toBeFocused();
  await expect(panel.getByRole("link")).toHaveCount(clients.data!.length);
  await search.fill("no such workspace");
  await expect(panel.getByText("No clients found.")).toBeVisible();
  await search.fill("sAbRe");
  await expect(panel.getByRole("link")).toHaveCount(1);
  await search.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/clients/${sabre.id}/board`);
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "SABRE navigation", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar .client-navigation")).toHaveCount(0);
  await page.screenshot({ path: `${screenshotDirectory}/sidebar-client-desktop.png` });

  const trigger = page.getByRole("button", { name: "Switch client: SABRE", exact: true });
  await trigger.click();
  await expect(search).toHaveValue("");
  await page.screenshot({ path: `${screenshotDirectory}/sidebar-client-picker.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await search.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await search.fill(other.name);
  await panel.getByRole("link", { name: other.name, exact: true }).click();
  await expect(page).toHaveURL(`/clients/${other.id}/board`);
  await expect(
    page.getByRole("navigation", { name: `${other.name} navigation`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "SABRE navigation", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Brand Hub", exact: true }).click();
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.getByRole("link", { name: "Brand Hub", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Switch client: ${other.name}`, exact: true }).click();
  await expect(search).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${screenshotDirectory}/sidebar-client-collapsed.png` });
});

test("mobile client switching contains focus and a single-client account needs no picker", async ({
  page,
}) => {
  await signIn(page, credentials.agency);
  for (const [width, height] of [
    [390, 844],
    [320, 640],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation", exact: true });
    const trigger = drawer.getByRole("button", { name: "Select a client", exact: true });
    await trigger.click();
    const search = drawer.getByRole("textbox", { name: "Find a client", exact: true });
    await expect(search).toBeFocused();
    const panel = drawer.getByRole("region", { name: "Choose a client", exact: true });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `${screenshotDirectory}/sidebar-client-mobile-${width}.png` });
    await search.press("Escape");
    await expect(drawer).toBeVisible();
    await expect(trigger).toBeFocused();
    const signOut = drawer.getByRole("button", { name: "Sign out", exact: true });
    await signOut.scrollIntoViewIfNeeded();
    await expect(signOut).toBeInViewport();
    await trigger.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, credentials.client);
  await expect(page.getByRole("link", { name: "SABRE workspace", exact: true })).toBeVisible();
  await expect(page.locator(".client-switcher button")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "SABRE navigation", exact: true }).getByRole("link"),
  ).toHaveCount(5);
});

test("client links stay visible at the top across pages without duplicating sidebar navigation", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, credentials.agency);
  const caller = await localAgency();
  const result = await caller.from("clients").select("id").eq("slug", "sabre").single();
  expect(result.error).toBeNull();
  await page.goto(`/clients/${result.data!.id}/board`);
  const menu = page.getByRole("navigation", { name: "SABRE navigation", exact: true });
  for (const [width, height] of [
    [1440, 900],
    [1024, 600],
    [390, 844],
    [320, 640],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(menu.getByRole("link", { name: boardLink })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(menu.getByRole("link")).toHaveCount(5);
    await expect(menu.getByRole("link", { name: "Studio settings", exact: true })).toHaveCount(0);
    await expect
      .poll(() =>
        menu.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.bottom <= innerHeight &&
            element.scrollHeight <= element.clientHeight &&
            element.scrollWidth <= element.clientWidth
          );
        }),
      )
      .toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `${screenshotDirectory}/board-client-menu-${width}.png` });
    if (width <= 900)
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const sidebar = page.locator(".sidebar");
    await expect
      .poll(() => sidebar.evaluate((element) => Math.abs(element.getBoundingClientRect().left)))
      .toBeLessThan(1);
    await expect(sidebar.getByRole("link", { name: "Studio settings", exact: true })).toBeVisible();
    await expect(sidebar.locator(".client-navigation")).toHaveCount(0);
    await expect
      .poll(() =>
        sidebar.evaluate((element) => {
          const nav = element.querySelector('nav[aria-label="Main navigation"]')!;
          return (
            element.scrollHeight <= element.clientHeight + 1 &&
            nav.scrollHeight <= nav.clientHeight + 1
          );
        }),
      )
      .toBe(true);
    await expect(sidebar.getByRole("button", { name: "Sign out", exact: true })).toBeInViewport();
    await page.screenshot({ path: `${screenshotDirectory}/board-general-navigation-${width}.png` });
    if (width <= 900) await page.keyboard.press("Escape");
  }
  const project = await caller
    .from("projects")
    .select("id")
    .eq("client_id", result.data!.id)
    .limit(1)
    .single();
  expect(project.error).toBeNull();
  for (const [width, height] of [
    [1440, 900],
    [1024, 600],
    [390, 844],
    [320, 640],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [label, path] of [
      ["Briefings", "briefings"],
      ["Reviews", "reviews"],
      ["Brand Hub", "brand/overview"],
      ["Credits", "credits"],
    ]) {
      await menu.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(`/clients/${result.data!.id}/${path}`);
      await expect(menu.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.locator(".client-navigation")).toHaveCount(1);
      await expect(page.locator(".sidebar .client-navigation")).toHaveCount(0);
      await expect(menu).toBeInViewport();
    }
    // The project's Miro workspace keeps the same client navigation in its floating header.
    await page.goto(`/projects/${project.data!.id}`);
    await expect(page.getByRole("group", { name: "Project actions" })).toBeVisible();
    await expect(menu.getByRole("link", { name: boardLink })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(".client-navigation")).toHaveCount(1);
    const geometry = await menu.evaluate((element) => {
      const links = Array.from(element.querySelectorAll("a"));
      return links.every((link) => {
        const rect = link.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          link.scrollWidth <= link.clientWidth + 1
        );
      });
    });
    expect(geometry).toBe(true);
    // The project may carry a live Miro board (the SABRE demo overlay's do); that embed is
    // third-party content the product does not author, so the audit leaves it out, as
    // design-audit.spec.ts does.
    expect(
      (await new AxeBuilder({ page }).exclude("iframe.miro-view-frame").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `${screenshotDirectory}/project-client-navigation-${width}.png`,
    });
    await menu.getByRole("link", { name: boardLink }).click();
    await expect(page).toHaveURL(`/clients/${result.data!.id}/board`);
  }
});

test("search lives on each page and a focused search field reads as one box", async ({ page }) => {
  await signIn(page, credentials.agency);
  await page.goto("/home");
  // The workspace-wide search was removed on 2026-09-24 as a duplicate of the board's own search.
  await expect(page.getByRole("link", { name: "Search", exact: true })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "This page is unavailable." })).toBeVisible();

  const caller = await localAgency();
  const sabre = await caller.from("clients").select("id").eq("slug", "sabre").single();
  expect(sabre.error).toBeNull();
  await page.goto(`/clients/${sabre.data!.id}/board`);
  const input = await openBoardSearch(page);
  await input.focus();
  // The field's box carries the focus ring; the input inside it draws none.
  await expect(input).toHaveCSS("outline-style", "none");
  const field = page.locator(".search-field:focus-within");
  await expect(field).toHaveCSS("outline-style", "solid");
  await expect(field).toHaveCSS("outline-offset", "-1px");
  await page.screenshot({ path: `${screenshotDirectory}/board-search-focused.png` });
});

test("the sidebar's animated mark plays once beside the wordmark", async ({ page }) => {
  await signIn(page, credentials.agency);
  await page.goto("/home");
  const brand = page.locator(".sidebar .brand-link");
  const mark = brand.locator("video.brand-mark");
  await expect(brand).toHaveAccessibleName(/ home$/);
  await expect(brand.locator("img.brand-wordmark")).toBeVisible();
  await expect(mark).toHaveJSProperty("loop", false);
  await expect(mark).toHaveJSProperty("muted", true);
  // It plays through once and rests on the finished mark.
  await expect
    .poll(() => mark.evaluate((video: HTMLVideoElement) => video.ended), {
      timeout: 10_000,
    })
    .toBe(true);
  // The finished mark sits where the static one did: level with the wordmark's top, left of it.
  const layout = await brand.evaluate((link) => {
    const video = link.querySelector("video")!.getBoundingClientRect();
    const words = link.querySelector(".brand-wordmark")!.getBoundingClientRect();
    return { gap: words.left - video.right, top: Math.abs(words.top - video.top) };
  });
  expect(layout.gap).toBeGreaterThan(8);
  expect(layout.top).toBeLessThan(2);
  await page
    .locator(".sidebar")
    .screenshot({ path: `${screenshotDirectory}/sidebar-brand-mark.png` });

  // Collapsed, only the mark shows.
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect
    .poll(() =>
      brand.evaluate((link) => {
        const box = link.getBoundingClientRect();
        const video = link.querySelector("video")!.getBoundingClientRect();
        const words = link.querySelector(".brand-wordmark")!.getBoundingClientRect();
        return video.width > 0 && video.right <= box.right + 1 && words.left >= box.right;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
});

test("with reduced motion the sidebar shows the finished mark still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, credentials.agency);
  await page.goto("/home");
  const brand = page.locator(".sidebar .brand-link");
  await expect(brand.locator("video")).toHaveCount(0);
  await expect(brand.locator("img.brand-mark")).toBeVisible();
  await expect(brand.locator("img.brand-wordmark")).toBeVisible();
});
