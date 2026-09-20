import { test, expect } from "@playwright/test";
import {
  credentials,
  localAdmin,
  localAgency,
  localCaller,
  password,
  signIn,
} from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

test("board views, filters, campaign validation, movement and scoped search", async ({ page }) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const campaignTitle = `Acceptance campaign ${crypto.randomUUID()}`;
  try {
    const project = (await agency.from("projects").select("*").eq("id", fixture.projectId).single())
      .data!;
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/board`);
    await page.getByLabel("Search projects").fill(project.title);
    await expect(page.locator(".board-result-count")).toHaveText("1 project");
    const node = page.locator(`.react-flow__node[data-id="${fixture.projectId}"]`);
    const grip = node.locator(".board-card-grip");
    await expect(grip).toBeVisible();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (
            await agency
              .from("projects")
              .select("board_position")
              .eq("id", fixture.projectId)
              .single()
          ).data?.board_position,
      )
      .not.toEqual(project.board_position);
    const moved = (
      await agency.from("projects").select("board_position").eq("id", fixture.projectId).single()
    ).data!.board_position as { x: number; y: number };
    await page.reload();
    await page.getByLabel("Search projects").fill(project.title);
    await expect(node).toHaveAttribute(
      "style",
      new RegExp(`translate\\(${moved.x}px, ${moved.y}px\\)`),
    );
    for (const view of ["list", "kanban"]) {
      await page.getByLabel("Board view").selectOption(view);
      await expect(
        page.locator(
          `.${view === "list" ? "board-list" : "kanban-board"} a[href="/projects/${fixture.projectId}"]`,
        ),
      ).toBeVisible();
    }
    await page.getByLabel("Board view").selectOption("timeline");
    const period = await page.locator(".project-timeline header strong").innerText();
    await page.getByRole("button", { name: "Next two weeks" }).click();
    await expect(page.locator(".project-timeline header strong")).not.toHaveText(period);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.locator(".project-timeline header strong")).toHaveText(period);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("delivered");
    await expect(page.getByRole("heading", { name: "No projects match." })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByLabel("Search projects")).toBeEmpty();
    await page.getByRole("button", { name: "New campaign", exact: true }).click();
    await page.getByLabel("Campaign name").fill(campaignTitle);
    await page.getByLabel("Start date").fill("2026-10-20");
    await page.getByLabel("End date").fill("2026-10-10");
    await page.getByRole("button", { name: "Create campaign", exact: true }).click();
    await expect(page.locator("main [role=alert]")).toHaveText(
      "The end date must be on or after the start date.",
    );
    await page.getByLabel("End date").fill("2026-10-30");
    await page.getByRole("button", { name: "Create campaign", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".board-result-count")).toHaveText("0 projects");
    expect(
      (
        await agency
          .from("campaigns")
          .select("title,start_date,end_date")
          .eq("title", campaignTitle)
          .single()
      ).data,
    ).toEqual({ title: campaignTitle, start_date: "2026-10-20", end_date: "2026-10-30" });
    await page.keyboard.press("Meta+k");
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByLabel("Search your workspace")).toBeFocused();
    await page.getByLabel("Search your workspace").fill("No such acceptance project");
    await expect(page.getByRole("heading", { name: "No matches yet." })).toBeVisible();
    await page.route("**/rest/v1/projects?**", async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary acceptance outage" }),
      }),
    );
    await page.getByLabel("Search your workspace").fill(project.title);
    await expect(page.locator("main [role=alert]")).toContainText(
      "We couldn’t complete the search.",
      { timeout: 30000 },
    );
    await page.unroute("**/rest/v1/projects?**");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.locator(`.search-result[href="/projects/${fixture.projectId}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(project.title);
  } finally {
    await cleanupTestProject(fixture.projectId);
    const cleanup = await localAdmin.from("campaigns").delete().eq("title", campaignTitle);
    expect(cleanup.error).toBeNull();
  }
});

