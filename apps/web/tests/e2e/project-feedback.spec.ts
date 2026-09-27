import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createPlaygroundFixture } from "./playground-fixture";
import { credentials, localAdmin, localAgency, screenshotDirectory, signIn } from "./test-support";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Missing feedback fixture result.");
  return result.data as NonNullable<T>;
}

const clientBoard = "https://miro.com/app/board/uXjVFeedback1=/";

async function openPanel(page: Page, tool: "Conversation" | "Feedback" | "Project details") {
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

test("conversation and client version feedback stay in their channel, with drafts kept per scope", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
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
    const version = value(
      await agency.rpc("share_miro_version", {
        p_project_id: fixture.projectId,
        p_url: clientBoard,
        p_note: "First look at the campaign.",
      }),
    );

    // The client's project conversation and V1's feedback are separate threads of one channel.
    await signIn(client, fixture.client.email);
    await client.goto(`/projects/${fixture.projectId}`);
    await expect(client.getByRole("group", { name: "Client versions" })).toContainText("V1");
    const clientPanel = client.getByRole("complementary", { name: "Client conversation" });
    await openPanel(client, "Conversation");
    await expect(clientPanel.getByRole("heading", { name: "Conversation" })).toBeVisible();
    await send(clientPanel, "Client note on the whole project.");
    await openPanel(client, "Feedback");
    await expect(clientPanel.getByRole("heading", { name: "Feedback" })).toBeVisible();
    await expect(clientPanel).not.toContainText("Client note on the whole project.");
    await send(clientPanel, "Client feedback on V1.");
    // An unsent draft belongs to its own scope: Conversation keeps it, Feedback never shows it.
    await openPanel(client, "Conversation");
    await expect(clientPanel).not.toContainText("Client feedback on V1.");
    const message = clientPanel.getByRole("textbox", { name: "Your message", exact: true });
    await message.fill("An unsent project draft");
    await openPanel(client, "Feedback");
    await expect(message).toHaveValue("");
    await openPanel(client, "Conversation");
    await expect(message).toHaveValue("An unsent project draft");
    await client.screenshot({ path: `${screenshotDirectory}/project-client-conversation.png` });
    const saved = value(
      await localAdmin
        .from("client_comments")
        .select("body,publication_id,design_id")
        .eq("project_id", fixture.projectId)
        .order("created_at"),
    );
    expect(saved).toEqual([
      { body: "Client note on the whole project.", publication_id: null, design_id: null },
      { body: "Client feedback on V1.", publication_id: version, design_id: null },
    ]);

    // The studio's internal conversation never reaches the client channel, and back.
    await signIn(studio, credentials.agency);
    await studio.goto(`/projects/${fixture.projectId}`);
    await openPanel(studio, "Conversation");
    const studioPanel = studio.getByRole("complementary", { name: "Studio conversation" });
    await expect(studioPanel).not.toContainText("Client note on the whole project.");
    await send(studioPanel, "Internal note for the studio only.");
    await studio
      .getByRole("group", { name: "Project channel" })
      .getByRole("button", { name: "Shared with client", exact: true })
      .click();
    const sharedPanel = studio.getByRole("complementary", { name: "Client conversation" });
    await expect(sharedPanel).toContainText("Client note on the whole project.");
    await expect(sharedPanel).not.toContainText("Internal note for the studio only.");
    await send(sharedPanel, "Studio reply to the client.");

    // The assigned designer reads the internal conversation and nothing of the client's.
    await signIn(designer, credentials.designer);
    await designer.goto(`/projects/${fixture.projectId}`);
    await openPanel(designer, "Conversation");
    const designerPanel = designer.getByRole("complementary", { name: "Studio conversation" });
    await expect(designerPanel).toContainText("Internal note for the studio only.");
    await expect(designerPanel).not.toContainText("Client note on the whole project.");
    await expect(designerPanel).not.toContainText("Studio reply to the client.");

    await client.reload();
    await openPanel(client, "Conversation");
    await expect(clientPanel).toContainText("Studio reply to the client.");
    await expect(clientPanel).not.toContainText("Internal note for the studio only.");
    const internal = value(
      await localAdmin.from("internal_comments").select("body").eq("project_id", fixture.projectId),
    );
    expect(internal.map((row) => row.body)).toEqual(["Internal note for the studio only."]);
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
      await page.screenshot({ path: `${screenshotDirectory}/project-workspace-${width}.png` });
      let panelBounds: { x: number; y: number; width: number; height: number } | null = null;
      for (const [label, content] of [
        ["Conversation", ".comment-panel"],
        ["Project details", ".project-details"],
      ] as const) {
        const trigger = tools.getByRole("button", { name: label, exact: true });
        await trigger.click();
        await expect(page.locator(content)).toBeInViewport();
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
        await page.screenshot({
          path: `${screenshotDirectory}/project-panel-${label.toLowerCase().replaceAll(" ", "-")}-${width}.png`,
        });
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
