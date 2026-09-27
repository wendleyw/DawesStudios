import { expect, test } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAgency, signIn } from "./test-support";

// A disposable SABRE project with one client version on a client Miro board. The embed itself is
// not loaded (no dependency on Miro's network); the iframe source, the tools beside it and the
// Playground's asset strip are asserted.
test.describe.configure({ mode: "serial" });
const clientBoard = "https://miro.com/app/board/uXjVClientE2E=/?moveToWidget=111";
let projectId = "";

test.beforeAll(async () => {
  const agency = await localAgency();
  projectId = (await createProductionFixture(agency)).projectId;
  const shared = await agency.rpc("share_miro_version", {
    p_project_id: projectId,
    p_url: clientBoard,
    p_note: "A first look in Miro.",
  });
  if (shared.error) throw new Error(shared.error.message);
});

test.afterAll(async () => {
  if (projectId) await cleanupTestProject(projectId);
});

test("the client works in Miro beside the project's tools", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, credentials.client);
  await page.goto(`/projects/${projectId}`);
  // The shared version opens on its board, rebuilt from the stored ids, with autoplay.
  const frame = page.locator("iframe.miro-view-frame");
  await expect(frame).toHaveAttribute(
    "src",
    /live-embed\/uXjVClientE2E%3D\/\?autoplay=true&moveToWidget=111/,
  );
  await expect(page.getByRole("group", { name: "Client versions" })).toContainText("V1");
  // The project's tools stay: Conversation opens beside Miro.
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".project-inspector").first()).toBeVisible();
  await expect(frame).toBeVisible();
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".project-inspector")).toHaveCount(0);
  // With a board shown, the Playground opens as the asset strip.
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open full Playground" })).toBeVisible();
  // The seeded client's Brand Hub has no folders, so every asset lands in one "Unfiled" album;
  // its first (alphabetically) file is a PNG, which the clipboard mode can copy.
  await page.getByRole("button", { name: "Unfiled" }).click();
  await page
    .getByRole("button", { name: "Copy Campus Connections - Campaign photography" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Copied — paste in Miro with ⌘V / Ctrl+V");
  // A reload keeps the board.
  await page.reload();
  await expect(frame).toHaveAttribute("src", /uXjVClientE2E/);
});