test("project details detect stale edits, persist dates, revoke assignment and keep general channels private", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    await page.getByRole("button", { name: "Project details", exact: true }).click();
    await page.getByRole("button", { name: "Edit project details" }).click();
    await page.getByLabel("Start date").fill("2026-10-20");
    await page.getByLabel("Due date").fill("2026-10-10");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.locator("main [role=alert]")).toContainText("due date must be on or after");
    await page.getByLabel("Due date").fill("2026-10-30");
    const competing = await agency
      .from("projects")
      .update({ description: "A newer edit from another tab." })
      .eq("id", fixture.projectId);
    expect(competing.error).toBeNull();
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.locator("main [role=alert]")).toContainText("changed while you were editing");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".project-details")).toContainText("A newer edit from another tab.");
    await page.getByRole("button", { name: "Edit project details" }).click();
    await page.getByLabel("Start date").fill("2026-10-20");
    await page.getByLabel("Due date").fill("2026-10-30");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = (
      await agency
        .from("projects")
        .select("start_date,due_date,description")
        .eq("id", fixture.projectId)
        .single()
    ).data;
    expect(saved).toEqual({
      start_date: "2026-10-20",
      due_date: "2026-10-30",
      description: "A newer edit from another tab.",
    });
    const designer = await localCaller(credentials.designer);
    expect(
      (await designer.from("projects").select("id").eq("id", fixture.projectId)).data,
    ).toHaveLength(1);
    await page.getByRole("button", { name: /Remove .+ from project/ }).click();
    await expect(page.getByText("Not assigned yet", { exact: true })).toBeVisible();
    expect((await designer.from("projects").select("id").eq("id", fixture.projectId)).data).toEqual(
      [],
    );
    await page.getByRole("button", { name: "Assign a designer", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Designer", exact: true })
      .selectOption(fixture.designerId);
    await page.getByRole("button", { name: "Assign designer", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy project link", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `/projects/${fixture.projectId}?channel=client`,
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Clipboard denied");
          },
        },
      }),
    );
    await page.getByRole("button", { name: "Copied", exact: true }).blur();
    await page.getByRole("button", { name: "Copy project link", exact: true }).click();
    await expect(page.getByLabel("Text to copy")).toHaveValue(
      new RegExp(`/projects/${fixture.projectId}\\?channel=client$`),
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Conversation", exact: true }).click();
    await page.getByLabel("Your message").fill("Private general draft.");
    await page.getByRole("button", { name: "Shared with client", exact: true }).click();
    await expect(page.getByLabel("Your message")).toBeEmpty();
    await page.getByLabel("Your message").fill("Shared general draft.");
    await page.getByRole("button", { name: "Working files", exact: true }).click();
    await expect(page.getByLabel("Your message")).toHaveValue("Private general draft.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("Private general draft.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Shared with client", exact: true }).click();
    await expect(page.getByLabel("Your message")).toHaveValue("Shared general draft.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await signIn(client, credentials.client);
    await client.goto(`/projects/${fixture.projectId}?channel=client`);
    await client.getByRole("button", { name: "Conversation", exact: true }).click();
    await expect(client.getByText("Shared general draft.", { exact: true })).toBeVisible();
    await expect(client.getByText("Private general draft.", { exact: true })).toHaveCount(0);
    await client.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(client.getByText("Shared general draft.", { exact: true })).toHaveCount(0);
    await client.getByLabel("Show resolved").check();
    await client.getByRole("button", { name: "Reopen", exact: true }).click();
    await client.reload();
    await client.getByRole("button", { name: "Conversation", exact: true }).click();
    await expect(client.getByText("Shared general draft.", { exact: true })).toBeVisible();
    await client.goto("/notifications");
    const event = client
      .locator(".notification-item")
      .filter({ has: client.locator(`a[href="/projects/${fixture.projectId}"]`) })
      .first();
    await expect(event).toHaveClass(/unread/);
    await event.getByRole("button", { name: /Mark .+ as read/ }).click();
    await expect(event).not.toHaveClass(/unread/);
    await client.reload();
    await expect(event).not.toHaveClass(/unread/);
    await event.getByRole("link").click();
    await expect(client).toHaveURL(new RegExp(`/projects/${fixture.projectId}$`));
    await client.getByRole("button", { name: "Sign out", exact: true }).click();
    await client.goto(`/projects/${fixture.projectId}?channel=client`);
    await expect(client).toHaveURL(/\/login\?returnTo=/);
    await client.getByLabel("Email address").fill(credentials.client);
    await client.getByLabel("Password", { exact: true }).fill(password);
    await client.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(client).toHaveURL(new RegExp(`/projects/${fixture.projectId}\\?channel=client$`));
  } finally {
    await clientContext.close();
    await cleanupTestProject(fixture.projectId);
  }
});
