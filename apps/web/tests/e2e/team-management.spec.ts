import { expect, test as base, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createTeamFixture, type TeamFixture, type TeamMemberFixture } from "./team-fixture";
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

function memberRow(page: Page, member: TeamMemberFixture) {
  return page.locator(".settings-list-row").filter({ hasText: member.name });
}

async function confirmRemoval(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Remove this team member?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function profileState(id: string) {
  const result = await localAdmin
    .from("profiles")
    .select("id,role,display_name,removed_at,removal_completed_at")
    .eq("id", id)
    .single();
  expect(result.error).toBeNull();
  return result.data!;
}

test.describe("Team management", () => {
  test("the only active agency member cannot be demoted or removed", async () => {
    const agency = await localAgency();
    const agencyId = (await agency.auth.getSession()).data.session!.user.id;
    const active = await localAdmin
      .from("profiles")
      .select("id")
      .eq("role", "agency")
      .is("removed_at", null);
    expect(active.error).toBeNull();
    // Refuse to test the canonical account unless the invariant guarantees a rejected write.
    expect(active.data).toEqual([{ id: agencyId }]);
    const before = await profileState(agencyId);
    const role = await agency.rpc("set_team_member_role", {
      p_profile_id: agencyId,
      p_role: "designer",
    });
    expect(role.error?.message).toContain("Cannot change the studio's only agency member");
    const removal = await agency.rpc("remove_team_member", { p_profile_id: agencyId });
    expect(removal.error?.message).toContain("Cannot remove the studio's only agency member");
    expect(await profileState(agencyId)).toEqual(before);
  });

  test("Team has its own agency navigation and preserves the legacy link", async ({ page }) => {
    await signIn(page, credentials.agency);
    await page.getByRole("link", { name: "Team", exact: true }).click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/settings/team");
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link", { name: "Team", exact: true }),
    ).toHaveCount(0);
  });

  test("Team fits desktop and phone viewports and passes accessibility checks", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page, credentials.agency);
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: width === 1600 ? 1000 : 844 });
      await page.goto("/team");
      await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
      await expect(page.locator(".team-page .settings-list-row").first()).toBeVisible();
      await expect(page.getByText("Loading invitations…", { exact: true })).toHaveCount(0);
      const name = page.getByText("Alex Morgan", { exact: true });
      const nameBounds = await name.boundingBox();
      // Overflow and axe both miss a full-width role select squeezing a name into one letter
      // per line on desktop. A normal short name must remain a readable line at either width.
      expect(nameBounds!.height).toBeLessThan(32);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      const accessibility = await new AxeBuilder({ page }).analyze();
      await page.screenshot({ path: testInfo.outputPath(`team-${width}.png`), fullPage: true });
      await testInfo.attach(`team-${width}-accessibility`, {
        body: JSON.stringify({ width, overflow, violations: accessibility.violations }, null, 2),
        contentType: "application/json",
      });
      expect(overflow, `Team must fit the ${width}px viewport`).toBe(false);
      expect(accessibility.violations, `Team accessibility at ${width}px`).toEqual([]);
    }
  });

  test("role changes persist and immediately change an existing caller's permissions", async ({
    page,
    team,
  }) => {
    const member = await team.member();
    const caller = await localCaller(member.email);
    const agency = await localAgency();
    const agencyId = (await agency.auth.getSession()).data.session!.user.id;
    const visibleAgency = async () => {
      const result = await caller.from("profiles").select("id").eq("id", agencyId);
      expect(result.error).toBeNull();
      return result.data;
    };
    expect(await visibleAgency()).toEqual([]);
    await signIn(page, credentials.agency);
    await page.goto("/team");
    await memberRow(page, member).getByRole("combobox").selectOption("agency");
    await expect.poll(async () => (await profileState(member.id)).role).toBe("agency");
    expect(await visibleAgency()).toEqual([{ id: agencyId }]);
    await page.reload();
    await expect(memberRow(page, member).getByRole("combobox")).toHaveValue("agency");
    await memberRow(page, member).getByRole("combobox").selectOption("designer");
    await expect.poll(async () => (await profileState(member.id)).role).toBe("designer");
    expect(await visibleAgency()).toEqual([]);
    await page.reload();
    await expect(memberRow(page, member).getByRole("combobox")).toHaveValue("designer");
  });

  test("removal blocks old-token project access and new sign-in while preserving authored history", async ({
    page,
    team,
  }) => {
    const member = await team.member();
    const projectId = await team.assignedProject(member);
    const caller = await localCaller(member.email);
    const visible = await caller.from("projects").select("id").eq("id", projectId);
    expect(visible.error).toBeNull();
    expect(visible.data).toEqual([{ id: projectId }]);
    const comment = await caller.rpc("post_comment", {
      p_project_id: projectId,
      p_channel: "internal",
      p_body: "Acceptance Team history survives removal.",
    });
    expect(comment.error).toBeNull();
    expect(comment.data).toBeTruthy();

    await signIn(page, credentials.agency);
    await page.goto("/team");
    await expect(memberRow(page, member)).toContainText("Designer · 1 active project");
    await memberRow(page, member).getByRole("button", { name: "Remove", exact: true }).click();
    await confirmRemoval(page);
    await expect(memberRow(page, member)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
    await expect(page.getByText("Loading the team…", { exact: true })).toHaveCount(0);
    await expect(memberRow(page, member)).toHaveCount(0);

    const removed = await profileState(member.id);
    expect(removed).toMatchObject({ id: member.id, display_name: member.name, role: "designer" });
    expect(removed.removed_at).not.toBeNull();
    expect(removed.removal_completed_at).not.toBeNull();
    const assignments = await localAdmin
      .from("project_assignments")
      .select("project_id")
      .eq("designer_id", member.id);
    expect(assignments.error).toBeNull();
    expect(assignments.data).toEqual([]);
    const history = await localAdmin
      .from("internal_comments")
      .select("author_id,body")
      .eq("id", comment.data!)
      .single();
    expect(history.error).toBeNull();
    expect(history.data).toEqual({
      author_id: member.id,
      body: "Acceptance Team history survives removal.",
    });
    const oldSessionRead = await caller.from("projects").select("id");
    expect(oldSessionRead.error).toBeNull();
    expect(oldSessionRead.data).toEqual([]);
    const deniedWrite = await caller.rpc("post_comment", {
      p_project_id: projectId,
      p_channel: "internal",
      p_body: "This removed caller must not publish a comment.",
    });
    expect(deniedWrite.error).not.toBeNull();
    await expect(localCaller(member.email)).rejects.toThrow(
      "Local acceptance authentication failed",
    );
  });

  test("an unfinished Auth block remains recoverable after reloading Team", async ({
    page,
    team,
  }) => {
    const member = await team.member();
    const projectId = await team.assignedProject(member);
    const caller = await localCaller(member.email);
    const agency = await localAgency();
    const removed = await agency.rpc("remove_team_member", { p_profile_id: member.id });
    expect(removed.error).toBeNull();
    const pending = await profileState(member.id);
    expect(pending.removed_at).not.toBeNull();
    expect(pending.removal_completed_at).toBeNull();
    const noAccess = await caller.from("projects").select("id").eq("id", projectId);
    expect(noAccess.error).toBeNull();
    expect(noAccess.data).toEqual([]);
    // Only the RPC ran: authentication can still succeed, but data authorization has ended.
    await localCaller(member.email);
    await signIn(page, credentials.agency);
    await page.goto("/team");
    await expect(memberRow(page, member)).toContainText("Access removed · Account block pending");
    await page.reload();
    await expect(memberRow(page, member)).toContainText("Access removed · Account block pending");
    await expect(memberRow(page, member).getByRole("combobox")).toHaveCount(0);
    await memberRow(page, member).getByRole("button", { name: "Finish removal" }).click();
    await confirmRemoval(page);
    await expect(memberRow(page, member)).toHaveCount(0);
    const completed = await profileState(member.id);
    expect(completed.removed_at).toBe(pending.removed_at);
    expect(completed.removal_completed_at).not.toBeNull();
    await expect(localCaller(member.email)).rejects.toThrow(
      "Local acceptance authentication failed",
    );
  });

  for (const role of ["designer", "client"] as const) {
    test(`${role} cannot navigate to Team or invoke removal`, async ({ page, request, team }) => {
      const callerMember = await team.member(role);
      const target = await team.member();
      const before = await profileState(target.id);
      const caller = await localCaller(callerMember.email);
      const token = (await caller.auth.getSession()).data.session!.access_token;
      const result = await request.post(`/api/team-members/${target.id}/remove`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(result.status()).toBe(403);
      expect(await profileState(target.id)).toEqual(before);
      await signIn(page, callerMember.email);
      await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
      await page.goto("/team");
      await expect(
        page.getByRole("heading", { name: "Studio settings are private." }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Invite someone" })).toHaveCount(0);
      await expect(page.getByText(target.name, { exact: true })).toHaveCount(0);
    });
  }

  test("a concurrent promotion and removal cannot reactivate the removed account", async ({
    request,
    team,
  }) => {
    const member = await team.member();
    const caller = await localCaller(member.email);
    const agency = await localAgency();
    const session = (await agency.auth.getSession()).data.session!;
    const [promotion, removal] = await Promise.all([
      agency.rpc("set_team_member_role", { p_profile_id: member.id, p_role: "agency" }),
      request.post(`/api/team-members/${member.id}/remove`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
    ]);
    expect(removal.status()).toBe(200);
    if (promotion.error)
      expect(promotion.error.message).toContain("Target is not an active team member");
    const removed = await profileState(member.id);
    expect(removed.removed_at).not.toBeNull();
    expect(removed.removal_completed_at).not.toBeNull();
    const retry = await agency.rpc("set_team_member_role", {
      p_profile_id: member.id,
      p_role: "agency",
    });
    expect(retry.error?.message).toContain("Target is not an active team member");
    const oldToken = await caller.from("profiles").select("id").eq("id", session.user.id);
    expect(oldToken.error).toBeNull();
    expect(oldToken.data).toEqual([]);
    await expect(localCaller(member.email)).rejects.toThrow(
      "Local acceptance authentication failed",
    );
  });
});
