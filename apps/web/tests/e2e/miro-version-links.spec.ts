import { expect, test } from "@playwright/test";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";

// The seeded SABRE landing page: its latest publication gets a client-board link and its latest
// internal version an internal-board link, both removed afterwards. The embed itself is not
// loaded (no dependency on Miro's network); the iframe source and the role gating are asserted.
const projectId = "15e2d399-e215-9707-9499-96b455c83adf";
const clientBoard = "https://miro.com/app/board/uXjVClientE2E=/?moveToWidget=111";
const studioBoard = "https://miro.com/app/board/uXjVStudioE2E=/?moveToWidget=222";
let publicationId = "";
let versionId = "";

async function latestId(table: "published_versions" | "design_versions") {
  const result = await localAdmin
    .from(table)
    .select("id")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  if (result.error) throw new Error(result.error.message);
  return result.data.id;
}

test.beforeAll(async () => {
  publicationId = await latestId("published_versions");
  versionId = await latestId("design_versions");
  const agency = await localAgency();
  for (const result of [
    await agency.rpc("set_publication_miro_link", {
      p_publication_id: publicationId,
      p_url: clientBoard,
    }),
    await agency.rpc("set_version_miro_link", { p_version_id: versionId, p_url: studioBoard }),
  ])
    if (result.error) throw new Error(result.error.message);
});

test.afterAll(async () => {
  const agency = await localAgency();
  await agency.rpc("clear_publication_miro_link", { p_publication_id: publicationId });
  await agency.rpc("clear_version_miro_link", { p_version_id: versionId });
});

test("the client works in Miro mode beside the project's tools", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, credentials.client);
  await page.goto(`/projects/${projectId}`);
  // Entering from the header shows the newest linked version with autoplay.
  await page
    .getByRole("group", { name: "Project view" })
    .getByRole("button", { name: "Miro" })
    .click();
  const frame = page.locator("iframe.miro-view-frame");
  await expect(frame).toHaveAttribute(
    "src",
    /live-embed\/uXjVClientE2E%3D\/\?autoplay=true&moveToWidget=111/,
  );
  await expect(page).toHaveURL(/view=miro/);
  await expect(page.locator('iframe[src*="uXjVStudioE2E"]')).toHaveCount(0);
  // The project's tools stay: Conversation opens beside Miro.
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".project-inspector").first()).toBeVisible();
  await expect(frame).toBeVisible();
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  // The Playground opens as the asset strip.
  await page.getByRole("button", { name: "Playground" }).click();
  await expect(page.getByRole("button", { name: "Open full Playground" })).toBeVisible();
  // Spike finding: the seeded client's Brand Hub has no folders, so every asset lands in one
  // "Unfiled" album; its first (alphabetically) file is a PNG, which the clipboard mode can copy.
  await page.getByRole("button", { name: "Unfiled" }).click();
  await page
    .getByRole("button", { name: "Copy Campus Connections - Campaign photography" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Copied — paste in Miro with ⌘V / Ctrl+V");
  // A reload keeps Miro mode.
  await page.reload();
  await expect(page.locator("iframe.miro-view-frame")).toBeVisible();
  // Back to Versions: the canvas returns.
  await page
    .getByRole("group", { name: "Project view" })
    .getByRole("button", { name: "Versions" })
    .click();
  await expect(page.locator("iframe.miro-view-frame")).toHaveCount(0);
  await expect(page).toHaveURL(/view=versions/);
  // Entering from a version card.
  await page.getByRole("button", { name: "View on Miro" }).first().click();
  await expect(page.locator("iframe.miro-view-frame")).toBeVisible();
});

test("the assigned designer sees only the internal board", async ({ page }) => {
  await signIn(page, credentials.designer);
  await page.goto(`/projects/${projectId}?view=miro`);
  await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVStudioE2E/);
  await expect(page.locator('iframe[src*="uXjVClientE2E"]')).toHaveCount(0);
});

test("a stale version in the URL falls back to the newest linked one", async ({ page }) => {
  await signIn(page, credentials.client);
  await page.goto(`/projects/${projectId}?view=miro&version=00000000-0000-0000-0000-000000000000`);
  await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVClientE2E/);
});

test.describe("Miro mode and the deliverable filter", () => {
  // "Instagram Ads" (two deliverables) with a link only on "Instagram Feed"'s latest publication,
  // so filtering to "Instagram Story" leaves nothing linked for the client channel. Never the
  // "Personal Alarm Product Story" project — its own link row is the user's, left untouched.
  const filterProjectId = "aea0ccab-ef4b-0ac1-6fec-e17ce156dd19";
  const linkedPublicationId = "8c37ef7f-c2de-4b7d-b14c-17e6d3b07479";
  const filterBoard = "https://miro.com/app/board/uXjVFilterE2E=/";

  test.beforeAll(async () => {
    const agency = await localAgency();
    const result = await agency.rpc("set_publication_miro_link", {
      p_publication_id: linkedPublicationId,
      p_url: filterBoard,
    });
    if (result.error) throw new Error(result.error.message);
  });

  test.afterAll(async () => {
    const agency = await localAgency();
    await agency.rpc("clear_publication_miro_link", { p_publication_id: linkedPublicationId });
  });

  test("filtering to a deliverable with no link leaves Miro mode out of reach", async ({
    page,
  }) => {
    await signIn(page, credentials.client);
    // A project with a Miro link opens on Miro, which has no deliverable filter; Versions has it.
    await page.goto(`/projects/${filterProjectId}`);
    await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVFilterE2E/);
    await expect(page).toHaveURL(/view=miro/);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByLabel("Filter deliverable")).toHaveCount(0);
    await page
      .getByRole("group", { name: "Project view" })
      .getByRole("button", { name: "Versions" })
      .click();
    await page.getByLabel("Filter deliverable").selectOption({ label: "Instagram Story" });
    await expect(page.getByRole("group", { name: "Project view" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/view=/);
  });

  test("choosing Versions survives a reload", async ({ page }) => {
    await signIn(page, credentials.client);
    await page.goto(`/projects/${filterProjectId}`);
    await page
      .getByRole("group", { name: "Project view" })
      .getByRole("button", { name: "Versions" })
      .click();
    await expect(page).toHaveURL(/view=versions/);
    await page.reload();
    await expect(page.locator("iframe.miro-view-frame")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Project view" }).getByRole("button", { name: "Versions" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
