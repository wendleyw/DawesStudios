import { expect, test, type Page } from "@playwright/test";
import { credentials, localAdmin, screenshotDirectory, signIn } from "./test-support";

/** A SABRE project with its debit, read with the service role so the check needs no UI data. */
async function debitedProject(assignedTo?: string) {
  const sabre = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  expect(sabre.error).toBeNull();
  let projectIds: string[] | null = null;
  if (assignedTo) {
    const users = await localAdmin.auth.admin.listUsers();
    const user = users.data.users.find((item) => item.email === assignedTo)!;
    const assignments = await localAdmin
      .from("project_assignments")
      .select("project_id")
      .eq("designer_id", user.id);
    expect(assignments.error).toBeNull();
    projectIds = assignments.data!.map((row) => row.project_id);
  }
  let query = localAdmin
    .from("credit_ledger")
    .select("project_id,amount")
    .eq("client_id", sabre.data!.id)
    .eq("kind", "project_debit");
  if (projectIds) query = query.in("project_id", projectIds);
  const debit = await query.limit(1).single();
  expect(debit.error).toBeNull();
  return { projectId: debit.data!.project_id!, credits: -debit.data!.amount };
}

const creditsText = (credits: number) =>
  `${credits} ${credits === 1 ? "credit" : "credits"} used by this project`;

async function openMore(page: Page) {
  const more = page.locator(".project-chrome").getByRole("button", { name: "More", exact: true });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
}

for (const role of ["client", "agency"] as const) {
  test(`the ${role} sees the credits a project used in the bar's More menu`, async ({ page }) => {
    const { projectId, credits } = await debitedProject();
    await signIn(page, credentials[role]);
    await page.goto(`/projects/${projectId}`);
    await openMore(page);
    const chip = page.locator(".miro-bar-popover .project-credits-chip");
    await expect(chip).toHaveText(creditsText(credits));
    await expect(chip).toHaveAttribute("title", "Credits used by this project");
    await expect(chip.getByRole("link")).toHaveCount(0);
    await expect(chip).toBeInViewport();
    await page.locator(".project-chrome").screenshot({
      path: `${screenshotDirectory}/project-credits-${role}-1600.png`,
    });
  });
}

test("a designer's project page neither shows nor reads credits", async ({ page }) => {
  const { projectId } = await debitedProject(credentials.designer);
  const ledgerReads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/credit_ledger")) ledgerReads.push(request.url());
  });
  await signIn(page, credentials.designer);
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator(".project-chrome h1")).toBeVisible();
  const more = page.locator(".project-chrome").getByRole("button", { name: "More", exact: true });
  if (await more.count()) await more.click();
  await expect(page.locator(".project-credits-chip")).toHaveCount(0);
  expect(ledgerReads).toEqual([]);
});

test("on a phone the chip stays within the viewport", async ({ page }) => {
  const { projectId, credits } = await debitedProject();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, credentials.client);
  await page.goto(`/projects/${projectId}`);
  await openMore(page);
  const chip = page.locator(".miro-bar-popover .project-credits-chip");
  await expect(chip).toHaveText(creditsText(credits));
  await expect(chip).toBeInViewport();
  await page.screenshot({ path: `${screenshotDirectory}/project-credits-client-390.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
