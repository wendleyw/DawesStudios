import { shareTestVersion, releaseTestBrief, sendTestRound } from "./project-fixture";
import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createPlaygroundFixture } from "./playground-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Missing comments fixture result.");
  return result.data as NonNullable<T>;
}

const clientBoard = "https://miro.com/app/board/uXjVFeedback1=/";
const internalBoard = "https://miro.com/app/board/uXjVFeedbackInternal1=/";

async function openPanel(page: Page, tool: "Comments" | "Project details") {
  await page
    .getByRole("group", { name: "Project actions" })
    .getByRole("button", { name: tool, exact: true })
    .click();
}

async function send(panel: Locator, body: string) {
  await panel.getByRole("textbox", { name: "Your message", exact: true }).fill(body);
  await panel.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(panel.getByText(body, { exact: true })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Your message", exact: true })).toHaveValue("");
}

async function selectScope(panel: Locator, scope: "All activity" | "This version") {
  await panel.getByRole("button", { name: scope, exact: true }).click();
  await expect(panel.getByRole("button", { name: scope, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test("one Comments panel keeps project, round, and client-version messages and drafts in their scopes", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  const designerCaller = await localCaller(credentials.designer);
  const designerAccount = await designerCaller.auth.getUser();
  if (designerAccount.error || !designerAccount.data.user)
    throw new Error("Designer fixture authentication failed.");
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [client, studio, designer] = await Promise.all(contexts.map((item) => item.newPage()));
  const errors: string[] = [];
  const internalReads: string[] = [];
  client.on("pageerror", (error) => errors.push(error.message));
  client.on("request", (request) => {
    if (/\/rest\/v1\/(design_boards|design_versions|internal_comments)\?/.test(request.url()))
      internalReads.push(request.url());
  });
  try {
    const board = value(
      await agency.rpc("create_design_board", {
        p_project_id: fixture.projectId,
        p_name: "Comments direction",
        p_url: internalBoard,
        p_designer_id: designerAccount.data.user.id,
      }),
    );
    await releaseTestBrief(agency, fixture.projectId, board);
    const round = value(
      await sendTestRound(designerCaller, fixture.projectId, board, "Ready for comments."),
    );
    const version1 = value(
      await shareTestVersion(agency, {
        p_project_id: fixture.projectId,
        p_url: clientBoard,
        p_note: "First look at the campaign.",
      }),
    );
    const version2 = value(
      await shareTestVersion(agency, {
        p_project_id: fixture.projectId,
        p_url: "https://miro.com/app/board/uXjVFeedback2=/",
        p_note: "Second look at the campaign.",
      }),
    );

    await signIn(client, fixture.client.email);
    await client.goto(`/projects/${fixture.projectId}`);
    const clientTools = client.getByRole("group", { name: "Project actions" });
    await expect(clientTools.getByRole("button", { name: "Comments", exact: true })).toHaveCount(1);
    await expect(clientTools.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
    await expect(
      clientTools.getByRole("button", { name: "Conversation", exact: true }),
    ).toHaveCount(0);
    await openPanel(client, "Comments");
    const clientPanel = client.locator(".comment-panel");
    await expect(clientPanel.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
    await expect(clientPanel.getByRole("button", { name: "All activity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(clientPanel).toContainText("Posting to Project");
    await send(clientPanel, "General client note.");
    await expect(
      clientPanel
        .locator("article")
        .filter({ hasText: "General client note." })
        .getByText("Project", {
          exact: true,
        }),
    ).toBeVisible();
    const clientMessage = clientPanel.getByRole("textbox", { name: "Your message" });
    await clientMessage.fill("Client project draft");
    await client
      .getByRole("group", { name: "Client versions" })
      .getByRole("button", { name: "V1" })
      .click();
    await selectScope(clientPanel, "This version");
    await expect(clientPanel).toContainText("Posting to Version 1");
    await expect(clientPanel).not.toContainText("General client note.");
    await expect(clientMessage).toHaveValue("");
    await send(clientPanel, "Client note for first version.");
    await clientMessage.fill("First version draft");
    await client
      .getByRole("group", { name: "Client versions" })
      .getByRole("button", { name: "V2" })
      .click();
    await expect(clientPanel).toContainText("Posting to Version 2");
    await expect(clientMessage).toHaveValue("");
    await send(clientPanel, "Client note for second version.");
    await client
      .getByRole("group", { name: "Client versions" })
      .getByRole("button", { name: "V1" })
      .click();
    await expect(clientMessage).toHaveValue("First version draft");
    await selectScope(clientPanel, "All activity");
    await expect(clientMessage).toHaveValue("Client project draft");
    await expect(clientPanel).toContainText("General client note.");
    await expect(clientPanel).toContainText("Client note for first version.");
    await expect(clientPanel).toContainText("Client note for second version.");
    for (const [body, scope] of [
      ["Client note for first version.", "Version 1"],
      ["Client note for second version.", "Version 2"],
    ]) {
      await expect(
        clientPanel.locator("article").filter({ hasText: body }).getByText(scope, { exact: true }),
      ).toBeVisible();
    }

    await signIn(studio, credentials.agency);
    await studio.goto(`/projects/${fixture.projectId}`);
    await studio
      .getByRole("group", { name: "Rounds" })
      .getByRole("button", { name: "Round 1" })
      .click();
    await openPanel(studio, "Comments");
    const studioPanel = studio.locator(".comment-panel");
    await expect(studioPanel).toContainText("Posting to Project");
    await expect(studioPanel).not.toContainText("General client note.");
    await send(studioPanel, "General studio note.");
    const studioMessage = studioPanel.getByRole("textbox", { name: "Your message" });
    await studioMessage.fill("Studio project draft");
    await selectScope(studioPanel, "This version");
    await expect(studioPanel).toContainText("Posting to Round 1");
    await expect(studioMessage).toHaveValue("");
    await send(studioPanel, "Studio note for first round.");
    await studioMessage.fill("Studio round draft");
    await studio
      .getByRole("group", { name: "Project channel" })
      .getByRole("button", { name: "Shared with client", exact: true })
      .click();
    await expect(studioPanel).toBeVisible();
    await expect(studioPanel.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
    await expect(studioPanel).not.toContainText("General studio note.");
    await expect(studioPanel).toContainText("Client note for first version.");
    await expect(studioMessage).toHaveValue("");
    await studio
      .getByRole("group", { name: "Project channel" })
      .getByRole("button", { name: "Working files", exact: true })
      .click();
    await expect(studioPanel).toBeVisible();
    // Channel loading remounts the workspace at its board; select the original round again.
    await studio
      .getByRole("group", { name: "Rounds" })
      .getByRole("button", { name: "Round 1" })
      .click();
    await selectScope(studioPanel, "This version");
    await expect(studioMessage).toHaveValue("Studio round draft");
    await selectScope(studioPanel, "All activity");
    await expect(studioMessage).toHaveValue("Studio project draft");
    await expect(studioPanel).toContainText("General studio note.");
    await expect(studioPanel).toContainText("Studio note for first round.");

    await signIn(designer, credentials.designer);
    await designer.goto(`/projects/${fixture.projectId}`);
    await openPanel(designer, "Comments");
    const designerPanel = designer.locator(".comment-panel");
    await expect(designerPanel).toContainText("General studio note.");
    await expect(designerPanel).toContainText("Studio note for first round.");
    await expect(designerPanel).not.toContainText("General client note.");

    await client.reload();
    await openPanel(client, "Comments");
    await expect(clientPanel).toContainText("General client note.");
    await expect(clientPanel).not.toContainText("General studio note.");
    const clientRows = value(
      await localAdmin
        .from("client_comments")
        .select("body,publication_id")
        .eq("project_id", fixture.projectId),
    );
    expect(clientRows).toEqual(
      expect.arrayContaining([
        { body: "General client note.", publication_id: null },
        { body: "Client note for first version.", publication_id: version1 },
        { body: "Client note for second version.", publication_id: version2 },
      ]),
    );
    expect(clientRows).toHaveLength(3);
    const internalRows = value(
      await localAdmin
        .from("internal_comments")
        .select("body,version_id")
        .eq("project_id", fixture.projectId),
    );
    expect(internalRows).toEqual(
      expect.arrayContaining([
        { body: "General studio note.", version_id: null },
        { body: "Studio note for first round.", version_id: round },
      ]),
    );
    expect(internalRows).toHaveLength(2);
    expect(internalReads).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    await fixture.cleanup();
  }
});

test("floating project chrome and panels fit desktop and mobile", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await createPlaygroundFixture();
  try {
    await signIn(page, credentials.agency);
    for (const [width, height] of [
      [1600, 1000],
      [1024, 700],
      [390, 844],
      [320, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/projects/${fixture.projectId}`);
      await expect(page.locator(".project-chrome .client-navigation")).toHaveCount(1);
      await expect(
        page.locator(".sidebar .client-navigation, .topbar .client-navigation"),
      ).toHaveCount(0);
      const tools = page.getByRole("group", { name: "Project actions" });
      await expect(tools).toBeVisible();
      await expect(tools.getByRole("button", { name: "Comments", exact: true })).toHaveCount(1);
      await expect(tools.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const inside = (element: Element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.width === 0 ||
                (rect.left >= 0 &&
                  rect.right <= innerWidth &&
                  rect.top >= 0 &&
                  rect.bottom <= innerHeight)
              );
            };
            const chrome = document.querySelector(".project-chrome")!;
            const bar = document.querySelector(".project-tool-bar")!;
            return (
              Array.from(chrome.querySelectorAll("button, a, select")).every(inside) &&
              Array.from(bar.querySelectorAll("button")).every(inside) &&
              bar.getBoundingClientRect().top >= chrome.getBoundingClientRect().bottom &&
              document.documentElement.scrollWidth <= innerWidth
            );
          }),
        )
        .toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      let panelBounds: { x: number; y: number; width: number; height: number } | null = null;
      for (const [label, content] of [
        ["Comments", ".comment-panel"],
        ["Project details", ".project-details"],
      ] as const) {
        const trigger = tools.getByRole("button", { name: label, exact: true });
        await trigger.click();
        await expect(page.locator(content)).toBeInViewport();
        if (label === "Comments") {
          const panel = page.locator(".comment-panel");
          await expect(panel.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
          await expect(panel.getByRole("button", { name: "All activity" })).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await expect(panel.getByRole("button", { name: "This version" })).toHaveCount(0);
          await expect(panel).toContainText("Posting to Project");
        }
        // The bar never sits under the open panel: it re-centres beside it, or steps aside.
        const bar = await page.evaluate(() => {
          const element = document.querySelector<HTMLElement>(".project-tool-bar")!;
          if (getComputedStyle(element).display === "none") return { hidden: true, clear: true };
          const rect = element.getBoundingClientRect();
          const panel = document.querySelector(".project-inspector")!.getBoundingClientRect();
          return { hidden: false, clear: rect.right <= panel.left };
        });
        expect(bar.clear).toBe(true);
        if (width >= 1440) expect(bar.hidden).toBe(false);
        const bounds = await page.locator(".project-inspector").boundingBox();
        if (panelBounds) expect(bounds).toEqual(panelBounds);
        panelBounds = bounds;
        await expect(
          page.locator(".project-inspector .project-panel-heading button[aria-label^='Close ']"),
        ).toBeFocused();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.keyboard.press("Escape");
        await expect(page.locator(".project-inspector")).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a project notification is marked read without leaving the workspace", async ({ page }) => {
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  try {
    const account = await agency.auth.getUser();
    if (account.error || !account.data.user) throw new Error("Missing notification fixture user.");
    const notification = value(
      await localAdmin
        .from("notifications")
        .insert({
          user_id: account.data.user.id,
          project_id: fixture.projectId,
          client_id: fixture.clientId,
          title: "Acceptance feedback notification",
          body: "A round is ready for a look.",
        })
        .select("id")
        .single(),
    );
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const notifications = page.getByRole("dialog", { name: "Notifications", exact: true });
    await expect(notifications).toContainText("Acceptance feedback notification");
    await notifications
      .getByRole("button", { name: "Mark Acceptance feedback notification as read", exact: true })
      .click();
    await expect(
      notifications.getByRole("button", {
        name: "Mark Acceptance feedback notification as read",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      value(
        await localAdmin.from("notifications").select("read_at").eq("id", notification.id).single(),
      ).read_at,
    ).not.toBeNull();
    await expect(page).toHaveURL(`/projects/${fixture.projectId}`);
  } finally {
    await fixture.cleanup();
  }
});
