import { openBoardSearch, setBoardSearch } from "./test-support";
import { test, expect } from "@playwright/test";
import {
  credentials,
  localAdmin,
  localAgency,
  localCaller,
  password,
  signIn,
  preserveBoardPreference,
} from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

test("board views, filters, campaign validation, movement and scoped search", async ({ page }) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const restoreBoard = await preserveBoardPreference(credentials.agency, fixture.clientId);
  const campaignTitle = `Acceptance campaign ${crypto.randomUUID()}`;
  try {
    const project = (await agency.from("projects").select("*").eq("id", fixture.projectId).single())
      .data!;
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/board`);
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await setBoardSearch(page, project.title);
    await openBoardSearch(page);
    await expect(page.locator(".board-result-count")).toHaveText("1 project");
    // The board keeps the active filter once its panel closes; close it here so the raw-mouse
    // drag below isn't swallowed by the "Find a project" panel sitting on top of the grip (which
    // the canonical, less crowded board layout makes possible where the SABRE overlay did not).
    await page.getByRole("button", { name: "Close panel", exact: true }).click();
    const node = page.locator(`.react-flow__node[data-id="${fixture.projectId}"]`);
    const grip = node.locator(".board-card-grip");
    await expect(grip).toBeVisible();
    // hover() runs Playwright's actionability check, including that the grip itself (not some
    // panel still on top of it) receives pointer events here, before the manual drag below.
    await grip.hover();
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
    await setBoardSearch(page, project.title);
    // board_position is stored relative to the campaign frame the card now lives in, so the
    // restored placement is verified as an offset from that frame rather than as a page coordinate.
    // The stored value is in canvas coordinates while boundingBox reports rendered pixels, and the
    // board opens fitted to its contents rather than at 1:1, so the offset is converted back
    // through the canvas zoom. Comparing the two directly only held while the board sat at zoom 1.
    const frame = page.locator(".react-flow__node-campaign").first();
    await expect
      .poll(async () => {
        const card = await node.boundingBox();
        const group = await frame.boundingBox();
        const zoom = await page
          .locator(".react-flow__viewport")
          .evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
        if (!card || !group || !zoom) return null;
        return Math.max(
          Math.abs((card.x - group.x) / zoom - moved.x),
          Math.abs((card.y - group.y) / zoom - moved.y),
        );
      })
      .toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await expect(
      page.locator(`.board-list a[href="/projects/${fixture.projectId}"]`),
    ).toBeVisible();
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await page.getByRole("button", { name: "Kanban view", exact: true }).click();
    await expect(
      page.locator(`.kanban-board a[href="/projects/${fixture.projectId}"]`),
    ).toBeVisible();
    await expect(page.locator(".kanban-column")).toHaveCount(7);
    await page.getByRole("button", { name: "Timeline view", exact: true }).click();
    await expect(page.getByRole("region", { name: "Project timeline", exact: true })).toBeVisible();
    // Start from a known scale. Without an explicit choice the timeline opens on the smallest
    // scale that fits every project on the board, so a much wider board layout (for example, the
    // local SABRE demo overlay's far broader project date range) can otherwise leave it already
    // open on Quarter, making the explicit selection below a no-op.
    await page.getByRole("group", { name: "Timeline scale" }).getByText("Fortnight").click();
    const periodLabel = page.locator(".project-timeline header strong");
    await expect(periodLabel).toBeVisible();
    // Wait for the live timeline period to be rendered.
    await expect(periodLabel).not.toHaveText("");
    const period = (await periodLabel.textContent())!.trim();
    // The arrows page by whichever scale is chosen, so they no longer name a fortnight.
    await page.getByRole("button", { name: /^Next (fortnight|month|quarter)$/ }).click();
    await expect(periodLabel).not.toHaveText(period);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(periodLabel).toHaveText(period);
    // Changing the scale changes what the window covers, which is the whole point of the control:
    // a fortnight cannot show a project that runs past it.
    await page.getByRole("group", { name: "Timeline scale" }).getByText("Quarter").click();
    await expect(periodLabel).not.toHaveText(period);
    await expect(page.locator(".timeline-lane-head .timeline-day")).toHaveCount(13);
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("delivered");
    await expect(page.getByRole("heading", { name: "No projects match." })).toBeVisible();
    // Recover from the empty board itself, not from inside the filter menu that caused it.
    await page
      .locator(".board-stack-notice")
      .getByRole("button", { name: "Clear filters" })
      .click();
    await expect(await openBoardSearch(page)).toBeEmpty();
    // The seven seeded SABRE projects plus this run's own fixture project.
    await expect(page.locator(".react-flow__node-project")).toHaveCount(8);
    await expect(node).toBeVisible();
    await page.getByRole("button", { name: "Add a campaign", exact: true }).click();
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
    await openBoardSearch(page);
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
    // The workspace-wide search was removed on 2026-09-24 as a duplicate of the board's own
    // search: no sidebar entry, and the old shortcut leaves the board where it is.
    await expect(page.getByRole("link", { name: "Search", exact: true })).toHaveCount(0);
    await page.keyboard.press("Meta+k");
    await expect(page).toHaveURL(new RegExp(`/clients/${fixture.clientId}/board(\\?.*)?$`));
  } finally {
    await restoreBoard();
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
  const restoreBoard = await preserveBoardPreference(credentials.agency, fixture.clientId);
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}?view=versions`);
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
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove designer", exact: true })
      .click();
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
    await client.goto(`/projects/${fixture.projectId}?channel=client&view=versions`);
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
    await client.goto(`/projects/${fixture.projectId}?channel=client&view=versions`);
    await expect(client).toHaveURL(/\/login\?returnTo=/);
    await client.getByLabel("Email address").fill(credentials.client);
    await client.getByLabel("Password", { exact: true }).fill(password);
    await client.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(client).toHaveURL(new RegExp(`/projects/${fixture.projectId}\\?channel=client$`));
  } finally {
    await clientContext.close();
    await restoreBoard();
    await cleanupTestProject(fixture.projectId);
  }
});

