import { expect, test } from "@playwright/test";
import { cleanupIntakeFixture, createIntakeFixture, type IntakeFixture } from "./intake-fixture";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";

/**
 * The same UTC month math as `features/credits/credit-model.ts`, restated here rather than
 * imported: that module's runtime import chain reaches `briefing-model.ts`'s JSON service-catalog
 * import, which Playwright's Node ESM test loader (unlike the app's Next.js bundler) refuses
 * without an import attribute. Every other spec in this directory keeps the same distance from
 * feature runtime code for the same reason (see `intake-admin.spec.ts`'s inline current-month
 * calculation).
 */
function creditMonthOf(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function addCreditMonths(month: string, count: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return creditMonthOf(new Date(Date.UTC(year, monthIndex - 1 + count, 1)));
}
function creditMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T00:00:00Z`));
}

/**
 * The monthly credits model (docs/superpowers/specs/2026-09-27-monthly-credits-design.md): a plan
 * grants a monthly allowance, a briefing is accepted into a chosen month (the current month or any
 * of the next 11), a project can move to another open month, and its final cost is settled once
 * against its final total. This spec drives the full path through the UI on a disposable fixture
 * client, reusing `createIntakeFixture`/`cleanupIntakeFixture` (which already deletes the client's
 * `credit_months`, `credit_plans`, `credit_ledger`, `credit_requests` and `project_settlements`
 * rows), so every row this spec creates is removed with the fixture client itself.
 */

let fixture: IntakeFixture;
let campaignId: string;
let projectId: string;

const currentMonth = creditMonthOf(new Date());
const nextMonth = addCreditMonths(currentMonth, 1);
const laterMonth = addCreditMonths(currentMonth, 2);

test.describe("Monthly credits", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(async () => {
    fixture = await createIntakeFixture();
    // `save_briefing`/`submit_briefing` require a campaign; the fixture client has none, and
    // `cleanupIntakeFixture` already deletes every campaign of the client it removes.
    const campaign = await localAdmin
      .from("campaigns")
      .insert({ client_id: fixture.clientId, title: `Acceptance monthly credits ${fixture.tag}` })
      .select("id")
      .single();
    if (campaign.error) throw campaign.error;
    campaignId = campaign.data.id;
  });

  test.afterAll(async () => {
    if (fixture) await cleanupIntakeFixture(fixture);
  });

  test("the agency sets a monthly plan and accepts a briefing into a future month", async ({
    page,
  }) => {
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/credits`);
    await page.getByRole("button", { name: "Set plan", exact: true }).click();
    const planDialog = page.getByRole("dialog");
    await planDialog.getByLabel("Credits per month").fill("40");
    await planDialog.getByRole("button", { name: "Save plan", exact: true }).click();
    await expect(planDialog).not.toBeVisible();
    // The plan grants the allowance to every month already open, including the fixture's current
    // month (100 opening credits + 40 from the new plan).
    await expect(page.locator(".credit-balance")).toContainText("140");
    await expect(page.locator(".credit-plan")).toContainText("40 credits a month");
    await expect(page.locator(".credit-plan")).toContainText(
      `Plan since ${creditMonthLabel(currentMonth)}`,
    );

    const agency = await localAgency();
    const created = await agency.rpc("save_briefing", {
      p_client_id: fixture.clientId,
      p_campaign_id: campaignId,
      p_title: `Acceptance monthly credits briefing ${fixture.tag}`,
      p_service_type: "static-ad",
      p_overview: "A monthly-credits acceptance briefing accepted into a future month.",
      p_goals: "Cover the plan allowance, a future-month acceptance and the client's balance.",
      p_direction: { questions: { content: "I’ll provide the content" } },
      p_deliverables: [
        {
          name: "Campaign square",
          format: "square",
          width: 1080,
          height: 1080,
          quantity: 1,
          scope: "original",
        },
      ],
      p_estimated_credits: 20,
    });
    if (created.error) throw created.error;
    const briefingId = created.data as string;
    expect((await agency.rpc("submit_briefing", { p_briefing_id: briefingId })).error).toBeNull();

    await page.goto(`/clients/${fixture.clientId}/briefings/${briefingId}`);
    await page.getByLabel("Approved project credits").fill("20");
    await page.getByLabel("Scope note").fill("Confirmed scope for the future-month acceptance.");
    await page.getByLabel("Credit month").selectOption(nextMonth);
    await page.getByRole("button", { name: "Confirm budget", exact: true }).click();
    await expect(
      page.getByText(new RegExp(`20 credits . one project . ${creditMonthLabel(nextMonth)}`)),
    ).toBeVisible();
    await expect(page.getByLabel("Credit month")).toHaveValue(nextMonth);
    await page.getByRole("button", { name: /Accept.*project/ }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    projectId = page.url().split("/").at(-1)!;

    const nextMonthRow = await localAdmin
      .from("credit_months")
      .select("balance,status")
      .eq("client_id", fixture.clientId)
      .eq("month", nextMonth)
      .single();
    expect(nextMonthRow.data).toMatchObject({ balance: 20, status: "open" });
  });

  test("the client sees the future month's balance and its expiring notice", async ({ page }) => {
    await signIn(page, fixture.email);
    await page.goto(`/clients/${fixture.clientId}/credits`);
    await page.getByLabel("Credit month").selectOption(nextMonth);
    await expect(page.locator(".credit-balance")).toHaveText("20credits");
    await expect(page.locator(".credit-expiry")).toContainText("20 credits expire on");
  });

  test("the agency moves the project to a later month", async ({ page }) => {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Project details", exact: true }).click();
    const panel = page.locator(".project-details");
    await expect(panel).toContainText(`20 · ${creditMonthLabel(nextMonth)}`);
    await panel.getByRole("button", { name: "Move to another month", exact: true }).click();
    const moveDialog = page.getByRole("dialog");
    await moveDialog.getByLabel("New month").selectOption(laterMonth);
    await moveDialog
      .getByRole("button", { name: `Move to ${creditMonthLabel(laterMonth)}`, exact: true })
      .click();
    await expect(moveDialog).not.toBeVisible();
    await expect(panel).toContainText(`20 · ${creditMonthLabel(laterMonth)}`);

    const project = await localAdmin
      .from("projects")
      .select("credit_month")
      .eq("id", projectId)
      .single();
    expect(project.data?.credit_month).toBe(laterMonth);
    // The origin month was still open, so its 20 credits returned (its 40 allowance, untouched).
    const origin = await localAdmin
      .from("credit_months")
      .select("balance")
      .eq("client_id", fixture.clientId)
      .eq("month", nextMonth)
      .single();
    expect(origin.data?.balance).toBe(40);
    const target = await localAdmin
      .from("credit_months")
      .select("balance")
      .eq("client_id", fixture.clientId)
      .eq("month", laterMonth)
      .single();
    expect(target.data?.balance).toBe(20);
  });

  // The client sees the reason on the settlement line, so both roles need to read the same text.
  const settlementReason = "Delivered scope came in under the confirmed estimate.";

  test("the agency settles the project's final credits with a reason", async ({ page }) => {
    // Settlement is offered only at approval or delivery; this test's scope is the settlement
    // procedure itself, so the precondition is arranged directly rather than through the full
    // design-review workflow, which is exercised elsewhere.
    const arranged = await localAdmin
      .from("projects")
      .update({ status: "approved" })
      .eq("id", projectId);
    expect(arranged.error).toBeNull();

    await signIn(page, credentials.agency);
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Project details", exact: true }).click();
    const panel = page.locator(".project-details");
    await panel.getByRole("button", { name: "Settle final credits", exact: true }).click();
    const settleDialog = page.getByRole("dialog");
    await settleDialog.getByLabel("Final total").fill("17");
    await settleDialog.getByLabel("Reason", { exact: true }).fill(settlementReason);
    await settleDialog.getByRole("button", { name: "Settle credits", exact: true }).click();
    await expect(settleDialog).not.toBeVisible();
    await expect(panel).toContainText(`17 · ${creditMonthLabel(laterMonth)}`);
    await expect(panel).toContainText(`3 refunded to ${creditMonthLabel(currentMonth)}`);
    await expect(panel).toContainText(settlementReason);

    const settlement = await localAdmin
      .from("project_settlements")
      .select("final_credits,difference,charged_month,reason")
      .eq("project_id", projectId)
      .single();
    expect(settlement.data).toMatchObject({
      final_credits: 17,
      difference: -3,
      charged_month: currentMonth,
      reason: settlementReason,
    });
  });

  test("the client sees the settlement line and its reason", async ({ page }) => {
    await signIn(page, fixture.email);
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Project details", exact: true }).click();
    const clientPanel = page.locator(".project-details");
    await expect(clientPanel).toContainText(`3 refunded to ${creditMonthLabel(currentMonth)}`);
    await expect(clientPanel).toContainText(settlementReason);
  });
});
