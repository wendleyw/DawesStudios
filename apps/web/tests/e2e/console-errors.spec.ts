import { test, expect, type Page } from "@playwright/test";
import { credentials, localAdmin, signIn } from "./test-support";

/**
 * Acceptance row I02 asks for "no runtime console errors". Nothing in this repository looked for
 * them until this file: `design-audit.spec.ts` captures responsive layout and accessibility, and
 * `workspace.spec.ts` collects `pageerror` for one journey only. A requirement nothing measures is
 * not a requirement that passes — it is one nobody has checked.
 *
 * Two things this file is deliberate about.
 *
 * The listeners attach **before the first navigation**, which is the part that is easy to get
 * wrong: a listener registered after `goto` misses everything the page logged while loading, and
 * loading is where most of them happen. `signIn` performs the first navigation, so nothing may run
 * before the two `page.on` calls below.
 *
 * There is **no allow-list**, and there should not be one. The measured count on every surface here
 * is zero, so any entry would be a place to hide a future regression. A real third-party console
 * error belongs in a fix or an explicit, commented exception — not in a silent filter. Note that a
 * browser extension can emit console noise in a human's browser (one was observed calling a
 * third-party endpoint from a real session on 2026-09-21); Playwright runs without extensions, so
 * what this file sees is the application alone.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function visit(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.goto(path);
    // `networkidle` rather than a fixed wait: the board and project canvases settle asynchronously,
    // and a console error thrown after an arbitrary timeout would be missed by a shorter one.
    await page.waitForLoadState("networkidle");
  }
}

test("no surface logs a console error or throws, for any role", async ({ page }) => {
  const errors = collectErrors(page);

  const client = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  expect(client.error).toBeNull();
  const clientId = client.data!.id;
  const project = await localAdmin
    .from("projects")
    .select("id")
    .eq("client_id", clientId)
    .limit(1)
    .single();
  expect(project.error).toBeNull();

  await signIn(page, credentials.agency);
  await visit(page, [
    "/home",
    "/search",
    "/notifications",
    "/settings",
    "/settings/workspace",
    "/team",
    "/settings/presets",
    "/settings/clients",
    "/settings/account",
    `/clients/${clientId}/board`,
    `/clients/${clientId}/briefings`,
    `/clients/${clientId}/credits`,
    `/clients/${clientId}/reviews`,
    `/clients/${clientId}/brand`,
    `/projects/${project.data!.id}`,
  ]);

  expect(errors, `agency surfaces logged: ${errors.join(" | ")}`).toEqual([]);
});

test("a designer's and a client's own surfaces are equally quiet", async ({ browser }) => {
  // Separate contexts rather than re-signing in one page: a role's surfaces should be measured
  // from a session that only ever held that role, so nothing cached under the agency's session can
  // suppress or cause an error here.
  for (const email of [credentials.designer, credentials.client]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = collectErrors(page);
    await signIn(page, email);
    await visit(page, ["/home", "/notifications", "/search"]);
    expect(errors, `${email} logged: ${errors.join(" | ")}`).toEqual([]);
    await context.close();
  }
});
