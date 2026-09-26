import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { createTeamFixture, type TeamFixture } from "./team-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

const test = base.extend<{ team: TeamFixture }>({
  team: async ({}, runWithFixture) => {
    const fixture = createTeamFixture();
    try {
      await runWithFixture(fixture);
    } finally {
      await fixture.cleanup();
    }
  },
});

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("The client team check did not return a record.");
  return result.data as NonNullable<T>;
}

/** Whether the page fits its viewport without a horizontal scroll. */
function fitsWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

/**
 * Whether an open dialog itself fits its viewport: `document.documentElement.scrollWidth` ignores
 * a `<dialog>` (it paints in the top layer, outside document flow), so this measures the dialog
 * element's own overflow and its bounding box against the viewport width instead.
 */
async function dialogFitsWidth(dialog: Locator) {
  const noInternalOverflow = await dialog.evaluate(
    (element) => element.scrollWidth <= element.clientWidth,
  );
  if (!noInternalOverflow) return false;
  const box = await dialog.boundingBox();
  const viewportWidth = await dialog.page().evaluate(() => window.innerWidth);
  return box !== null && box.x >= 0 && box.x + box.width <= viewportWidth;
}

test("two people at one client act separately, and the product attributes and notifies each", async ({
  browser,
  team,
}) => {
  test.setTimeout(180_000);
  const sabre = value(
    await localAdmin.from("clients").select("id,name").eq("slug", "sabre").single(),
  );
  const requesterCaller = await localCaller(credentials.client);
  const requesterId = (await requesterCaller.auth.getUser()).data.user!.id;
  const requesterName = value(
    await localAdmin.from("profiles").select("display_name").eq("id", requesterId).single(),
  ).display_name;
  // A temporary second SABRE person; the team fixture deletes the account and everything it owns.
  const teammate = await team.member("client");
  expect(
    (
      await localAdmin
        .from("client_memberships")
        .insert({ client_id: sabre.id, user_id: teammate.id })
    ).error,
  ).toBeNull();
  const agency = await localAgency();
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [teammatePage, requesterPage, studioPage] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const onBehalfTitle = `Acceptance on behalf ${randomUUID().slice(0, 8)}`;
  let projectId: string | undefined;
  try {
    // The studio files the fixture's briefing for the SABRE person, who becomes its requester.
    const fixture = await createProductionFixture(agency, undefined, requesterId);
    projectId = fixture.projectId;
    const projectTitle = value(
      await localAdmin.from("projects").select("title").eq("id", fixture.projectId).single(),
    ).title;
    const deliverable = value(
      await agency.from("deliverables").select("id").eq("project_id", fixture.projectId).single(),
    );
    const publish = async (note: string) => {
      const version = value(
        await agency.rpc("create_design_version", {
          p_deliverable_id: deliverable.id,
          p_notes: "",
        }),
      );
      value(
        await agency.rpc("add_design", {
          p_version_id: version,
          p_title: "Direction A",
          p_content: {
            headline: "One client, two people.",
            background: "#f6f6f4",
            foreground: "#242424",
          },
        }),
      );
      return value(
        await agency.rpc("publish_version", {
          p_version_id: version,
          p_release_note: note,
          p_assets: {},
        }),
      );
    };
    const reviewNotices = async (userId: string) =>
      value(
        await localAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("project_id", fixture.projectId)
          .eq("title", "New designs ready for review"),
      ).length;

    // New designs reach the person who asked for them, not their teammate.
    await publish("First round for the client team check.");
    expect(await reviewNotices(requesterId)).toBe(1);
    expect(await reviewNotices(teammate.id)).toBe(0);

    // The teammate signs in as themselves, is greeted by name, sees the team and opts in.
    await signIn(teammatePage, teammate.email);
    await expect(teammatePage.getByRole("heading", { level: 1 })).toHaveText(
      `Welcome back, ${teammate.name.split(" ")[0]}`,
    );
    await teammatePage.goto("/settings/account");
    const teammateTeam = teammatePage.getByRole("region", {
      name: `${sabre.name} team`,
      exact: true,
    });
    await expect(teammateTeam.getByText(requesterName, { exact: true })).toBeVisible();
    await expect(teammateTeam.getByText(teammate.name, { exact: true })).toBeVisible();
    await expect(teammateTeam.getByText("You", { exact: true })).toBeVisible();
    const designers = value(
      await localAdmin.from("profiles").select("display_name").eq("role", "designer"),
    );
    // Without at least one designer, the loop below would pass vacuously and prove nothing.
    expect(designers.length).toBeGreaterThan(0);
    for (const designer of designers)
      await expect(teammateTeam).not.toContainText(designer.display_name);
    const everything = teammateTeam.getByRole("button", {
      name: `All ${sabre.name} activity`,
      exact: true,
    });
    await everything.click();
    await expect(everything).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(
        async () =>
          value(
            await localAdmin
              .from("client_memberships")
              .select("notify_all")
              .eq("client_id", sabre.id)
              .eq("user_id", teammate.id)
              .single(),
          ).notify_all,
      )
      .toBe(true);
    expect((await new AxeBuilder({ page: teammatePage }).analyze()).violations).toEqual([]);
    await teammatePage.setViewportSize({ width: 390, height: 844 });
    await expect(teammateTeam.getByText(teammate.name, { exact: true })).toBeVisible();
    // The sidebar's own width and the content area's margin both animate on a viewport change
    // (`transition: … 180ms`, `apps/web/features/workspace/workspace.css`); poll rather than read
    // `fitsWidth` once, so the check outlives that transition instead of racing it.
    await expect.poll(() => fitsWidth(teammatePage)).toBe(true);

    // With all activity on, the next round reaches the teammate as well.
    const second = await publish("Second round for the client team check.");
    expect(await reviewNotices(teammate.id)).toBe(1);
    expect(await reviewNotices(requesterId)).toBe(2);

    // The requester sees the teammate too and approves; the review names who decided.
    await signIn(requesterPage, credentials.client);
    await requesterPage.goto("/settings/account");
    await expect(
      requesterPage
        .getByRole("region", { name: `${sabre.name} team`, exact: true })
        .getByText(teammate.name, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await requesterCaller.rpc("review_publication", {
          p_publication_id: second,
          p_decision: "approved",
          p_feedback: "",
        })
      ).error,
    ).toBeNull();
    await signIn(studioPage, credentials.agency);
    await studioPage.goto(`/clients/${sabre.id}/reviews`);
    await studioPage.getByRole("button", { name: "Approved", exact: true }).click();
    await expect(
      studioPage.locator(".review-card", { hasText: projectTitle }).locator(".review-row-note"),
    ).toContainText(`Approved by ${requesterName} ·`);

    // The studio files a briefing on behalf of the teammate: with two people it must choose.
    await studioPage.goto(`/clients/${sabre.id}/briefings/new`);
    await studioPage.getByRole("button", { name: /Digital Ad \(Static\)/ }).click();
    await studioPage.getByRole("button", { name: "Continue to details", exact: true }).click();
    await studioPage
      .getByRole("textbox", { name: "Project title", exact: true })
      .fill(onBehalfTitle);
    await studioPage.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(studioPage.locator(".briefing-validation")).toContainText(
      "Choose who requested this briefing.",
    );
    await studioPage
      .getByRole("combobox", { name: "Requested by", exact: true })
      .selectOption({ label: teammate.name });
    await studioPage.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await localAdmin
              .from("briefings")
              .select("requested_by")
              .eq("client_id", sabre.id)
              .eq("title", onBehalfTitle)
              .maybeSingle()
          ).data?.requested_by,
      )
      .toBe(teammate.id);
    const filed = value(
      await localAdmin
        .from("briefings")
        .select("id")
        .eq("client_id", sabre.id)
        .eq("title", onBehalfTitle)
        .single(),
    );
    await studioPage.goto(`/clients/${sabre.id}/briefings/${filed.id}`);
    await expect(
      studioPage.getByText(`Requested by ${teammate.name}`, { exact: true }),
    ).toBeVisible();

    // The studio removes the teammate from SABRE: their login stops working and they read as left.
    await studioPage.goto("/settings/clients");
    await studioPage.getByRole("button", { name: `${sabre.name} people`, exact: true }).click();
    const people = studioPage.getByRole("dialog", { name: `${sabre.name} people`, exact: true });
    await expect(people.getByText(teammate.email, { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page: studioPage }).analyze()).violations).toEqual([]);
    await studioPage.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => dialogFitsWidth(people)).toBe(true);
    await studioPage.setViewportSize({ width: 1600, height: 1000 });
    await people.getByRole("button", { name: `Remove ${teammate.name}`, exact: true }).click();
    const confirm = studioPage.getByRole("dialog", {
      name: `Remove ${teammate.name}?`,
      exact: true,
    });
    await expect(confirm).toContainText(`${teammate.name} loses access to ${sabre.name}.`);
    await confirm.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect(people.getByText(teammate.email, { exact: true })).toHaveCount(0);
    await expect
      .poll(
        async () =>
          value(
            await localAdmin
              .from("profiles")
              .select("removal_completed_at")
              .eq("id", teammate.id)
              .single(),
          ).removal_completed_at,
      )
      .not.toBeNull();
    await expect(localCaller(teammate.email)).rejects.toThrow(
      "Local acceptance authentication failed",
    );
    await studioPage.goto(`/clients/${sabre.id}/briefings/${filed.id}`);
    await expect(
      studioPage.getByText(`Requested by ${teammate.name} (left)`, { exact: true }),
    ).toBeVisible();
    await requesterPage.goto(`/clients/${sabre.id}/briefings/${filed.id}`);
    await expect(
      requesterPage.getByText("Requested by Former member", { exact: true }),
    ).toBeVisible();
  } finally {
    // Every step below owns its own failure: one throwing (a dropped connection, a slow delivery
    // container) must never skip the rest, so the shared fixture and the browser contexts are
    // never left behind for it. The first error is still surfaced, once everything has run.
    const errors: unknown[] = [];
    const step = async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        errors.push(error);
      }
    };
    await step(async () => {
      const filed = await localAdmin
        .from("briefings")
        .delete()
        .eq("client_id", sabre.id)
        .eq("title", onBehalfTitle);
      if (filed.error) throw filed.error;
    });
    await step(async () => {
      if (projectId) await cleanupTestProject(projectId);
    });
    await step(async () => {
      // Defensive: the teammate's own account teardown (`team.cleanup()`) cascades this row away
      // in the common case, but this still restores the flag explicitly if that ever fails first.
      const restored = await localAdmin
        .from("client_memberships")
        .update({ notify_all: false })
        .eq("client_id", sabre.id)
        .eq("user_id", teammate.id);
      if (restored.error) throw restored.error;
    });
    for (const context of contexts) await step(() => context.close());
    if (errors.length) throw errors[0];
  }
});
