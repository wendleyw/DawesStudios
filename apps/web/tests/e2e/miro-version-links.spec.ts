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

test("the client opens the client board and never the internal one", async ({ page }) => {
  await signIn(page, credentials.client);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "View on Miro" }).first().click();
  const frame = page.locator("iframe.miro-board-frame");
  await expect(frame).toHaveAttribute("src", /live-embed\/uXjVClientE2E%3D\/\?moveToWidget=111/);
  await expect(page.getByRole("link", { name: /Open in Miro/ })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(page.locator('iframe[src*="uXjVStudioE2E"]')).toHaveCount(0);
  await page.getByRole("button", { name: /Back to project/ }).click();
  await expect(frame).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Miro link for version/ })).toHaveCount(0);
});

test("the assigned designer opens only the internal board", async ({ page }) => {
  await signIn(page, credentials.designer);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "View on Miro" }).first().click();
  await expect(page.locator("iframe.miro-board-frame")).toHaveAttribute("src", /uXjVStudioE2E/);
  await expect(page.locator('iframe[src*="uXjVClientE2E"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Miro link for version/ })).toHaveCount(0);
});

test("the agency manages the link on each channel", async ({ page }) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${projectId}`);
  await expect(
    page.getByRole("button", { name: /Change Miro link for version/ }).first(),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}?channel=client`);
  await page.getByRole("button", { name: "View on Miro" }).first().click();
  await expect(page.locator("iframe.miro-board-frame")).toHaveAttribute("src", /uXjVClientE2E/);
});
