import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { ServiceDefinition } from "../../features/briefings/briefing-model";
const catalog = JSON.parse(
  readFileSync(new URL("../../features/briefings/service-catalog.json", import.meta.url), "utf8"),
) as {
  types: ServiceDefinition[];
  formats: { id: string; name: string; width?: number; height?: number; layout: string }[];
};
const services = catalog.types;
function newDeliverable(id: string) {
  const format = catalog.formats.find((item) => item.id === id)!;
  return {
    name: format.name,
    width: format.layout === "none" ? undefined : format.width,
    height: format.layout === "fixed" ? format.height : undefined,
  };
}
import {
  cleanupIntakeFixture,
  createIntakeFixture,
  latestAuthEmail,
  type IntakeFixture,
} from "./intake-fixture";
import {
  credentials,
  localAdmin,
  localAgency,
  localCaller,
  password,
  screenshotDirectory,
  signIn,
} from "./test-support";

let fixture: IntakeFixture;
let briefingId: string;
let projectId: string;
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=",
  "base64",
);
async function balance() {
  const result = await localAdmin
    .from("credit_accounts")
    .select("balance")
    .eq("client_id", fixture.clientId)
    .single();
  if (result.error) throw result.error;
  return result.data.balance;
}

test.describe("Briefing intake, credits, and account administration", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });
  test.beforeAll(async () => {
    fixture = await createIntakeFixture();
  });
  test.afterAll(async () => {
    if (fixture) await cleanupIntakeFixture(fixture);
  });

  test("persists intake and attachments, submits free, accepts once, and reconciles credits", async ({
    page,
    browser,
  }) => {
    const agency = await localAgency();
    const title = `Acceptance Intake project ${fixture.tag}`;
    await signIn(page, fixture.email);
    await page.goto(`/clients/${fixture.clientId}/briefings/new`);
    await expect(page.locator(".service-card")).toHaveCount(20);
    for (const service of services)
      await expect(
        page
          .locator(".service-card")
          .filter({ has: page.getByRole("heading", { name: service.name, exact: true }) }),
      ).toBeVisible();
    await page.getByRole("button", { name: /Short Video \/ Reel/ }).click();
    await page.getByRole("button", { name: "Continue to details" }).click();
    await page.getByRole("button", { name: "Instagram Reels", exact: true }).click();
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("button", { name: /Simple Branding Package/ }).click();
    await expect(page.getByText(/Formats outside its scope were removed/)).toBeVisible();
    await page.getByRole("button", { name: /Short Video \/ Reel/ }).click();
    await page.getByRole("button", { name: "Continue to details" }).click();
    await expect(page.getByLabel("Custom name")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Campaign", exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Review briefing" }).click();
    await expect(page.locator(".briefing-validation")).toContainText("campaign");
    await page.getByText("Search campaigns", { exact: true }).click();
    await page.getByLabel("Find a campaign").fill("No campaign matches this search");
    await expect(
      page.getByText("No matching campaigns. Create one below.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New campaign", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Campaign name").fill(`Acceptance campaign ${fixture.tag}`);
    await dialog.getByLabel("Campaign goal").fill("Introduce our next outdoor collection");
    await dialog.getByRole("button", { name: "Create campaign" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("combobox", { name: "Campaign", exact: true })).not.toHaveValue("");
    await page.getByLabel("Project title").fill(title);
    await page.getByRole("button", { name: "Instagram Reels", exact: true }).click();
    await page.getByRole("button", { name: "Instagram Story", exact: true }).click();
    await page.getByLabel("Custom name").nth(0).fill("Collection launch reel");
    await page.getByLabel("Custom name").nth(1).fill("Story cutdown");
    await page.getByLabel("Design approach").nth(1).selectOption("adaptation");
    await page.getByRole("button", { name: "Instagram Reels", exact: true }).click();
    await page.getByLabel("Custom name").nth(2).fill("Second audience variation");
    await page.getByLabel("Quantity").nth(2).fill("2");
    await page.getByRole("button", { name: "Instagram Reels", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove Instagram Reels / Variation 3", exact: true })
      .click();
    await expect(page.getByLabel("Custom name")).toHaveCount(3);
    await page
      .getByLabel("Overview", { exact: true })
      .fill("Create a warm launch film using supplied outdoor footage.");
    await page
      .getByLabel("Goals", { exact: true })
      .fill("Increase visits to the collection launch page.");
    await page.getByLabel("Video duration").selectOption("30 seconds");
    await page.getByLabel("Footage & production").selectOption("Use supplied footage");
    await page.getByText("Brand direction & additional details", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Audience", exact: true })).toHaveValue(
      "Thoughtful outdoor explorers",
    );
    await page
      .getByRole("textbox", { name: "Audience", exact: true })
      .fill("Weekend explorers planning their next trip");
    await page.getByRole("button", { name: "Use brand defaults", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Audience", exact: true })).toHaveValue(
      "Thoughtful outdoor explorers",
    );
    await page
      .getByRole("textbox", { name: "Audience", exact: true })
      .fill("Weekend explorers planning their next trip");
    await page.getByLabel("Target due date").fill("2026-10-12");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(/briefings\/[^/]+\/edit$/);
    briefingId = page.url().split("/").at(-2)!;
    await page.getByLabel("Choose a briefing attachment").setInputFiles({
      name: "unsupported.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("unsupported"),
    });
    await expect(page.locator(".briefing-attachments .form-error")).toContainText(
      "Choose a PNG, JPG, WebP, or PDF file.",
    );
    await page
      .getByLabel("Choose a briefing attachment")
      .setInputFiles({ name: "launch-reference.png", mimeType: "image/png", buffer: tinyPng });
    await expect(
      page.getByRole("button", { name: "launch-reference.png", exact: true }),
    ).toBeVisible();
    const removedPath = (
      await localAdmin
        .from("briefing_attachments")
        .select("storage_path")
        .eq("briefing_id", briefingId)
        .single()
    ).data!.storage_path;
    await page.getByRole("button", { name: "Remove launch-reference.png", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove file", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "launch-reference.png", exact: true }),
    ).not.toBeVisible();
    expect(
      (await localAdmin.from("briefing_attachments").select("id").eq("briefing_id", briefingId))
        .data,
    ).toEqual([]);
    expect(
      (await localAdmin.storage.from("briefing-files").download(removedPath)).error,
    ).not.toBeNull();
    await page
      .getByLabel("Choose a briefing attachment")
      .setInputFiles({ name: "launch-reference.png", mimeType: "image/png", buffer: tinyPng });
    await expect(
      page.getByRole("button", { name: "launch-reference.png", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Project title")).toHaveValue(title);
    await expect(page.getByLabel("Design approach").nth(1)).toHaveValue("adaptation");
    await expect(page.getByLabel("Video duration")).toHaveValue("30 seconds");
    await expect(page.getByLabel("Target due date")).toHaveValue("2026-10-12");
    const staleContext = await browser.newContext();
    const stalePage = await staleContext.newPage();
    try {
      await signIn(stalePage, fixture.email);
      await stalePage.goto(`/clients/${fixture.clientId}/briefings/${briefingId}/edit`);
      await expect(stalePage.getByLabel("Project title")).toHaveValue(title);
      await page
        .getByRole("textbox", { name: "Goals", exact: true })
        .fill("Bring qualified visits to the launch page.");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
      await stalePage
        .getByRole("textbox", { name: "Goals", exact: true })
        .fill("Unsaved stale session goal");
      await stalePage.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(stalePage.locator(".form-error")).toContainText(
        "This draft changed in another session",
      );
      await expect(stalePage.getByRole("textbox", { name: "Goals", exact: true })).toHaveValue(
        "Unsaved stale session goal",
      );
      expect(
        (await localAdmin.from("briefings").select("goals").eq("id", briefingId).single()).data
          ?.goals,
      ).toBe("Bring qualified visits to the launch page.");
    } finally {
      await staleContext.close();
    }
    await page.getByRole("button", { name: "Review briefing" }).click();
    await expect(page.getByText("Collection launch reel", { exact: true })).toBeVisible();
    await page.screenshot({
      path: join(screenshotDirectory, "intake-briefing-review.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Send briefing", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/briefings/${briefingId}$`));
    await expect(page.getByRole("heading", { name: "With the studio." })).toBeVisible();
    const submitted = await localAdmin
      .from("briefings")
      .select("status,direction,requested_deliverables")
      .eq("id", briefingId)
      .single();
    expect(submitted.error).toBeNull();
    expect(submitted.data?.status).toBe("awaiting_review");
    expect(submitted.data?.direction).toMatchObject({
      audience: "Weekend explorers planning their next trip",
      questions: { duration: "30 seconds", production: "Use supplied footage" },
    });
    expect(
      (
        await localAdmin
          .from("brand_sections")
          .select("content")
          .eq("client_id", fixture.clientId)
          .eq("section", "overview")
          .single()
      ).data?.content,
    ).toEqual({ audience: "Thoughtful outdoor explorers" });
    expect(submitted.data?.requested_deliverables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Story cutdown",
          scope: "adaptation",
          width: 1080,
          height: 1920,
        }),
      ]),
    );
    expect(await balance()).toBe(100);
    expect(
      (await localAdmin.from("projects").select("id").eq("briefing_id", briefingId)).data,
    ).toEqual([]);
    const attachment = await localAdmin
      .from("briefing_attachments")
      .select("id,storage_path")
      .eq("briefing_id", briefingId)
      .single();
    expect(attachment.error).toBeNull();
    const client = await localCaller(fixture.email);
    expect(
      (await client.storage.from("briefing-files").download(attachment.data!.storage_path)).error,
    ).toBeNull();
    const agencyContext = await browser.newContext();
    const agencyPage = await agencyContext.newPage();
    try {
      await signIn(agencyPage, credentials.agency);
      await agencyPage.goto(`/clients/${fixture.clientId}/briefings/${briefingId}`);
      await agencyPage.getByLabel("Approved project credits").fill("9");
      await agencyPage.getByRole("button", { name: "Confirm budget" }).click();
      await expect(agencyPage.locator(".form-error")).toContainText("Explain");
      await agencyPage.getByLabel("Approved project credits").fill("101");
      await agencyPage
        .getByLabel("Scope note")
        .fill("Expanded scope exceeds the available balance");
      await agencyPage.getByRole("button", { name: "Confirm budget" }).click();
      await expect(agencyPage.getByRole("button", { name: /Accept.*project/ })).toBeDisabled();
      expect(
        (await agency.rpc("accept_briefing", { p_briefing_id: briefingId })).error?.message,
      ).toMatch(/insufficient/i);
      expect(await balance()).toBe(100);
      expect(
        (await localAdmin.from("projects").select("id").eq("briefing_id", briefingId)).data,
      ).toEqual([]);
      expect(
        (await client.rpc("confirm_briefing_budget", { p_briefing_id: briefingId, p_credits: 1 }))
          .error,
      ).not.toBeNull();
      expect(
        (await client.rpc("accept_briefing", { p_briefing_id: briefingId })).error,
      ).not.toBeNull();
      await agencyPage.getByLabel("Approved project credits").fill("9");
      await agencyPage
        .getByLabel("Scope note")
        .fill("Additional story adaptation and edit coverage");
      await agencyPage.getByRole("button", { name: "Confirm budget" }).click();
      await agencyPage.getByRole("button", { name: /Accept.*project/ }).click();
      await expect(agencyPage).toHaveURL(/\/projects\/[^/]+$/);
      projectId = agencyPage.url().split("/").at(-1)!;
      expect(await balance()).toBe(91);
      const replay = await Promise.all([
        agency.rpc("accept_briefing", { p_briefing_id: briefingId }),
        agency.rpc("accept_briefing", { p_briefing_id: briefingId }),
      ]);
      expect(replay.map((item) => item.data)).toEqual([projectId, projectId]);
      expect(replay.map((item) => item.error)).toEqual([null, null]);
      expect(
        (await localAdmin.from("credit_ledger").select("id").eq("project_id", projectId)).data,
      ).toHaveLength(1);
      expect(
        (await localAdmin.from("projects").select("id").eq("briefing_id", briefingId)).data,
      ).toHaveLength(1);
      expect(await balance()).toBe(91);
      await page.goto(`/clients/${fixture.clientId}/credits?project=${projectId}`);
      // Tabs and export live in the header card, like Briefings; activity rows stay on one line.
      const heading = page.locator(".client-page-heading");
      await expect(
        heading.getByRole("button", { name: "Client report", exact: true }),
      ).toBeVisible();
      await expect(heading.getByRole("button", { name: "Export CSV", exact: true })).toBeVisible();
      await expect(page.locator(".credit-table")).toHaveCount(0);
      expect(
        (await page.locator(".credit-list-row").first().boundingBox())!.height,
      ).toBeLessThanOrEqual(64);
      // The table's cell role is gone with the table; the row itself now carries the project title.
      await expect(
        page.locator(".credit-list-row").filter({ has: page.getByText(title, { exact: true }) }),
      ).toBeVisible();
      const reportProject = (
        await client.from("projects").select("campaign_id").eq("id", projectId).single()
      ).data!;
      const debit = (
        await client.from("credit_ledger").select("created_at").eq("project_id", projectId).single()
      ).data!;
      await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await page
        .getByRole("combobox", { name: "Campaign", exact: true })
        .selectOption(reportProject.campaign_id!);
      await page.getByRole("combobox", { name: "Project", exact: true }).selectOption(projectId);
      await page
        .getByRole("combobox", { name: "Period", exact: true })
        .selectOption(debit.created_at.slice(0, 7));
      await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption("added");
      await expect(page.getByRole("heading", { name: "No activity in this view." })).toBeVisible();
      await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption("used");
      await page.locator(".credit-list").getByRole("button").click();
      await expect(page.getByRole("dialog")).toContainText("Second audience variation");
      await expect(page.getByRole("dialog")).toContainText(
        "Additional story adaptation and edit coverage",
      );
      await page.keyboard.press("Escape");
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export CSV" }).click();
      const csv = await readFile((await (await downloaded).path())!, "utf8");
      expect(csv).toContain(title);
      expect(csv).toContain("-9");
      expect(csv.trim().split("\r\n")).toHaveLength(2);
      expect(csv.split("\r\n")[0].split(",")).toHaveLength(9);
      expect(csv).toContain("Additional story adaptation and edit coverage");
      expect(csv).toContain("Second audience variation");
      await page.getByLabel("Search credit activity").fill("No matching acceptance activity");
      await expect(page.getByRole("heading", { name: "No activity in this view." })).toBeVisible();
      await page.getByLabel("Search credit activity").fill("");
      await page.getByRole("button", { name: "Request credits", exact: true }).click();
      await dialog.getByRole("button", { name: "+25 credits", exact: true }).click();
      await dialog.getByLabel("Note").fill("Our next launch allocation");
      await page.getByRole("button", { name: "Send request" }).click();
      await expect(dialog).not.toBeVisible();
      expect(await balance()).toBe(91);
      const requested = await localAdmin
        .from("credit_requests")
        .select("id,status,amount")
        .eq("client_id", fixture.clientId)
        .single();
      expect(requested.data).toMatchObject({ status: "pending", amount: 25 });
      expect(
        (await client.rpc("fulfill_credit_request", { p_request_id: requested.data!.id })).error,
      ).not.toBeNull();
      await agencyPage.goto(`/clients/${fixture.clientId}/credits`);
      await agencyPage.getByRole("button", { name: "Review", exact: true }).click();
      await agencyPage.getByRole("button", { name: "Allocate credits" }).click();
      await expect(agencyPage.getByRole("dialog")).not.toBeVisible();
      expect(await balance()).toBe(116);
      expect(
        (await agency.rpc("fulfill_credit_request", { p_request_id: requested.data!.id })).error,
      ).toBeNull();
      expect(await balance()).toBe(116);
      await agencyPage.getByRole("button", { name: "Adjust credits", exact: true }).click();
      await agencyPage.getByLabel("Credit adjustment").fill("50");
      await agencyPage
        .getByLabel("Reason", { exact: true })
        .fill("Acceptance allocation correction");
      await agencyPage.getByRole("button", { name: "Save adjustment" }).click();
      await expect(agencyPage.getByRole("dialog")).not.toBeVisible();
      expect(await balance()).toBe(166);
      const adjustment = await localAdmin
        .from("credit_ledger")
        .select("id,idempotency_key")
        .eq("client_id", fixture.clientId)
        .eq("description", "Acceptance allocation correction")
        .single();
      expect(adjustment.error).toBeNull();
      const args = {
        p_client_id: fixture.clientId,
        p_amount: 50,
        p_description: "Acceptance allocation correction",
        p_idempotency_key: adjustment.data!.idempotency_key!,
      };
      const retry = await agency.rpc("adjust_credits", args);
      expect(retry.error).toBeNull();
      expect(retry.data).toBe(adjustment.data!.id);
      expect((await agency.rpc("adjust_credits", { ...args, p_amount: 51 })).error).not.toBeNull();
      expect(await balance()).toBe(166);
      await page.reload();
      await expect(page.locator(".credit-balance")).toContainText("166");
      await agencyPage.screenshot({
        path: join(screenshotDirectory, "intake-credit-report.png"),
        fullPage: true,
      });
    } finally {
      await agencyContext.close();
    }
  });

  test("persists workspace and preset edits without changing accepted budgets", async ({
    page,
  }) => {
    const agency = await localAgency();
    const workspace = (await localAdmin.from("workspace_settings").select("*").eq("id", 1).single())
      .data!;
    const preset = (
      await localAdmin.from("service_presets").select("*").eq("service_type", "reel").single()
    ).data!;
    const agencyId = (await agency.auth.getUser()).data.user!.id;
    const noticeTitle = `Acceptance timezone ${fixture.tag}`;
    // Dated ahead of every real notification so it sorts first: the feed shows only the latest
    // 100, and a populated agency (such as the SABRE overlay's 271) would push an older notice out.
    // 20 September keeps the same daylight-saving offsets the assertions below expect.
    const timestamp = "2099-09-20T18:30:00.000Z";
    const notice = await localAdmin.from("notifications").insert({
      user_id: agencyId,
      client_id: fixture.clientId,
      title: noticeTitle,
      kind: "acceptance.timezone",
      created_at: timestamp,
    });
    expect(notice.error).toBeNull();
    try {
      await signIn(page, credentials.agency);
      await page.goto("/settings/workspace");
      await page.getByLabel("Studio name", { exact: true }).fill("Acceptance Studio");
      await page.getByRole("combobox", { name: "Timezone", exact: true }).selectOption("UTC");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Studio updated.", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Studio name", { exact: true })).toHaveValue(
        "Acceptance Studio",
      );
      await expect(page.getByRole("combobox", { name: "Timezone", exact: true })).toHaveValue(
        "UTC",
      );
      await page.goto("/notifications");
      await expect(
        page.getByRole("article").filter({ hasText: noticeTitle }).locator("time"),
      ).toContainText("6:30 PM");
      await page.goto("/settings/workspace");
      await page
        .getByRole("combobox", { name: "Timezone", exact: true })
        .selectOption("America/New_York");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Studio updated.", { exact: true })).toBeVisible();
      await page.goto("/notifications");
      await expect(
        page.getByRole("article").filter({ hasText: noticeTitle }).locator("time"),
      ).toContainText("2:30 PM");
      expect(
        (
          await agency.rpc("update_workspace_settings", {
            p_studio_name: "Acceptance Studio",
            p_timezone: "Invalid/Timezone",
          })
        ).error,
      ).not.toBeNull();
      expect(
        (await localAdmin.from("workspace_settings").select("timezone").eq("id", 1).single()).data
          ?.timezone,
      ).toBe("America/New_York");
      await page.goto("/settings/presets");
      await page
        .locator(".settings-list-row")
        .filter({ hasText: "Short Video / Reel" })
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await page.getByLabel("Minimum credits").fill(String(preset.min_credits! + 1));
      await page.getByLabel("Maximum credits").fill(String(preset.max_credits! + 1));
      await page.getByLabel("Suggested delivery days").fill(String(preset.due_days! + 1));
      await page.getByRole("button", { name: "Save preset" }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      const saved = (
        await localAdmin.from("service_presets").select("*").eq("service_type", "reel").single()
      ).data!;
      expect(saved.revision).toBe(preset.revision + 1);
      expect(saved.min_credits).toBe(preset.min_credits! + 1);
      expect(
        (
          await localAdmin
            .from("briefings")
            .select("confirmed_credits")
            .eq("id", briefingId)
            .single()
        ).data?.confirmed_credits,
      ).toBe(9);
      await page.goto(`/clients/${fixture.clientId}/briefings/new`);
      await expect(page.getByRole("button", { name: /Short Video \/ Reel/ })).toContainText(
        `${preset.min_credits! + 1}–${preset.max_credits! + 1} credits`,
      );
      const client = await localCaller(fixture.email);
      expect(
        (
          await client.rpc("update_workspace_settings", {
            p_studio_name: "Unauthorized",
            p_timezone: "UTC",
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await client.rpc("save_service_preset", {
            p_service_type: "reel",
            p_min_credits: 1,
            p_max_credits: 2,
            p_due_days: 3,
          })
        ).error,
      ).not.toBeNull();
    } finally {
      const currentWorkspace = await localAdmin
        .from("workspace_settings")
        .select("updated_at")
        .eq("id", 1)
        .single();
      if (currentWorkspace.error) throw currentWorkspace.error;
      const restoredWorkspace = await agency.rpc("update_workspace_settings", {
        p_studio_name: workspace.studio_name,
        p_timezone: workspace.timezone,
        p_expected_updated_at: currentWorkspace.data.updated_at,
      });
      if (restoredWorkspace.error) throw restoredWorkspace.error;
      const currentPreset = await localAdmin
        .from("service_presets")
        .select("revision")
        .eq("service_type", "reel")
        .single();
      if (currentPreset.error) throw currentPreset.error;
      const restoredPreset = await agency.rpc("save_service_preset", {
        p_service_type: "reel",
        p_min_credits: preset.min_credits!,
        p_max_credits: preset.max_credits!,
        p_due_days: preset.due_days!,
        p_expected_revision: currentPreset.data.revision,
      });
      if (restoredPreset.error) throw restoredPreset.error;
    }
  });

  test("delivers real scoped invitation and recovery emails and enforces sender access", async ({
    page,
    browser,
    request,
  }) => {
    const email = `acceptance-invite-${fixture.tag}@client.dawes.local`;
    const client = await localCaller(fixture.email);
    const token = (await client.auth.getSession()).data.session!.access_token;
    const payload = { email, role: "client", clientId: fixture.clientId };
    expect((await request.post("/api/invitations", { data: payload })).status()).toBe(401);
    expect(
      (
        await request.post("/api/invitations", {
          headers: { Authorization: `Bearer ${token}` },
          data: payload,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/invitations", {
          headers: { Authorization: `Bearer ${token}`, Origin: "https://unrelated.example" },
          data: payload,
        })
      ).status(),
    ).toBe(403);
    await signIn(page, credentials.agency);
    await page.goto("/team");
    await page.getByRole("button", { name: "Invite someone", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email address").fill(email);
    await dialog.getByRole("combobox", { name: "Role", exact: true }).selectOption("client");
    await dialog.getByLabel("ClientChoose a client").selectOption(fixture.clientId);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Invitation email sent.", { exact: true })).toBeVisible();
    const user = (await localAdmin.auth.admin.listUsers()).data.users.find(
      (item) => item.email === email,
    );
    expect(user).toBeDefined();
    fixture.userIds.push(user!.id);
    const invitation = (
      await localAdmin
        .from("invitations")
        .select("id,status,client_id,role")
        .eq("email", email)
        .single()
    ).data!;
    expect(invitation).toMatchObject({
      status: "pending",
      client_id: fixture.clientId,
      role: "client",
    });
    expect(
      (await localAdmin.from("client_memberships").select("client_id").eq("user_id", user!.id))
        .data,
    ).toEqual([]);
    await expect.poll(() => latestAuthEmail(email, "invite")).not.toBeNull();
    const link = (await latestAuthEmail(email, "invite"))!;
    const agency = await localAgency();
    const agencyToken = (await agency.auth.getSession()).data.session!.access_token;
    const existingAccount = await request.post("/api/invitations", {
      headers: { Authorization: `Bearer ${agencyToken}` },
      data: { email: fixture.email, role: "client", clientId: fixture.clientId },
    });
    expect(existingAccount.status()).toBe(502);
    expect(
      (await localAdmin.from("invitations").select("status").eq("email", fixture.email).single())
        .data?.status,
    ).toBe("revoked");
    expect(
      (
        await localAdmin
          .from("client_memberships")
          .select("client_id")
          .eq("user_id", fixture.userId)
      ).data,
    ).toEqual([{ client_id: fixture.clientId }]);
    const context = await browser.newContext();
    const invitedPage = await context.newPage();
    try {
      await invitedPage.goto(link);
      await expect(
        invitedPage.getByRole("heading", { name: "Welcome to the studio." }),
      ).toBeVisible();
      await invitedPage.getByLabel("Password", { exact: true }).fill(password);
      await invitedPage.getByLabel("Confirm password", { exact: true }).fill(password);
      await invitedPage.getByRole("button", { name: "Accept invitation" }).click();
      await expect(invitedPage).toHaveURL(new RegExp(`/clients/${fixture.clientId}/overview$`));
      expect(
        (await localAdmin.from("invitations").select("status").eq("id", invitation.id).single())
          .data?.status,
      ).toBe("accepted");
      expect(
        (await localAdmin.from("client_memberships").select("client_id").eq("user_id", user!.id))
          .data,
      ).toEqual([{ client_id: fixture.clientId }]);
      const invited = await localCaller(email);
      const redirect = new URL(link).searchParams.get("redirect_to");
      const inviteToken = redirect ? new URL(redirect).searchParams.get("token") : null;
      expect(inviteToken).toBeTruthy();
      expect(
        (await invited.rpc("accept_invitation", { p_token: inviteToken! })).error,
      ).not.toBeNull();
      await invitedPage.goto("/settings/account");
      await invitedPage
        .getByLabel("Display name", { exact: true })
        .fill("Acceptance Client Member");
      await invitedPage.getByRole("button", { name: "Save profile" }).click();
      await expect(invitedPage.getByText("Profile saved.", { exact: true })).toBeVisible();
      expect(
        (await localAdmin.from("profiles").select("display_name").eq("id", user!.id).single()).data
          ?.display_name,
      ).toBe("Acceptance Client Member");
      await invitedPage.screenshot({
        path: join(screenshotDirectory, "intake-account-settings.png"),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
    const recoveryContext = await browser.newContext();
    const recoveryPage = await recoveryContext.newPage();
    try {
      await recoveryPage.goto("/auth/recovery");
      await recoveryPage.getByLabel("Email address").fill(email);
      await recoveryPage.getByRole("button", { name: "Send reset link" }).click();
      await expect(recoveryPage.getByRole("status")).toContainText("reset link is on its way");
      await expect.poll(() => latestAuthEmail(email, "recovery")).not.toBeNull();
      await recoveryPage.goto((await latestAuthEmail(email, "recovery"))!);
      await expect(recoveryPage.getByRole("heading", { name: "A fresh start." })).toBeVisible();
      const changed = `${password}-recovered`;
      await recoveryPage.getByLabel("New password", { exact: true }).fill(changed);
      await recoveryPage.getByLabel("Confirm new password", { exact: true }).fill(changed);
      await recoveryPage.getByRole("button", { name: "Set new password" }).click();
      await expect(
        recoveryPage.getByText("Your password has been updated.", { exact: true }),
      ).toBeVisible();
      await recoveryPage.getByRole("link", { name: "Back to your work" }).click();
      await expect(recoveryPage).toHaveURL(new RegExp(`/clients/${fixture.clientId}/overview$`));
      await recoveryPage.getByRole("button", { name: "Sign out", exact: true }).click();
      await recoveryPage.getByLabel("Email address").fill(email);
      await recoveryPage.getByLabel("Password", { exact: true }).fill(changed);
      await recoveryPage.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(recoveryPage).toHaveURL(new RegExp(`/clients/${fixture.clientId}/overview$`));
    } finally {
      await localAdmin.auth.admin.updateUserById(user!.id, { password });
      await recoveryContext.close();
    }
  });

  test("submits every catalog service and reconciles briefing filters with persisted scope", async ({
    page,
  }) => {
    const client = await localCaller(fixture.email);
    const campaignId = (
      await client.from("briefings").select("campaign_id").eq("id", briefingId).single()
    ).data!.campaign_id!;
    const initialBalance = await balance();
    for (const service of services) {
      const questions = Object.fromEntries(
        service.questions.map((question) => [
          question.id,
          question.options?.[0] ?? (question.id === "pages" ? "8" : "Acceptance catalog direction"),
        ]),
      );
      const deliverables = service.formats.map((format) => {
        const item = newDeliverable(format);
        return {
          name: item.name,
          format,
          width: item.width,
          height: item.height,
          quantity: 1,
          scope: "original",
        };
      });
      const saved = await client.rpc("save_briefing", {
        p_client_id: fixture.clientId,
        p_campaign_id: campaignId,
        p_service_type: service.id,
        p_title: `Acceptance catalog ${service.id}`,
        p_overview: "A complete service request for catalog acceptance.",
        p_direction: { questions },
        p_deliverables: deliverables,
        p_estimated_credits: service.min ?? 1,
      });
      expect(saved.error, service.id).toBeNull();
      expect(
        (await client.rpc("submit_briefing", { p_briefing_id: saved.data! })).error,
        service.id,
      ).toBeNull();
      const persisted = (
        await client
          .from("briefings")
          .select("status,direction,requested_deliverables")
          .eq("id", saved.data!)
          .single()
      ).data!;
      expect(persisted.status).toBe("awaiting_review");
      expect(persisted.direction).toEqual({ questions });
      expect(persisted.requested_deliverables).toEqual(JSON.parse(JSON.stringify(deliverables)));
    }
    expect(await balance()).toBe(initialBalance);
    expect(
      (
        await client.rpc("save_briefing", {
          p_client_id: fixture.clientId,
          p_service_type: "reel",
          p_title: "Acceptance unfinished draft",
        })
      ).error,
    ).toBeNull();
    await signIn(page, fixture.email);
    await page.goto(`/clients/${fixture.clientId}/briefings`);
    await expect(page.locator(".briefing-list-row")).toHaveCount(22);
    await page.getByRole("button", { name: "With the studio", exact: true }).click();
    await expect(page.locator(".briefing-list-row")).toHaveCount(20);
    await page.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(page.locator(".briefing-list-row")).toHaveCount(1);
    await page.getByRole("link", { name: /Acceptance unfinished draft/ }).click();
    await page.getByRole("link", { name: "Continue briefing", exact: true }).click();
    await expect(page.getByLabel("Project title")).toHaveValue("Acceptance unfinished draft");
    await page.goto(`/clients/${fixture.clientId}/briefings`);
    await page.getByRole("button", { name: "In progress", exact: true }).click();
    await expect(page.locator(".briefing-list-row")).toHaveCount(1);
    await page
      .getByRole("link", { name: new RegExp(`Acceptance Intake project ${fixture.tag}`) })
      .click();
    await expect(page.getByRole("link", { name: "Open project", exact: true })).toHaveAttribute(
      "href",
      `/projects/${projectId}`,
    );
  });

  test("shows assigned designers the accepted direction and attachments without financial fields", async ({
    page,
  }) => {
    const agency = await localAgency();
    const designer = await localCaller(credentials.designer);
    const designerId = (await designer.auth.getUser()).data.user!.id;
    expect(
      (await agency.rpc("assign_designer", { p_project_id: projectId, p_designer_id: designerId }))
        .error,
    ).toBeNull();
    expect((await designer.from("briefings").select("*").eq("id", briefingId)).data).toEqual([]);
    const assigned = await designer.rpc("get_assigned_briefings", {
      p_client_id: fixture.clientId,
    });
    expect(assigned.error).toBeNull();
    expect(assigned.data).toHaveLength(1);
    for (const field of ["author_id", "estimated_credits", "confirmed_credits", "budget_note"])
      expect(assigned.data![0]).not.toHaveProperty(field);
    const otherDesigner = await localCaller(credentials.designer2);
    expect(
      (await otherDesigner.rpc("get_assigned_briefings", { p_client_id: fixture.clientId })).data,
    ).toEqual([]);
    const attachment = (
      await localAdmin
        .from("briefing_attachments")
        .select("storage_path")
        .eq("briefing_id", briefingId)
        .single()
    ).data!;
    expect(
      (await designer.storage.from("briefing-files").download(attachment.storage_path)).error,
    ).toBeNull();
    expect(
      (await otherDesigner.storage.from("briefing-files").download(attachment.storage_path)).error,
    ).not.toBeNull();
    await signIn(page, credentials.designer);
    await page.goto(`/clients/${fixture.clientId}/briefings`);
    await page
      .getByRole("link", { name: new RegExp(`Acceptance Intake project ${fixture.tag}`) })
      .click();
    await expect(
      page.getByRole("heading", { name: "Creative direction", exact: true, level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("Collection launch reel", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "launch-reference.png", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Additional story adaptation and edit coverage", { exact: true }),
    ).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Credits", exact: true })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Open project", exact: true })).toHaveAttribute(
      "href",
      `/projects/${projectId}`,
    );
    await page.screenshot({
      path: join(screenshotDirectory, "intake-designer-briefing.png"),
      fullPage: true,
    });
  });

  test("creates a validated client workspace with opening credits and an empty board", async ({
    page,
  }) => {
    const name = `Acceptance Intake additional ${fixture.tag}`;
    try {
      await signIn(page, credentials.agency);
      await page.goto("/settings/clients");
      await page.getByRole("button", { name: "New client", exact: true }).click();
      await page.getByLabel("Client name", { exact: true }).fill("!!!");
      await page.getByRole("button", { name: "Create client", exact: true }).click();
      await expect(page.getByRole("dialog").locator(".form-error")).toContainText(
        "letters or numbers",
      );
      await page.getByLabel("Client name", { exact: true }).fill(name);
      await page.getByLabel("Industry", { exact: true }).fill("Outdoor goods");
      await page.getByLabel("Initial credit allocation").fill("25");
      await page.getByRole("button", { name: "Create client", exact: true }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      const created = (
        await localAdmin.from("clients").select("id,industry").eq("name", name).single()
      ).data!;
      expect(created.industry).toBe("Outdoor goods");
      expect(
        (
          await localAdmin
            .from("credit_accounts")
            .select("balance")
            .eq("client_id", created.id)
            .single()
        ).data?.balance,
      ).toBe(25);
      expect(
        (await localAdmin.from("credit_ledger").select("amount").eq("client_id", created.id)).data,
      ).toEqual([{ amount: 25 }]);
      await page.getByRole("link", { name: `Open ${name} board`, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/clients/${created.id}/board$`));
      expect(
        (await localAdmin.from("projects").select("id").eq("client_id", created.id)).data,
      ).toEqual([]);
      await page.reload();
      await expect(page.getByRole("navigation", { name: `${name} navigation` })).toBeVisible();
    } finally {
      const created = (await localAdmin.from("clients").select("id").eq("name", name).maybeSingle())
        .data;
      if (created)
        await cleanupIntakeFixture({
          ...fixture,
          clientId: created.id,
          clientName: name,
          userIds: [],
        });
    }
  });
});
