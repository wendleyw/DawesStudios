import { expect, test as base, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { cleanupIntakeFixture, createIntakeFixture, type IntakeFixture } from "./intake-fixture";
import { createTeamFixture, type TeamFixture } from "./team-fixture";
import { credentials, localAdmin, localCaller, password, signIn } from "./test-support";

const logoImage = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));

const test = base.extend<{ intake: IntakeFixture }>({
  intake: async ({}, runWithFixture) => {
    const fixture = await createIntakeFixture();
    try {
      await runWithFixture(fixture);
    } finally {
      // A failed logo assertion can leave an unreferenced upload behind. Only this fixture's
      // private folder is eligible for removal; canonical client files are never touched.
      try {
        const objects = await localAdmin.storage.from("brand-assets").list(fixture.clientId);
        if (objects.error) throw objects.error;
        if (objects.data.length) {
          const removed = await localAdmin.storage
            .from("brand-assets")
            .remove(objects.data.map((object) => `${fixture.clientId}/${object.name}`));
          if (removed.error) throw removed.error;
        }
      } finally {
        await cleanupIntakeFixture(fixture);
      }
    }
  },
});

const staffTest = base.extend<{ team: TeamFixture }>({
  team: async ({}, runWithFixture) => {
    const fixture = createTeamFixture();
    try {
      await runWithFixture(fixture);
    } finally {
      await fixture.cleanup();
    }
  },
});

function clientRow(page: Page, fixture: IntakeFixture) {
  return page.locator(".settings-client-row").filter({ hasText: fixture.clientName });
}

async function verifyAccountActions(
  page: Page,
  account: { id: string; email: string; tag: string },
) {
  const displayName = `Acceptance Account ${account.tag}`;
  const nextPassword = `${password}-${account.tag}-changed`;
  await signIn(page, account.email);
  await page.goto("/settings/account");
  await page.getByLabel("Display name", { exact: true }).fill(displayName);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const profile = await localAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", account.id)
        .single();
      expect(profile.error).toBeNull();
      return profile.data?.display_name;
    })
    .toBe(displayName);
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(displayName);

  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toBeEmpty();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(/invalid login credentials/i);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(displayName);
}

test("a client saves their display name and password, then signs in only with the new password", async ({
  page,
  intake,
}) => {
  test.setTimeout(90_000);
  await verifyAccountActions(page, {
    id: intake.userId,
    email: intake.email,
    tag: intake.tag,
  });
});

for (const role of ["agency", "designer"] as const) {
  staffTest(
    `${role} account actions persist and reject the old password`,
    async ({ page, team }) => {
      staffTest.setTimeout(90_000);
      const member = await team.member(role);
      await verifyAccountActions(page, {
        id: member.id,
        email: member.email,
        tag: member.id.slice(0, 8),
      });
    },
  );
}

