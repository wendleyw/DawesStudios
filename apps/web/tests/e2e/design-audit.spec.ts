import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { credentials, localAdmin, localAgency, screenshotDirectory, signIn } from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

test.use({ reducedMotion: "reduce" });

test("representative task surfaces pass responsive layout and accessibility checks", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const report: {
    capturedAt: string;
    surfaces: { name: string; width: number; overflow: boolean; violations: unknown[] }[];
  } = { capturedAt: new Date().toISOString(), surfaces: [] };
  async function capture(target: Page, name: string) {
    await target.evaluate(() => window.scrollTo(0, 0));
    await target.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const width = target.viewportSize()!.width;
    const overflow = await target.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const result = await new AxeBuilder({ page: target }).analyze();
    report.surfaces.push({
      name,
      width,
      overflow,
      violations: result.violations.map((item) => ({
        id: item.id,
        impact: item.impact,
        nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
      })),
    });
    writeFileSync(
      new URL("../../../../docs/verification/design-audit.json", import.meta.url),
      JSON.stringify(report, null, 2),
    );
    await target.screenshot({
      path: screenshotDirectory + "/design-" + name + "-" + width + ".png",
      fullPage: true,
    });
  }
  await page.goto("/login");
  await capture(page, "login");
  await signIn(page, credentials.agency);
  await page.getByRole("button", { name: "Help & support", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Help & support", exact: true })).toContainText(
    "Open a project to message the studio.",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Help & support", exact: true })).not.toBeVisible();
  const boardPath = await page
    .locator(".client-nav")
    .filter({ hasText: "SABRE" })
    .getAttribute("href");
  if (!boardPath) throw new Error("The SABRE workspace is unavailable.");
  const clientBase = boardPath.replace(/\/board$/, "");
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: width === 1600 ? 1000 : 844 });
    for (const [name, route] of [
      ["home", "/home"],
      ["search", "/search"],
      ["notifications", "/notifications"],
      ["account", "/settings/account"],
      ["settings", "/settings"],
      ["briefings", clientBase + "/briefings"],
      ["new-briefing", clientBase + "/briefings/new"],
      ["reviews", clientBase + "/reviews"],
      ["assets", clientBase + "/assets"],
      ["credits", clientBase + "/credits"],
    ]) {
      await page.goto(route);
      await expect(
        page.locator(name === "new-briefing" ? ".service-grid" : "#main-content h1").first(),
      ).toBeVisible();
      await capture(page, name);
    }
    await page.goto(boardPath);
    // The stacked canvas is the default reading surface; phones still open the table.
    await expect(
      page.getByRole("button", { name: width === 390 ? "List view" : "Canvas view", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await expect(page.locator(".react-flow__node-project")).toHaveCount(7);
    await expect(page.locator(".react-flow__node-campaign")).toHaveCount(3);
    await capture(page, "board-canvas");
    await capture(page, "board-timeline");
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(page.locator(".kanban-column")).toHaveCount(7);
    await capture(page, "board-kanban");
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await capture(page, "board-list");
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await page.locator(".board-card-body").first().dblclick();
    await expect(page.locator(".project-canvas .react-flow")).toBeVisible();
    await expect(page.locator(".design-preview").first()).toBeVisible();
    await capture(page, "project");
    await page.locator(".design-preview").first().click();
    await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
    await expect(page.locator(".artwork-stage")).toBeVisible();
    await page.getByRole("button", { name: "Add pin", exact: true }).click();
    const artwork = page.getByRole("button", {
      name: "Place a pin on this artwork. Press Enter for the center.",
      exact: true,
    });
    await artwork.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove pending pin", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Your message", { exact: true })
      .fill(
        "A long feedback draft checks reading and editing without submitting a message. ".repeat(
          20,
        ),
      );
    await capture(page, "design-pinned-draft");
  }
  for (const width of [1024, 1000, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 800 });
    await page.goto(boardPath);
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await expect(page.locator(".react-flow__node-project")).toHaveCount(7);
    await capture(page, "board-canvas");
    await page.locator(".board-card-body").first().dblclick();
    await expect(page.locator(".design-preview").first()).toBeVisible();
    await capture(page, "project");
    await page.locator(".design-preview").first().click();
    await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
    await capture(page, "design-viewer");
  }
  expect(
    report.surfaces.filter((item) => item.overflow || item.violations.length),
    "See docs/verification/design-audit.json for precise findings",
  ).toEqual([]);
});

test("two versions with long notes remain separated on the project canvas", async ({ page }) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    const deliverable = await agency
      .from("deliverables")
      .select("id")
      .eq("project_id", fixture.projectId)
      .single();
    expect(deliverable.error).toBeNull();
    if (!deliverable.data) throw new Error("The isolated project has no deliverable.");
    const longName =
      "A detailed deliverable title that stays readable and separated from its first version. "
        .repeat(3)
        .slice(0, 180);
    // Accepted deliverables are immutable for authenticated callers; this layout fixture widens the
    // stored name through the service role instead of asserting a write path the product must deny.
    expect(
      (
        await localAdmin
          .from("deliverables")
          .update({ name: longName })
          .eq("id", deliverable.data.id)
      ).error,
    ).toBeNull();
    for (let number = 1; number <= 2; number++) {
      const version = await agency.rpc("create_design_version", {
        p_deliverable_id: deliverable.data.id,
        p_notes: (
          "Version " +
          number +
          " has a long note to verify stable readable canvas spacing. "
        )
          .repeat(40)
          .slice(0, 2000),
      });
      expect(version.error).toBeNull();
      if (!version.data) throw new Error("The isolated version was not created.");
      const design = await agency.rpc("add_design", {
        p_version_id: version.data,
        p_title: "Long-note direction " + number,
        p_content: {
          headline: "A readable direction",
          background: "#f6f6f4",
          foreground: "#242424",
        },
      });
      expect(design.error).toBeNull();
    }
    await signIn(page, credentials.agency);
    await page.goto("/projects/" + fixture.projectId);
    await expect(page.locator(".version-card")).toHaveCount(2);
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: width === 1600 ? 1000 : 844 });
      await expect
        .poll(
          async () =>
            page.locator(".version-card").evaluateAll((elements) => {
              const boxes = elements
                .map((element) => element.getBoundingClientRect())
                .sort((a, b) => a.top - b.top);
              return (
                boxes.length === 2 && boxes[0].height > 0 && boxes[0].bottom + 1 <= boxes[1].top
              );
            }),
          { message: "Long version notes must not overlap the next version", timeout: 15_000 },
        )
        .toBe(true);
      await expect
        .poll(
          async () =>
            page.locator(".project-canvas").evaluate((canvas) => {
              const header = canvas.querySelector(".deliverable-header")?.getBoundingClientRect();
              const first = Array.from(canvas.querySelectorAll(".version-card"))
                .map((element) => element.getBoundingClientRect())
                .sort((a, b) => a.top - b.top)[0];
              return !!header && header.height > 0 && !!first && header.bottom + 1 <= first.top;
            }),
          {
            message: "A long deliverable name must not overlap its first version",
            timeout: 15_000,
          },
        )
        .toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: screenshotDirectory + "/design-long-version-notes-" + width + ".png",
        fullPage: true,
      });
    }
  } finally {
    await cleanupTestProject(fixture.projectId);
    await agency.auth.signOut();
  }
});
