import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { credentials, isDevelopmentTimingNoise, localAdmin, signIn } from "./test-support";

/**
 * A read-only tour of every screen, for each role, at desktop and phone width: a full-page
 * screenshot of each, plus what the page itself reports — console errors, uncaught exceptions,
 * failed requests, horizontal overflow and serious or critical accessibility violations. It opens
 * screens and dialogs but saves nothing.
 *
 * It is slow and writes screenshots, so it runs only on request:
 * `SYSTEM_TOUR=1 npx playwright test tests/e2e/system-tour.spec.ts`. Screenshots and
 * `report.json` go to the ignored `outputs/system-tour/` directory.
 */
test.skip(!process.env.SYSTEM_TOUR, "Run with SYSTEM_TOUR=1.");
test.use({ reducedMotion: "reduce" });

const outputRoot = fileURLToPath(new URL("../../../../outputs/system-tour/", import.meta.url));
const viewports = [
  { width: 1600, height: 1000 },
  { width: 390, height: 844 },
];

type Surface = {
  role: string;
  name: string;
  width: number;
  url: string;
  overflow: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  violations: { id: string; impact: string | null | undefined; targets: string[] }[];
};

function record(role: string, surfaces: Surface[]) {
  mkdirSync(`${outputRoot}${role}`, { recursive: true });
  writeFileSync(`${outputRoot}${role}/report.json`, JSON.stringify(surfaces, null, 2));
}

/** Everything a screen reports while it is open, collected for the next capture. */
function watch(page: Page) {
  const seen = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failed: [] as string[],
  };
  page.on("console", (message) => {
    if (message.type() === "error") seen.consoleErrors.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => {
    if (isDevelopmentTimingNoise(error.message)) return;
    seen.pageErrors.push(error.message.slice(0, 300));
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      seen.failed.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    // A navigation cancels in-flight media and prefetches; that is not a defect.
    if (!failure.includes("ERR_ABORTED"))
      seen.failed.push(`failed ${request.method()} ${request.url()} ${failure}`);
  });
  return {
    take() {
      const taken = {
        consoleErrors: [...seen.consoleErrors],
        pageErrors: [...seen.pageErrors],
        failedRequests: [...seen.failed],
      };
      seen.consoleErrors.length = 0;
      seen.pageErrors.length = 0;
      seen.failed.length = 0;
      return taken;
    },
  };
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function capture(
  page: Page,
  role: string,
  name: string,
  surfaces: Surface[],
  watcher: ReturnType<typeof watch>,
) {
  await settle(page);
  const width = page.viewportSize()!.width;
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  const axe = await new AxeBuilder({ page }).analyze();
  const index = String(surfaces.length + 1).padStart(3, "0");
  await page.screenshot({
    path: `${outputRoot}${role}/${index}-${name}-${width}.png`,
    fullPage: true,
  });
  surfaces.push({
    role,
    name,
    width,
    url: page.url().replace(/^https?:\/\/[^/]+/, ""),
    overflow,
    ...watcher.take(),
    violations: axe.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
      })),
  });
  record(role, surfaces);
}

