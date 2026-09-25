import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { credentials, localAdmin, localCaller, signIn } from "./test-support";

async function sabre() {
  return (await localAdmin.from("clients").select("id,name").eq("slug", "sabre").single()).data!;
}

/** The number in the Overview tile whose label is `label`. */
async function tile(page: Page, label: string) {
  const text = await page
    .locator(".overview-stats > div", { hasText: label })
    .locator("strong")
    .innerText();
  return Number(text);
}

test("a client lands on its Overview and sees its own numbers", async ({ page }) => {
  const client = await sabre();
  await signIn(page, credentials.client);
  await expect(page).toHaveURL(new RegExp(`/clients/${client.id}/overview$`));
  const caller = await localCaller(credentials.client);
  const user = (await caller.auth.getUser()).data.user!;
  const me = (await localAdmin.from("profiles").select("display_name").eq("id", user.id).single())
    .data!;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Welcome back, ${me.display_name.trim().split(/\s+/)[0]}`,
  );
  const projects = (await caller.from("projects").select("id,status").eq("client_id", client.id))
    .data!;
  const account = (
    await caller.from("credit_accounts").select("balance").eq("client_id", client.id).single()
  ).data!;
  await expect
    .poll(() => tile(page, "Active projects"))
    .toBe(projects.filter((project) => project.status !== "delivered").length);
  await expect.poll(() => tile(page, "Credits remaining")).toBe(account.balance);
  const waiting = await tile(page, "Needs your review");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // The client's own Reviews tab agrees with the Overview.
  await page.goto(`/clients/${client.id}/reviews`);
  await expect(page.locator(".review-card, .empty-state").first()).toBeVisible();
  expect(await page.locator(".review-card").count()).toBe(waiting);

  // Nothing internal reaches the client's Overview.
  await page.goto(`/clients/${client.id}/overview`);
  await expect(page.locator(".overview-panel")).toHaveCount(3);
  const text = await page.locator(".overview-page").innerText();
  const designers = (
    await localAdmin.from("profiles").select("display_name").eq("role", "designer")
  ).data!;
  expect(designers.length).toBeGreaterThan(0);
  for (const designer of designers) expect(text).not.toContain(designer.display_name);
  const notes = (
    await localAdmin
      .from("internal_comments")
      .select("body")
      .in(
        "project_id",
        projects.map((project) => project.id),
      )
  ).data!;
  // Below 12 characters a note (e.g. "Approved") can collide with ordinary UI copy, so only
  // longer notes are checked, and compared in full rather than by a truncated prefix.
  expect(notes.filter((item) => item.body.length >= 12).length).toBeGreaterThan(0);
  for (const note of notes.filter((item) => item.body.length >= 12))
    expect(text).not.toContain(note.body);
});

test("a designer's home shows only assigned work and no credits", async ({ page }) => {
  await signIn(page, credentials.designer);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back/);
  const caller = await localCaller(credentials.designer);
  const allowed = (await caller.from("projects").select("id,status")).data!;
  await expect
    .poll(() => tile(page, "Active projects"))
    .toBe(allowed.filter((project) => project.status !== "delivered").length);
  const allowedIds = new Set(allowed.map((project) => project.id));
  const hrefs = await page
    .locator(".overview-row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("href") ?? ""));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const match = href.match(/^\/projects\/([^/?]+)/);
    expect(match).not.toBeNull();
    expect(allowedIds.has(match![1])).toBe(true);
  }
  await expect(page.getByText(/credits/i)).toHaveCount(0);
});

test("the studio sees a client's Overview as the client does", async ({ page, browser }) => {
  const client = await sabre();
  await signIn(page, credentials.agency);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back/);
  await page.goto(`/clients/${client.id}/overview`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`What ${client.name} sees`);
  await expect(
    page
      .getByRole("navigation", { name: `${client.name} navigation`, exact: true })
      .getByRole("link", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  // Every number the studio sees matches what the client itself sees on its own Overview.
  const clientContext = await browser.newContext();
  try {
    const clientPage = await clientContext.newPage();
    await signIn(clientPage, credentials.client); // lands on the same Overview
    await expect(clientPage.locator(".overview-panel")).toHaveCount(3);
    for (const label of ["Credits remaining", "Active projects", "Needs your review"])
      await expect.poll(() => tile(page, label)).toBe(await tile(clientPage, label));
  } finally {
    await clientContext.close();
  }

  const projects = (await localAdmin.from("projects").select("status").eq("client_id", client.id))
    .data!;
  await expect
    .poll(() => tile(page, "Active projects"))
    .toBe(projects.filter((project) => project.status !== "delivered").length);
});

test("the client Overview fits a phone in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, credentials.client);
  await expect(page.locator(".overview-panel")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Tile notes sit right under their labels, and the lone third tile fills its row.
  const tiles = page.locator(".overview-stats > div");
  const label = (await tiles.first().locator("span").boundingBox())!;
  const note = (await tiles.first().locator("small").boundingBox())!;
  expect(note.y - (label.y + label.height)).toBeLessThanOrEqual(4);
  const row = (await page.locator(".overview-stats").boundingBox())!;
  expect(Math.abs((await tiles.last().boundingBox())!.width - row.width)).toBeLessThanOrEqual(1);
});
