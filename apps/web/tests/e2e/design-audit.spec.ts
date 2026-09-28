import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import {
  credentials,
  evidenceDirectory,
  localAdmin,
  localAgency,
  screenshotDirectory,
  signIn,
} from "./test-support";
import { boardViews } from "../../features/board/board-views";

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
    // The Miro embed is third-party content the product does not author, so the audit leaves it out.
    const result = await new AxeBuilder({ page: target })
      .exclude("iframe.miro-view-frame")
      .analyze();
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
    writeFileSync(join(evidenceDirectory, "design-audit.json"), JSON.stringify(report, null, 2));
    await target.screenshot({
      path: screenshotDirectory + "/design-" + name + "-" + width + ".png",
      fullPage: true,
    });
  }
  await page.goto("/login");
  await capture(page, "login");
  await signIn(page, credentials.agency);
  const boardPath = await page
    .locator(".workspace-card")
    .filter({ hasText: "SABRE" })
    .getAttribute("href");
  if (!boardPath) throw new Error("The SABRE workspace is unavailable.");
  const clientBase = boardPath.replace(/\/board$/, "");
  // Campaigns can be added without changing the canonical project fixture. Verify that the
  // canvas renders the live authorized set rather than assuming an old seed count.
  const agency = await localAgency();
  const campaigns = await agency
    .from("campaigns")
    .select("id")
    .eq("client_id", clientBase.split("/").at(-1)!);
  expect(campaigns.error).toBeNull();
  const campaignCount = campaigns.data!.length;
  const viewer = await agency.auth.getUser();
  expect(viewer.error).toBeNull();
  const clientId = clientBase.split("/").at(-1)!;
  const userId = viewer.data.user!.id;
  const saved = await localAdmin
    .from("board_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();
  expect(saved.error).toBeNull();
  try {
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: width === 1600 ? 1000 : 844 });
      for (const [name, route] of [
        ["home", "/home"],
        ["notifications", "/notifications"],
        ["account", "/settings/account"],
        ["settings", "/settings"],
        ["briefings", clientBase + "/briefings"],
        ["new-briefing", clientBase + "/briefings/new"],
        ["reviews", clientBase + "/reviews"],
        ["assets", clientBase + "/brand/files"],
        ["credits", clientBase + "/credits"],
      ]) {
        await page.goto(route);
        await expect(
          page.locator(name === "new-briefing" ? ".service-grid" : "#main-content h1").first(),
        ).toBeVisible();
        await capture(page, name);
      }
      await page.goto(boardPath);
      await page.getByRole("button", { name: "Canvas view", exact: true }).click();
      await expect(page.locator(".react-flow__node-project")).toHaveCount(7);
      await expect(page.locator(".react-flow__node-campaign")).toHaveCount(campaignCount);
      await capture(page, "board-canvas");
      for (const view of boardViews.filter((item) => item.id !== "canvas")) {
        await page.getByRole("button", { name: view.label, exact: true }).click();
        await expect(page.getByRole("button", { name: view.label, exact: true })).toBeEnabled();
        await capture(page, `board-${view.id}`);
      }
      await page.getByRole("button", { name: "Canvas view", exact: true }).click();
      await page.locator(".react-flow__node-project .board-card-body").first().dblclick();
      await expect(page.getByRole("group", { name: "Project actions" })).toBeVisible();
      // The audited project surface is the Miro workspace on its design board, not an empty state.
      await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /miro\.com/);
      await capture(page, "project");
      await page.getByRole("button", { name: "Comments", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
      await page
        .getByLabel("Your message", { exact: true })
        .fill(
          "A long conversation draft checks reading and editing without submitting a message. ".repeat(
            20,
          ),
        );
      await capture(page, "project-conversation-draft");
    }
    for (const width of [1024, 1000, 768]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 800 });
      await page.goto(boardPath);
      await page.getByRole("button", { name: "Canvas view", exact: true }).click();
      await expect(page.locator(".react-flow__node-project")).toHaveCount(7);
      await capture(page, "board-canvas");
      await page.locator(".react-flow__node-project .board-card-body").first().dblclick();
      await expect(page.getByRole("group", { name: "Project actions" })).toBeVisible();
      await capture(page, "project");
      await page.getByRole("button", { name: "Project details", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Project details", exact: true }),
      ).toBeVisible();
      await capture(page, "project-details");
    }
    expect(
      report.surfaces.filter((item) => item.overflow || item.violations.length),
      "See docs/verification/design-audit.json for precise findings",
    ).toEqual([]);
  } finally {
    const restored = saved.data
      ? await localAdmin.from("board_preferences").upsert(saved.data)
      : await localAdmin
          .from("board_preferences")
          .delete()
          .eq("user_id", userId)
          .eq("client_id", clientId);
    expect(restored.error).toBeNull();
  }
});
