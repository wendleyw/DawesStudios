import { expect, test } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

// A disposable SABRE project with a design board for its assigned designer (the internal link) and
// one client version (the client link). The embed itself is not loaded (no dependency on Miro's
// network); the iframe sources, the rows each role can read, the tools beside the embed and the
// Playground's asset strip are asserted.
test.describe.configure({ mode: "serial" });
const clientBoard = "https://miro.com/app/board/uXjVClientE2E=/?moveToWidget=111";
const studioBoard = "https://miro.com/app/board/uXjVStudioE2E=/?moveToWidget=222";
let projectId = "";
let clientId = "";
let designerEmail = "";

test.beforeAll(async () => {
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  projectId = fixture.projectId;
  clientId = fixture.clientId;
  designerEmail = (await localAdmin.auth.admin.getUserById(fixture.designerId)).data.user!.email!;
  const board = await agency.rpc("create_design_board", {
    p_project_id: projectId,
    p_name: "Internal direction",
    p_url: studioBoard,
    p_designer_id: fixture.designerId,
  });
  if (board.error) throw new Error(board.error.message);
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
  // The project's tools stay: Comments opens beside Miro.
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.locator(".project-inspector").first()).toBeVisible();
  await expect(frame).toBeVisible();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.locator(".project-inspector")).toHaveCount(0);
  // With a board shown, the Playground opens as the asset strip.
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open full Playground" })).toBeVisible();
  // Brand Hub files outside a folder land in the "Unfiled" album, sorted by title. The file to copy
  // is the first PNG there, read through the client's own session, so the canonical seed and the
  // SABRE overlay (whose brand files differ) both name a file the clipboard mode can copy.
  const assets = await (
    await localCaller(credentials.client)
  )
    .from("brand_assets")
    .select("name,mime_type,folder_id")
    .eq("client_id", clientId);
  expect(assets.error).toBeNull();
  const png = assets
    .data!.filter((asset) => asset.folder_id === null && asset.mime_type === "image/png")
    .map((asset) => asset.name)
    .sort((a, b) => a.localeCompare(b))[0];
  expect(png, "the client's Brand Hub has an unfiled PNG").toBeTruthy();
  await page.getByRole("button", { name: "Unfiled" }).click();
  await page.getByRole("button", { name: `Copy ${png}`, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Copied — paste in Miro with ⌘V / Ctrl+V");
  // A reload keeps the board.
  await page.reload();
  await expect(frame).toHaveAttribute("src", /uXjVClientE2E/);
});

test("the assigned designer embeds only the internal board and reads no client link", async ({
  page,
}) => {
  const designer = await localCaller(designerEmail);
  const links = await designer
    .from("publication_miro_links")
    .select("project_id")
    .eq("project_id", projectId);
  expect(links.error).toBeNull();
  expect(links.data).toEqual([]);
  // Positive control: the designer does read their own board's link.
  const boards = await designer.from("design_boards").select("id").eq("project_id", projectId);
  expect(boards.error).toBeNull();
  expect(boards.data).toHaveLength(1);
  await signIn(page, designerEmail);
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVStudioE2E/);
  await expect(page.locator('iframe[src*="uXjVClientE2E"]')).toHaveCount(0);
  await page.goto(`/projects/${projectId}?channel=client`);
  await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVStudioE2E/);
  await expect(page.locator('iframe[src*="uXjVClientE2E"]')).toHaveCount(0);
});

test("the client embeds only the client link and reads no internal board or link", async ({
  page,
}) => {
  const client = await localCaller(credentials.client);
  // Named columns: the author columns are not selectable by any API role, so "*" is refused.
  for (const table of ["design_version_miro_links", "design_boards"] as const) {
    const rows = await client.from(table).select("project_id").eq("project_id", projectId);
    expect(rows.error, table).toBeNull();
    expect(rows.data, table).toEqual([]);
  }
  // Positive control: the client does read its own client version's link.
  const shared = await client
    .from("publication_miro_links")
    .select("*")
    .eq("project_id", projectId);
  expect(shared.error).toBeNull();
  expect(shared.data).toHaveLength(1);
  await signIn(page, credentials.client);
  for (const path of [`/projects/${projectId}`, `/projects/${projectId}?channel=internal`]) {
    await page.goto(path);
    await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVClientE2E/);
    await expect(page.locator('iframe[src*="uXjVStudioE2E"]')).toHaveCount(0);
  }
});

test("the agency embeds each channel's own link", async ({ page }) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${projectId}`);
  const frame = page.locator("iframe.miro-view-frame");
  await expect(frame).toHaveAttribute("src", /uXjVStudioE2E/);
  await expect(page.locator('iframe[src*="uXjVClientE2E"]')).toHaveCount(0);
  await page
    .getByRole("group", { name: "Project channel" })
    .getByRole("button", { name: "Shared with client", exact: true })
    .click();
  await expect(frame).toHaveAttribute("src", /uXjVClientE2E/);
  await expect(page.locator('iframe[src*="uXjVStudioE2E"]')).toHaveCount(0);
});
