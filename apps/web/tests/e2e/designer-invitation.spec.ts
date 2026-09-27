import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { latestAuthEmail } from "./intake-fixture";
import {
  credentials,
  localAdmin,
  localCaller,
  password,
  runPrivilegedSql,
  screenshotDirectory,
  signIn,
} from "./test-support";

test("a named designer accepts the captured invitation and can sign in with their password", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const email = `acceptance-designer-${randomUUID()}@dawes.local`;
  const name = "Taylor Morgan";
  let invitationId: string | undefined;
  let userId: string | undefined;
  try {
    await page.setViewportSize({ width: 1512, height: 696 });
    await signIn(page, credentials.agency);
    await page.goto("/team");
    await page.getByRole("button", { name: "Invite someone", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Invite someone", exact: true });
    await dialog.getByLabel(/Full name/).fill(`  ${name}  `);
    await dialog.getByLabel("Email address", { exact: true }).fill(email);
    await expect(dialog.getByRole("combobox", { name: "Role", exact: true })).toHaveValue(
      "designer",
    );
    expect((await new AxeBuilder({ page }).include("dialog").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `${screenshotDirectory}/designer-invitation-name-desktop.png` });
    const sent = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/invitations") && response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Send invitation", exact: true }).click();
    const response = await sent;
    expect(response.status()).toBe(200);
    invitationId = ((await response.json()) as { id: string }).id;
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Invitation email sent.", { exact: true })).toBeVisible();
    const users = await localAdmin.auth.admin.listUsers();
    if (users.error) throw users.error;
    const account = users.data.users.find((user) => user.email === email);
    expect(account).toBeDefined();
    userId = account!.id;
    const before = await localAdmin
      .from("profiles")
      .select("display_name,role")
      .eq("id", userId)
      .single();
    expect(before.error).toBeNull();
    expect(before.data).toEqual({ display_name: name, role: "client" });
    await expect.poll(() => latestAuthEmail(email, "invite")).not.toBeNull();
    const context = await browser.newContext();
    try {
      const designer = await context.newPage();
      await designer.goto((await latestAuthEmail(email, "invite"))!);
      await designer.getByLabel("Password", { exact: true }).fill(password);
      await designer.getByLabel("Confirm password", { exact: true }).fill(password);
      await designer.getByRole("button", { name: "Accept invitation", exact: true }).click();
      await expect(designer).toHaveURL(/\/home$/);
      const caller = await localCaller(email);
      const profile = await caller
        .from("profiles")
        .select("display_name,role")
        .eq("id", userId)
        .single();
      expect(profile.error).toBeNull();
      expect(profile.data).toEqual({ display_name: name, role: "designer" });
      const projects = await caller.from("projects").select("id");
      expect(projects.error).toBeNull();
      expect(projects.data).toEqual([]);
      await page.reload();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  } finally {
    const found = await localAdmin.from("invitations").select("id").eq("email", email);
    if (found.error) throw found.error;
    const ids = [
      ...new Set([invitationId, ...(found.data ?? []).map((item) => item.id)].filter(Boolean)),
    ];
    if (ids.length) {
      if (ids.some((id) => !/^[0-9a-f-]{36}$/.test(id!)))
        throw new Error("Invalid invitation cleanup ID.");
      const targets = ids.map((id) => `'${id}'`).join(",");
      runPrivilegedSql(`begin;
        delete from private.audit_events where entity_id in (${targets});
        delete from private.invitation_tokens where invitation_id in (${targets});
        delete from public.invitations where id in (${targets}) and email='${email}';
        commit;`);
    }
    if (!userId) {
      const users = await localAdmin.auth.admin.listUsers();
      if (users.error) throw users.error;
      userId = users.data.users.find((user) => user.email === email)?.id;
    }
    if (userId) {
      const account = await localAdmin.auth.admin.getUserById(userId);
      if (account.error || account.data.user?.email !== email)
        throw new Error("Refusing to remove a non-fixture designer account.");
      const removed = await localAdmin.auth.admin.deleteUser(userId);
      if (removed.error) throw removed.error;
    }
  }
});
