import { releaseTestBrief, shareTestVersion } from "./project-fixture";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import { createPlaygroundFixture } from "./playground-fixture";
import { credentials, localAgency, localCaller, screenshotDirectory, signIn } from "./test-support";

const actions = (page: Page) => page.getByRole("region", { name: "Needs your action" });
const projectAction = (page: Page, name: string) =>
  actions(page)
    .getByRole("link")
    .filter({ has: page.getByText(name, { exact: true }) });

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Missing action notification fixture result.");
  return result.data as NonNullable<T>;
}

test("action notifications follow designer, studio and client work until completion", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  const designerCaller = await localCaller(credentials.designer);
  const designerAccount = await designerCaller.auth.getUser();
  if (designerAccount.error || !designerAccount.data.user)
    throw new Error("Designer fixture authentication failed.");
  const designerId = designerAccount.data.user.id;
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [studio, designer, client] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  try {
    await signIn(studio, credentials.agency);
    await studio.goto("/notifications");
    await expect(projectAction(studio, fixture.name)).toContainText("Prepare project");
    await projectAction(studio, fixture.name).click();
    await expect(
      studio.getByRole("button", { name: "Project details", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");

    const board = value(
      await agency.rpc("create_design_board", {
        p_project_id: fixture.projectId,
        p_name: "Notification direction",
        p_url: "https://miro.com/app/board/uXjVActionsInternal=/",
        p_designer_id: designerId,
      }),
    );
    // The studio sends production instructions; only then does the designer have work to submit.
    await releaseTestBrief(agency, fixture.projectId, board);
    await signIn(designer, credentials.designer);
    await designer.goto("/notifications");
    const designerAction = actions(designer)
      .getByRole("link")
      .filter({ hasText: fixture.name })
      .filter({ hasText: "Submit round" });
    await expect(designerAction).toContainText("Submit round");
    await designer.screenshot({
      path: `${screenshotDirectory}/action-notifications-designer.png`,
      fullPage: true,
    });
    await designerAction.click();
    await expect(designer).toHaveURL(new RegExp(`board=${board}`));
    await designer.getByRole("button", { name: "Send to studio", exact: true }).click();
    await designer.getByRole("dialog").getByLabel("Note for the studio").fill("Ready for review.");
    await designer
      .getByRole("dialog")
      .getByRole("button", { name: "Send to studio", exact: true })
      .click();
    await expect(designer.getByRole("dialog")).toHaveCount(0);
    await designer.goto("/notifications");
    await expect(actions(designer).getByRole("link").filter({ hasText: fixture.name })).toHaveCount(
      0,
    );

    await studio.goto("/notifications");
    const studioRound = actions(studio)
      .getByRole("link")
      .filter({ hasText: fixture.name })
      .filter({ hasText: "Review round" });
    await expect(studioRound).toContainText("Review round");
    await studio.screenshot({
      path: `${screenshotDirectory}/action-notifications-agency.png`,
      fullPage: true,
    });
    await studioRound.click();
    await expect(studio.getByRole("button", { name: "Round 1", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The studio approves the round; the queue then asks it to share the round with the client.
    await studio.getByRole("button", { name: "Approve round 1", exact: true }).click();
    await expect(studio.getByRole("group", { name: "Workflow actions" })).toContainText(
      "Approved by the studio",
    );
    await studio.goto("/notifications");
    // A round's action names the project and its board.
    const shareAction = actions(studio)
      .getByRole("link")
      .filter({ hasText: fixture.name })
      .filter({ hasText: "Share with client" });
    await expect(shareAction).toBeVisible();
    await shareAction.click();
    await expect(studio.getByRole("button", { name: "Round 1", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await studio.getByRole("button", { name: "Share with client", exact: true }).click();
    await studio
      .getByRole("dialog")
      .getByLabel("Client Miro board")
      .fill("https://miro.com/app/board/uXjVActionsClient=/");
    await studio
      .getByRole("dialog")
      .getByLabel("Note for the client")
      .fill("Your campaign is ready to review.");
    await studio
      .getByRole("dialog")
      .getByRole("button", { name: "Share with client", exact: true })
      .click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);

    await signIn(client, fixture.client.email);
    await client.goto("/notifications");
    await expect(projectAction(client, fixture.name)).toContainText("Review version");
    await client.getByRole("button", { name: "Mark all read" }).click();
    await expect(client.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    await expect(projectAction(client, fixture.name)).toBeVisible();
    await client.screenshot({
      path: `${screenshotDirectory}/action-notifications-client.png`,
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page: client }).include(".page-content").analyze()).violations,
    ).toEqual([]);
    await client.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await client.screenshot({
      path: `${screenshotDirectory}/action-notifications-mobile.png`,
      fullPage: true,
    });
    await projectAction(client, fixture.name).click();
    await expect(client.getByRole("button", { name: "Working files", exact: true })).toHaveCount(0);
    const bell = client.getByRole("button", { name: /^Notifications/ });
    await bell.click();
    const popover = client.getByRole("dialog", { name: "Notifications", exact: true });
    await expect(popover).toHaveCSS("opacity", "1");
    await expect(popover.getByRole("region", { name: "Needs your action" })).toContainText(
      "Review version",
    );
    const bounds = await popover.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await client.screenshot({ path: `${screenshotDirectory}/action-notifications-popover.png` });
    expect(
      (await new AxeBuilder({ page: client }).include(".notifications-popover").analyze())
        .violations,
    ).toEqual([]);
    await popover.getByRole("button", { name: "Close notifications" }).click();
    await expect(bell).toBeFocused();
    await client.getByRole("button", { name: "Request changes", exact: true }).click();
    await client.getByRole("dialog").getByLabel("Feedback").fill("Please use warmer tones.");
    await client
      .getByRole("dialog")
      .getByRole("button", { name: "Send review", exact: true })
      .click();
    await expect(client.getByRole("dialog")).toHaveCount(0);
    await client.goto("/notifications");
    await expect(projectAction(client, fixture.name)).toHaveCount(0);

    await studio.goto("/notifications");
    // Client feedback opens Working files, where the studio sends it back to the designer.
    await expect(projectAction(studio, fixture.name)).toContainText("Send changes to designers");
    await projectAction(studio, fixture.name).click();
    await expect(
      studio.getByRole("button", { name: "Working files", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const feedbackBar = studio.getByRole("group", { name: "Workflow actions" });
    await expect(feedbackBar).toContainText("Client requested changes");
    await expect(feedbackBar.getByRole("button", { name: "Send to designer" })).toBeVisible();
    const replacement = value(
      await shareTestVersion(agency, {
        p_project_id: fixture.projectId,
        p_url: "https://miro.com/app/board/uXjVActionsClient=/",
        p_note: "Warmer tones applied.",
      }),
    );
    await client.goto("/notifications");
    await expect(projectAction(client, fixture.name)).toHaveAttribute(
      "href",
      new RegExp(`version=${replacement}`),
    );
    await projectAction(client, fixture.name).click();
    await client.getByRole("button", { name: "Approve", exact: true }).click();
    await client
      .getByRole("dialog")
      .getByRole("button", { name: "Send review", exact: true })
      .click();
    await expect(client.getByRole("dialog")).toHaveCount(0);
    await client.goto("/notifications");
    await expect(projectAction(client, fixture.name)).toHaveCount(0);

    await studio.goto("/notifications");
    await expect(projectAction(studio, fixture.name)).toContainText("Deliver project");
    await projectAction(studio, fixture.name).click();
    await studio.getByRole("button", { name: "Delivery file", exact: true }).click();
    const upload = studio.getByRole("dialog", { name: "Add a deliverable" });
    await upload.getByLabel("File name").fill("Notification final");
    await upload
      .getByLabel("File", { exact: true })
      .setInputFiles(fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url)));
    await upload.getByRole("button", { name: "Add deliverable", exact: true }).click();
    await expect(upload).toBeHidden();
    await studio.getByRole("button", { name: "Complete delivery", exact: true }).click();
    const complete = studio.getByRole("dialog", { name: "Ready to wrap up?" });
    await complete.getByRole("button", { name: "Complete delivery", exact: true }).click();
    await expect(complete).toBeHidden();
    await studio.goto("/notifications");
    await expect(projectAction(studio, fixture.name)).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.cleanup();
  }
});