async function fixtures() {
  const client = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  if (client.error) throw client.error;
  const designer = await localAdmin.auth.admin.listUsers({ perPage: 200 });
  if (designer.error) throw designer.error;
  const designerId = designer.data.users.find((user) => user.email === credentials.designer)?.id;
  const assignments = await localAdmin
    .from("project_assignments")
    .select("project_id")
    .eq("designer_id", designerId ?? "");
  if (assignments.error) throw assignments.error;
  const shared = await localAdmin
    .from("published_versions")
    .select("project_id, projects!inner(client_id, updated_at)")
    .eq("projects.client_id", client.data.id)
    .in(
      "project_id",
      assignments.data.map((row) => row.project_id),
    )
    .limit(1);
  if (shared.error) throw shared.error;
  const projectId = shared.data[0]?.project_id;
  if (!projectId) throw new Error("No shared SABRE project assigned to the designer.");
  const briefing = await localAdmin
    .from("briefings")
    .select("id")
    .eq("client_id", client.data.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (briefing.error) throw briefing.error;
  return { clientId: client.data.id, projectId, briefingId: briefing.data.id };
}

const brandSections = [
  "overview",
  "logos",
  "ai",
  "colors",
  "products",
  "typography",
  "messaging",
  "visual-style",
  "assets",
];

function routesFor(
  role: "agency" | "designer" | "client",
  ids: Awaited<ReturnType<typeof fixtures>>,
) {
  const client = `/clients/${ids.clientId}`;
  const shared = [
    ["home", "/home"],
    ["search", "/search"],
    ["notifications", "/notifications"],
    ["settings-account", "/settings/account"],
    ["project", `/projects/${ids.projectId}`],
  ];
  const workspace = [
    ["board", `${client}/board`],
    ["briefings", `${client}/briefings`],
    ["briefing", `${client}/briefings/${ids.briefingId}`],
    ["briefing-new", `${client}/briefings/new`],
    ["reviews", `${client}/reviews`],
    ["files", `${client}/assets`],
    ["credits", `${client}/credits`],
    ...brandSections.map((section) => [`brand-${section}`, `${client}/brand/${section}`]),
  ];
  if (role === "agency")
    return [
      ...shared,
      ["project-shared", `/projects/${ids.projectId}?channel=client`],
      ...workspace,
      ["team", "/team"],
      ["settings-workspace", "/settings/workspace"],
      ["settings-team", "/settings/team"],
      ["settings-clients", "/settings/clients"],
      ["settings-presets", "/settings/presets"],
    ];
  if (role === "designer") return [...shared, ...workspace];
  return [...shared, ...workspace];
}

for (const role of ["agency", "designer", "client"] as const) {
  test(`system tour: every ${role} screen`, async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const ids = await fixtures();
    const surfaces: Surface[] = [];
    mkdirSync(`${outputRoot}${role}`, { recursive: true });
    const watcher = watch(page);

    await page.setViewportSize(viewports[0]);
    await page.goto("/login");
    await capture(page, role, "login", surfaces, watcher);
    await signIn(page, credentials[role]);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const [name, route] of routesFor(role, ids)) {
        await page.goto(route);
        await capture(page, role, name, surfaces, watcher);
      }

      // The project's own layers: a design in the viewer, then the Playground.
      await page.goto(`/projects/${ids.projectId}`);
      await settle(page);
      // A design card's own button, not the phone's "Open navigation" or a version's feedback.
      const openDesign = page
        .locator(".react-flow__node button[aria-label^='Open ']:not([aria-label^='Open feedback'])")
        .first();
      if (await openDesign.isVisible().catch(() => false)) {
        await openDesign.click();
        await capture(page, role, "design-viewer", surfaces, watcher);
        await page.keyboard.press("Escape");
      }
      await page.goto(`/projects/${ids.projectId}`);
      await settle(page);
      const playground = page.getByRole("button", { name: "Playground", exact: true });
      if (await playground.isVisible().catch(() => false)) {
        await playground.click();
        await expect(page.getByRole("dialog", { name: "Playground" })).toBeVisible();
        await capture(page, role, "playground", surfaces, watcher);
        await page
          .getByRole("button", { name: "Close Playground" })
          .click()
          .catch(() => undefined);
      }
      // The bell lives in the client header's account card.
      await page.goto(`/clients/${ids.clientId}/board`);
      await settle(page);
      const notifications = page
        .locator(".board-account")
        .getByRole("button", { name: /Notifications/ })
        .first();
      if (await notifications.isVisible().catch(() => false)) {
        await notifications.click();
        await capture(page, role, "notifications-popover", surfaces, watcher);
        await page.keyboard.press("Escape");
      }
    }

    const problems = surfaces.filter(
      (surface) =>
        surface.pageErrors.length ||
        surface.overflow ||
        surface.violations.length ||
        surface.consoleErrors.length,
    );
    test.info().annotations.push({
      type: "tour",
      description: `${surfaces.length} surfaces, ${problems.length} with findings`,
    });
    // The tour reports; only an uncaught exception fails it.
    expect(surfaces.flatMap((surface) => surface.pageErrors)).toEqual([]);
  });
}