test("agency uploads and removes a client logo, with persistence and client write denial", async ({
  page,
  intake,
}) => {
  test.setTimeout(90_000);
  await signIn(page, credentials.agency);
  await page.goto("/settings/clients");
  await clientRow(page, intake)
    .getByRole("button", { name: `Change ${intake.clientName} logo` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Client logo" });
  await dialog.locator('input[type="file"]').setInputFiles(logoImage);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(`${intake.clientName} logo updated.`, { exact: true })).toBeVisible();
  const saved = await localAdmin
    .from("clients")
    .select("logo_path")
    .eq("id", intake.clientId)
    .single();
  expect(saved.error).toBeNull();
  const logoPath = saved.data!.logo_path;
  expect(logoPath).toMatch(new RegExp(`^${intake.clientId}/[a-f0-9-]+\\.png$`));
  const client = await localCaller(intake.email);
  const denied = await client
    .from("clients")
    .update({ logo_path: null })
    .eq("id", intake.clientId)
    .select("id");
  expect(denied.error).toBeNull();
  expect(denied.data).toEqual([]);
  expect(
    (await localAdmin.from("clients").select("logo_path").eq("id", intake.clientId).single()).data
      ?.logo_path,
  ).toBe(logoPath);
  await page.reload();
  await clientRow(page, intake)
    .getByRole("button", { name: `Change ${intake.clientName} logo` })
    .click();
  await expect(dialog.locator("img.settings-logo-mark")).toBeVisible();
  await expect(dialog.locator("img.settings-logo-mark")).toHaveJSProperty("naturalWidth", 96);
  await dialog.getByRole("button", { name: "Remove logo" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(`${intake.clientName} logo removed.`, { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await localAdmin.from("clients").select("logo_path").eq("id", intake.clientId).single())
          .data?.logo_path,
    )
    .toBeNull();
  await page.reload();
  await clientRow(page, intake)
    .getByRole("button", { name: `Change ${intake.clientName} logo` })
    .click();
  await expect(dialog.getByText("Upload logo")).toBeVisible();
  await expect(dialog.locator("img.settings-logo-mark")).toHaveCount(0);
  const files = await localAdmin.storage.from("brand-assets").list(intake.clientId);
  expect(files.error).toBeNull();
  expect(files.data?.some((file) => `${intake.clientId}/${file.name}` === logoPath)).toBe(false);
});

test("agency edits a campaign and another client's account cannot change it", async ({
  page,
  intake,
}) => {
  test.setTimeout(90_000);
  const title = `Acceptance Settings Campaign ${intake.tag}`;
  const revisedTitle = `${title} updated`;
  await signIn(page, credentials.agency);
  await page.goto("/settings/clients");
  await clientRow(page, intake).getByRole("button", { name: "Campaigns" }).click();
  const dialog = page.getByRole("dialog", { name: `${intake.clientName} campaigns` });
  await dialog.getByRole("button", { name: "New campaign" }).click();
  await dialog.getByLabel("Campaign name").fill(title);
  await dialog.getByLabel("Goal").fill("Launch a clean visual identity.");
  await dialog.getByLabel("Start date").fill("2026-11-01");
  await dialog.getByLabel("End date").fill("2026-11-30");
  await dialog.getByRole("button", { name: "Save campaign" }).click();
  const campaignRow = dialog.locator(".settings-list-row").filter({ hasText: title });
  await expect(campaignRow).toBeVisible();
  await campaignRow.getByRole("button", { name: "Edit" }).click();
  await dialog.getByLabel("Campaign name").fill(revisedTitle);
  await dialog.getByLabel("Goal").fill("Launch a refined visual identity.");
  await dialog.getByLabel("End date").fill("2026-12-15");
  await dialog.getByRole("button", { name: "Save campaign" }).click();
  await expect(
    dialog.locator(".settings-list-row").filter({ hasText: revisedTitle }),
  ).toBeVisible();

  const saved = await localAdmin
    .from("campaigns")
    .select("id,title,description,start_date,end_date")
    .eq("client_id", intake.clientId)
    .eq("title", revisedTitle)
    .single();
  expect(saved.error).toBeNull();
  expect(saved.data).toMatchObject({
    title: revisedTitle,
    description: "Launch a refined visual identity.",
    start_date: "2026-11-01",
    end_date: "2026-12-15",
  });
  const otherClient = await localCaller(credentials.client);
  const denied = await otherClient
    .from("campaigns")
    .update({ title: "Cross-client campaign edit" })
    .eq("id", saved.data!.id)
    .select("id");
  expect(denied.error).toBeNull();
  expect(denied.data).toEqual([]);
  expect(
    (await localAdmin.from("campaigns").select("title").eq("id", saved.data!.id).single()).data
      ?.title,
  ).toBe(revisedTitle);

  await page.reload();
  await clientRow(page, intake).getByRole("button", { name: "Campaigns" }).click();
  await dialog
    .locator(".settings-list-row")
    .filter({ hasText: revisedTitle })
    .getByRole("button", { name: "Edit" })
    .click();
  await expect(dialog.getByLabel("Campaign name")).toHaveValue(revisedTitle);
  await expect(dialog.getByLabel("Goal")).toHaveValue("Launch a refined visual identity.");
  await expect(dialog.getByLabel("Start date")).toHaveValue("2026-11-01");
  await expect(dialog.getByLabel("End date")).toHaveValue("2026-12-15");
  await dialog.getByRole("button", { name: `Close ${intake.clientName} campaigns` }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, intake.email);
  await page.goto("/settings/clients");
  await expect(page.getByRole("heading", { name: "Studio settings are private." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Campaigns" })).toHaveCount(0);
});