test("one click selects and two open the project, on the card and in the calendar", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const restoreBoard = await preserveBoardPreference(credentials.agency, fixture.clientId);
  try {
    const project = (await agency.from("projects").select("*").eq("id", fixture.projectId).single())
      .data!;
    await signIn(page, credentials.agency);
    const board = `/clients/${fixture.clientId}/board`;
    await page.goto(board);
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await setBoardSearch(page, project.title);
    // The board keeps the active filter once its panel closes; close it here so the click below
    // isn't swallowed by the "Find a project" panel sitting on top of the card.
    await page.getByRole("button", { name: "Close panel", exact: true }).click();
    const node = page.locator(`.react-flow__node[data-id="${fixture.projectId}"]`);
    const card = node.locator(".board-card-body");

    // One click selects and nothing more. Navigating here is the behaviour this replaced: the card
    // used to be a link, so a single click left the board entirely.
    await card.click();
    await expect(node).toHaveAttribute("aria-current", "true");
    expect(new URL(page.url()).pathname).toBe(board);

    // Two open the project's own canvas, full screen, rather than inside the board. A fresh
    // project opens in the Miro workspace, so the canvas pane is asserted, not the legacy flow.
    await card.dblclick();
    await page.waitForURL(`**/projects/${fixture.projectId}`);
    await expect(page.locator(".project-canvas")).toBeVisible();

    // The calendar lane obeys the same rule, so the board reads consistently wherever a project
    // appears.
    await page.goto(board);
    await page.getByRole("button", { name: "Canvas view", exact: true }).click();
    await setBoardSearch(page, project.title);
    await page.getByRole("button", { name: "Timeline view", exact: true }).click();
    // The weekday header shares the lane class, so the project rows are the ones that are not it.
    const lane = page.locator(".timeline-lane:not(.timeline-lane-head)").first();
    await lane.click();
    await expect(lane).toHaveAttribute("aria-current", "true");
    expect(new URL(page.url()).pathname).toBe(board);
    await lane.dblclick();
    await page.waitForURL(`**/projects/${fixture.projectId}`);
  } finally {
    await restoreBoard();
    await cleanupTestProject(fixture.projectId);
  }
});
