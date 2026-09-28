import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createActionWorkflowFixture, cleanupTestProject } from "./workflow-fixture";
import { credentials, localAdmin, signIn } from "./test-support";

test.describe.configure({ mode: "serial" });
let fixture: Awaited<ReturnType<typeof createActionWorkflowFixture>>;
const outputs = fileURLToPath(new URL("../../../../outputs/", import.meta.url));
mkdirSync(outputs, { recursive: true });

async function captureResponsive(page: Page, name: string, dialog = false) {
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      dialog: document.querySelector("dialog[open]")?.scrollWidth ?? null,
      dialogWidth: document.querySelector("dialog[open]")?.clientWidth ?? null,
    }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
    if (dialog && overflow.dialog !== null && overflow.dialogWidth !== null)
      expect(overflow.dialog).toBeLessThanOrEqual(overflow.dialogWidth);
    await page.screenshot({ path: `${outputs}action-workflow-${name}-${width}.png` });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
}

async function selectBoard(page: Page, name: string) {
  // The agency's picker names each board with its designer ("Direction Alpha · Alex Morgan").
  const picker = page.getByRole("combobox", { name: "Design board" });
  const value = await picker.locator("option", { hasText: name }).first().getAttribute("value");
  await picker.selectOption(value!);
}

async function release(page: Page, name: string) {
  await selectBoard(page, name);
  await page
    .getByRole("group", { name: "Workflow actions" })
    .getByRole("button", { name: "Send to designer" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Production brief" });
  await dialog.getByLabel("Production title").fill(`${name} production`);
  await dialog.getByLabel("Overview").fill(`Prepare a complete ${name} campaign concept.`);
  await dialog.getByRole("button", { name: "Add deliverable" }).click();
  await dialog.getByLabel("Custom name").fill(`${name} square`);
  await dialog.getByRole("button", { name: "Send to designer" }).click();
  await expect(dialog).toBeHidden();
}

async function sendRound(page: Page, note: string) {
  await page
    .getByRole("group", { name: "Workflow actions" })
    .getByRole("button", { name: "Send to studio" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Note for the studio").fill(note);
  await dialog.getByRole("button", { name: "Send to studio" }).click();
  await expect(dialog).toBeHidden();
}

async function setActivity(page: Page, activity: "Active" | "Backlog") {
  const details = page.getByRole("button", { name: "Project details", exact: true });
  if ((await details.getAttribute("aria-expanded")) !== "true") await details.click();
  await page.getByRole("button", { name: "Edit project details" }).click();
  const dialog = page.getByRole("dialog", { name: "Project details" });
  await dialog.getByLabel("Project activity").selectOption({ label: activity });
  if (activity === "Backlog") await captureResponsive(page, "edit-backlog", true);
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Close project details" }).click();
}

test.beforeAll(async () => {
  fixture = await createActionWorkflowFixture();
});
test.afterAll(async () => {
  if (fixture?.projectId) await cleanupTestProject(fixture.projectId);
});

test("two designers complete release, review, feedback handoff, version approval and delivery", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const studio = await (await browser.newContext()).newPage();
  const designerA = await (await browser.newContext()).newPage();
  const designerB = await (await browser.newContext()).newPage();
  const client = await (await browser.newContext()).newPage();
  await Promise.all([
    signIn(studio, credentials.agency),
    signIn(designerA, fixture.designerAEmail),
    signIn(designerB, fixture.designerBEmail),
    signIn(client, credentials.client),
  ]);
  await studio.goto(`/projects/${fixture.projectId}`);
  await release(studio, "Direction Alpha");
  await release(studio, "Direction Beta");
  await selectBoard(studio, "Direction Alpha");
  await captureResponsive(studio, "working-actions");

  await designerA.goto(`/projects/${fixture.projectId}`);
  await designerB.goto(`/projects/${fixture.projectId}`);
  await expect(designerA.getByRole("button", { name: "Send to studio" })).toBeVisible();
  await expect(designerB.getByRole("button", { name: "Send to studio" })).toBeVisible();
  await expect(designerA.getByText("Direction Beta")).toHaveCount(0);
  await expect(designerB.getByText("Direction Alpha")).toHaveCount(0);

  await setActivity(studio, "Backlog");
  await expect(studio.getByText("Project in backlog")).toBeVisible();
  await designerA.reload();
  await expect(designerA.getByRole("button", { name: "Send to studio" })).toHaveCount(0);
  await setActivity(studio, "Active");
  await designerA.reload();
  await expect(designerA.getByRole("button", { name: "Send to studio" })).toBeVisible();

  await sendRound(designerA, "Alpha first concept");
  await sendRound(designerB, "Beta first concept");
  await studio.reload();
  await selectBoard(studio, "Direction Alpha");
  await studio.getByRole("button", { name: "Round 1" }).click();
  await captureResponsive(studio, "studio-review-actions");
  await expect(
    studio.locator(".miro-bar").getByRole("button", { name: "Share with client" }),
  ).toHaveCount(0);
  await studio
    .getByRole("group", { name: "Workflow actions" })
    .getByRole("button", { name: "Share with client" })
    .click();
  let dialog = studio.getByRole("dialog");
  await dialog
    .getByLabel("Client Miro board")
    .fill("https://miro.com/app/board/uXjVWorkflowClient1=/");
  await dialog.getByLabel("Note for the client").fill("First presentation");
  await dialog.getByRole("button", { name: "Share with client" }).click();
  await expect(dialog).toBeHidden();

  await client.goto(`/projects/${fixture.projectId}`);
  await expect(client.getByRole("group", { name: "Client versions" })).toContainText("V1");
  await expect(client.getByText("Direction Alpha")).toHaveCount(0);
  await expect(client.getByText("Direction Beta")).toHaveCount(0);
  await client
    .getByRole("group", { name: "Workflow actions" })
    .getByRole("button", { name: "Request changes" })
    .click();
  dialog = client.getByRole("dialog");
  await dialog.getByLabel("Feedback").fill("Use a warmer direction.");
  await dialog.getByRole("button", { name: "Send review" }).click();
  await expect(dialog).toBeHidden();

  await studio
    .getByRole("group", { name: "Project channel" })
    .getByRole("button", { name: "Shared with client" })
    .click();
  await expect(studio.getByRole("button", { name: "Send to designers" })).toBeVisible();
  await captureResponsive(studio, "feedback-actions");
  await studio.getByRole("button", { name: "Send to designers" }).focus();
  await studio.keyboard.press("Enter");
  dialog = studio.getByRole("dialog");
  await expect(dialog.getByText(fixture.designerAName)).toBeVisible();
  await expect(dialog.getByText(fixture.designerBName)).toBeVisible();
  await dialog
    .getByRole("group", { name: new RegExp("Direction Beta") })
    .getByLabel("Decision")
    .selectOption("close");
  await dialog.getByRole("button", { name: "Review handoff" }).click();
  await expect(dialog.getByText("Continue work on at least one board.")).toBeVisible();
  await dialog
    .getByRole("group", { name: new RegExp("Direction Alpha") })
    .getByLabel("Decision")
    .selectOption("continue");
  await dialog
    .getByRole("group", { name: new RegExp("Direction Alpha") })
    .getByLabel("Change instructions")
    .fill("Explore warmer colors and send one revised concept.");
  await captureResponsive(studio, "handoff-dialog", true);
  await dialog.getByRole("button", { name: "Review handoff" }).click();
  await expect(dialog.getByText(/Direction Alpha.*Continue working/)).toBeVisible();
  await expect(dialog.getByText(/Direction Beta.*No further work needed/)).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm handoff" }).click();
  await expect(dialog).toBeHidden();

  await designerA.reload();
  await designerB.reload();
  await expect(designerA.getByRole("button", { name: "Send to studio" })).toBeVisible();
  await expect(designerB.getByRole("button", { name: "Send to studio" })).toHaveCount(0);
  await expect(designerB.getByText("No further work needed")).toBeVisible();
  await designerA.goto("/home");
  await expect(
    designerA.locator(
      `a[href="/projects/${fixture.projectId}?channel=internal&board=${fixture.boardA}"]`,
    ),
  ).toBeVisible();
  await designerB.goto("/home");
  await expect(designerB.locator(`a[href^="/projects/${fixture.projectId}"]`)).toHaveCount(0);
  await designerB.goto("/notifications");
  await expect(
    designerB.locator(`.action-notifications a[href^="/projects/${fixture.projectId}"]`),
  ).toHaveCount(0);
  await designerA.goto(`/projects/${fixture.projectId}?channel=internal&board=${fixture.boardA}`);
  await sendRound(designerA, "Alpha warmer revision");

  await studio.reload();
  await studio
    .getByRole("group", { name: "Project channel" })
    .getByRole("button", { name: "Working files" })
    .click();
  await selectBoard(studio, "Direction Alpha");
  await studio.getByRole("button", { name: "Round 2" }).click();
  await studio.getByRole("button", { name: "Share with client" }).click();
  dialog = studio.getByRole("dialog");
  await expect(dialog.getByLabel("Client Miro board")).toHaveValue(/uXjVWorkflowClient1/);
  await dialog.getByLabel("Note for the client").fill("Warmer direction");
  await dialog.getByRole("button", { name: "Share with client" }).click();
  await expect(dialog).toBeHidden();
  await client.reload();
  await expect(client.getByRole("group", { name: "Client versions" })).toContainText("V2");
  await client.getByRole("button", { name: "Approve" }).click();
  dialog = client.getByRole("dialog");
  await dialog.getByRole("button", { name: "Send review" }).click();
  await expect(dialog).toBeHidden();
  await studio
    .getByRole("group", { name: "Project channel" })
    .getByRole("button", { name: "Shared with client" })
    .click();
  await expect(studio.getByRole("link", { name: "Prepare delivery" })).toBeVisible();
  await studio.getByRole("link", { name: "Prepare delivery" }).click();
  await expect(studio).toHaveURL(new RegExp(`/clients/${fixture.clientId}/brand/files`));
  await studio.getByRole("button", { name: "Delivery file", exact: true }).click();
  dialog = studio.getByRole("dialog", { name: "Add a delivery file" });
  await dialog.getByLabel("File name").fill("Workflow final");
  await dialog
    .getByLabel("File", { exact: true })
    .setInputFiles(fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url)));
  await dialog.getByRole("button", { name: "Add file", exact: true }).click();
  await expect(dialog).toBeHidden();
  await studio.getByRole("button", { name: "Complete delivery", exact: true }).click();
  dialog = studio.getByRole("dialog", { name: "Ready to wrap up?" });
  await dialog.getByRole("button", { name: "Complete delivery", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await localAdmin.from("projects").select("status").eq("id", fixture.projectId).single())
          .data?.status,
    )
    .toBe("delivered");
  await studio.screenshot({ path: `${outputs}action-workflow-delivered.png` });
});
