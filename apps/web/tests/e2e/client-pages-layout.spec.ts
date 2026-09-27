import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { credentials, localAdmin, localAgency, screenshotDirectory, signIn } from "./test-support";

for (const role of ["agency", "client"] as const) {
  test(`${role} has consistent floating navigation and title cards across client sections`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const caller = await localAgency();
    const { data: client, error } = await caller
      .from("clients")
      .select("id")
      .eq("slug", "sabre")
      .single();
    expect(error).toBeNull();
    await signIn(page, credentials[role]);
    const sizes =
      role === "agency"
        ? [
            [1600, 1000],
            [1024, 700],
            [390, 844],
            [320, 640],
            [844, 390],
          ]
        : [
            [1600, 1000],
            [390, 844],
          ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      for (const [label, route] of [
        ["Overview", "overview"],
        ["Briefings", "briefings"],
        ["Reviews", "reviews"],
        ["Brand Hub", "brand/overview"],
        ["Credits", "credits"],
      ]) {
        await page.goto(`/clients/${client!.id}/${route}`);
        // A client's Overview is the sidebar's first item (inside the closed drawer on phones);
        // the top navigation holds the rest.
        const nav = page.getByRole("navigation", {
          name: label === "Overview" ? "Main navigation" : "SABRE navigation",
          exact: true,
          includeHidden: true,
        });
        await expect(
          nav.getByRole("link", { name: label, exact: true, includeHidden: true }),
        ).toHaveAttribute("aria-current", "page");
        await expect(page.locator(".client-navigation")).toHaveCount(1);
        await expect(page.locator(".client-page-heading")).toBeVisible();
        // Sections are documents, not canvases: the canvas grid stays off their surface.
        await expect(page.locator(".main-content")).toHaveCSS("background-image", "none");
        await expect(page.getByRole("button", { name: /^Account menu:/ })).toBeVisible();
        await expect
          .poll(() =>
            page.locator(".client-page-heading").evaluate((element) => {
              const title = element.getBoundingClientRect();
              const nav = document.querySelector(".client-page-chrome")!.getBoundingClientRect();
              return (
                title.top >= nav.bottom - 1 &&
                title.left >= 0 &&
                title.right <= innerWidth &&
                document.documentElement.scrollWidth <= innerWidth &&
                document.querySelector(".main-content")!.scrollWidth <=
                  document.querySelector(".main-content")!.clientWidth
              );
            }),
          )
          .toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({
          path: `${screenshotDirectory}/client-page-${role}-${route.replaceAll("/", "-")}-${width}.png`,
        });
      }
    }
  });
}

test("brand sections, private drafts and direct briefing pages retain the shared client context", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const caller = await localAgency();
  const { data: client } = await caller.from("clients").select("id").eq("slug", "sabre").single();
  const { data: briefing } = await caller
    .from("briefings")
    .select("id,title")
    .eq("client_id", client!.id)
    .eq("status", "accepted")
    .limit(1)
    .single();
  // Drafts are owner-private (acceptance C08): the canonical seed keeps 0 agency-owned SABRE
  // drafts (only the local SABRE demo overlay adds any), so this test creates its own through the
  // same table the app itself reads and writes for a draft (`template_drafts`, via
  // `useTemplateDraft` / `updateTemplateDraft` in features/brand/brand-data.ts) instead of
  // relaxing the ownership check the page enforces.
  const account = await caller.auth.getUser();
  if (account.error || !account.data.user) throw new Error("Missing agency fixture user.");
  const { data: template, error: templateError } = await caller
    .from("brand_templates")
    .select("id")
    .eq("client_id", client!.id)
    .limit(1)
    .single();
  expect(templateError).toBeNull();
  const { data: draft, error: draftError } = await localAdmin
    .from("template_drafts")
    .insert({
      client_id: client!.id,
      template_id: template!.id,
      owner_id: account.data.user.id,
      name: "Acceptance agency draft",
      content: { headline: "Acceptance draft headline." },
    })
    .select("id")
    .single();
  expect(draftError).toBeNull();
  expect(draft).not.toBeNull();
  try {
    await signIn(page, credentials.agency);
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: width === 1600 ? 1000 : 844 });
      for (const section of [
        "overview",
        "logos",
        "colors",
        "typography",
        "visual-style",
        "assets",
        "messaging",
        "ai",
      ]) {
        await page.goto(`/clients/${client!.id}/brand/${section}`);
        await expect(page.locator(".client-page-heading")).toBeVisible();
        await expect(
          page
            .getByRole("navigation", { name: "Brand sections", exact: true })
            .locator('[aria-current="page"]'),
        ).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.goto(`/clients/${client!.id}/briefings/${briefing!.id}`);
      await expect(page.locator(".client-page-heading h1")).toHaveText(briefing!.title);
      await expect(page.getByRole("link", { name: "All briefings", exact: true })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `${screenshotDirectory}/client-page-briefing-detail-${width}.png`,
      });
      await page.goto(`/clients/${client!.id}/briefings/new`);
      await expect(page.locator(".client-page-heading h1")).toHaveText("New briefing");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `${screenshotDirectory}/client-page-new-briefing-${width}.png`,
      });
      await page.goto(`/clients/${client!.id}/brand/drafts/${draft!.id}`);
      await expect(page.locator(".client-page-heading h1")).toHaveText("Template draft");
      await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `${screenshotDirectory}/client-page-private-draft-${width}.png`,
      });
      await page.locator(".main-content").evaluate((element) => element.scrollTo(0, 600));
      await page
        .getByRole("navigation", { name: "SABRE navigation", exact: true })
        .getByRole("link", { name: "Briefings", exact: true })
        .click();
      await expect(page.locator(".client-page-heading h1")).toHaveText("Briefings");
      await expect
        .poll(() => page.locator(".main-content").evaluate((element) => element.scrollTop))
        .toBe(0);
    }
  } finally {
    await localAdmin.from("template_drafts").delete().eq("id", draft!.id);
  }
});
