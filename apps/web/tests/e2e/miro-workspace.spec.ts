import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

// One acceptance project in SABRE with no versions, so both channels open on the Miro workspace.
// Designer A (the fixture's designer, the first by display name) owns a board; designer B is also
// assigned, with a board of their own, and must never see anything of designer A's.
test.describe.configure({ mode: "serial" });
let projectId = "";
let designerA = "";
let designerB = "";
let designerAEmail = "";
let designerBEmail = "";

// Working captures for the visual audit land in the ignored outputs/ directory.
const outputs = fileURLToPath(new URL("../../../../outputs/", import.meta.url));
mkdirSync(outputs, { recursive: true });
const capture = (page: Page, name: string) =>
  page.screenshot({ path: `${outputs}task8-${name}.png` });

test.beforeAll(async () => {
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency, [
    { name: "Campaign square", format: "square", width: 1080, height: 1080 },
  ]);
  projectId = fixture.projectId;
  designerA = fixture.designerId;
  const second = await localAdmin
    .from("profiles")
    .select("id")
    .eq("role", "designer")
    .neq("id", designerA)
    .order("display_name")
    .limit(1)
    .single();
  expect(second.error).toBeNull();
  designerB = second.data!.id;
  designerAEmail = (await localAdmin.auth.admin.getUserById(designerA)).data.user!.email!;
  designerBEmail = (await localAdmin.auth.admin.getUserById(designerB)).data.user!.email!;
  // The privacy test signs designer B in with the seeded second designer account.
  expect(designerBEmail).toBe(credentials.designer2);
  const assigned = await agency.rpc("assign_designer", {
    p_project_id: projectId,
    p_designer_id: designerB,
  });
  expect(assigned.error).toBeNull();
  const boardB = await agency.rpc("create_design_board", {
    p_project_id: projectId,
    p_name: "Board for B",
    p_url: "https://miro.com/app/board/uXjVBoardB1=/",
    p_designer_id: designerB,
  });
  expect(boardB.error).toBeNull();
});

test.afterAll(async () => {
  if (projectId) await cleanupTestProject(projectId);
});

test("agency, designer and client complete a round trip in Miro", async ({ browser }) => {
  test.setTimeout(120_000);
  const studio = await (await browser.newContext()).newPage();
  await signIn(studio, credentials.agency);
  await studio.goto(`/projects/${projectId}`);
  // Working files has B's board only, so there is no picker yet; add A's from the bar.
  await expect(studio.getByRole("combobox", { name: "Design board" })).toHaveCount(0);
  await studio.getByRole("button", { name: "Add design board" }).click();
  const boardDialog = studio.getByRole("dialog");
  await boardDialog.getByLabel("Board name").fill("Direction A");
  await boardDialog.getByLabel("Miro board").fill("https://miro.com/app/board/uXjVBoardA1=/");
  await boardDialog.getByLabel("Designer").selectOption(designerA);
  await boardDialog.getByRole("button", { name: "Add board" }).click();
  await expect(studio.getByRole("dialog")).toHaveCount(0);
  await expect(studio.getByRole("combobox", { name: "Design board" })).toHaveValue(/.+/);

  // The designer sends a round of their board.
  const designer = await (await browser.newContext()).newPage();
  await signIn(designer, designerAEmail);
  await designer.goto(`/projects/${projectId}`);
  await expect(designer.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVBoardA1/);
  // The designer has one board, so there is no picker, and nothing of B's.
  await expect(designer.getByRole("combobox", { name: "Design board" })).toHaveCount(0);
  await designer.getByRole("button", { name: "Send to studio" }).click();
  await designer.getByRole("dialog").getByLabel("Note for the studio").fill("Ready for a look");
  await designer.getByRole("dialog").getByRole("button", { name: "Send to studio" }).click();
  await expect(designer.getByRole("dialog")).toHaveCount(0);
  await expect(designer.getByRole("group", { name: "Rounds" })).toContainText("R1");
  await expect(designer.getByText("Board for B")).toHaveCount(0);
  await capture(designer, "designer-working-files");

  // The agency shares round 1 with a client link.
  await studio.reload();
  await studio
    .getByRole("combobox", { name: "Design board" })
    .selectOption({ label: "Direction A" });
  await studio.getByRole("button", { name: "Round 1" }).click();
  await capture(studio, "agency-working-files");
  await studio.getByRole("button", { name: "Share with client" }).click();
  const shareDialog = studio.getByRole("dialog");
  await shareDialog
    .getByLabel("Client Miro board")
    .fill("https://miro.com/app/board/uXjVClient1=/?moveToWidget=5");
  await shareDialog.getByLabel("Note for the client").fill("First look");
  await shareDialog.getByRole("button", { name: "Share with client" }).click();
  await expect(studio.getByRole("dialog")).toHaveCount(0);

  // The client requests changes, the agency adds V2 directly, the client approves.
  const client = await (await browser.newContext()).newPage();
  await signIn(client, credentials.client);
  await client.goto(`/projects/${projectId}`);
  await expect(client.getByRole("group", { name: "Client versions" })).toContainText("V1");
  await expect(client.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVClient1/);
  await expect(client.locator('iframe[src*="uXjVBoardA1"]')).toHaveCount(0);
  await expect(client.getByText(/Direction A|Board for B|Alex Morgan|Jordan Reed/)).toHaveCount(0);
  await capture(client, "client-shared-with-client");
  await client.getByRole("button", { name: "Request changes" }).click();
  const requestDialog = client.getByRole("dialog");
  await expect(requestDialog.getByLabel("Your decision")).toHaveValue("changes_requested");
  await requestDialog.getByLabel("Feedback").fill("Warmer tones");
  await requestDialog.getByRole("button", { name: "Send review" }).click();
  await expect(client.getByRole("dialog")).toHaveCount(0);

  await studio.getByRole("button", { name: "More" }).click();
  await studio.getByRole("button", { name: "Shared with client" }).click();
  await studio.getByRole("button", { name: "New client version" }).click();
  const versionDialog = studio.getByRole("dialog");
  await expect(versionDialog.getByLabel("Client Miro board")).toHaveValue(/uXjVClient1/);
  await versionDialog.getByLabel("Note for the client").fill("Warmer tones applied");
  await versionDialog.getByRole("button", { name: "Share with client" }).click();
  await expect(studio.getByRole("dialog")).toHaveCount(0);
  await expect(studio.getByRole("group", { name: "Client versions" })).toContainText("V2");
  await capture(studio, "agency-shared-with-client");

  await client.reload();
  await expect(client.getByRole("group", { name: "Client versions" })).toContainText("V2");
  await client.getByRole("button", { name: "Approve" }).click();
  const approveDialog = client.getByRole("dialog");
  await expect(approveDialog.getByLabel("Your decision")).toHaveValue("approved");
  await approveDialog.getByRole("button", { name: "Send review" }).click();
  await expect(client.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await localAdmin.from("projects").select("status").eq("id", projectId).single()).data
          ?.status,
    )
    .toBe("approved");
});

test("a designer never sees another designer's board, rounds or comments", async ({ page }) => {
  const designerBClient = await localCaller(designerBEmail);
  const boards = await designerBClient
    .from("design_boards")
    .select("name")
    .eq("project_id", projectId);
  expect(boards.error).toBeNull();
  expect(boards.data?.map((board) => board.name)).toEqual(["Board for B"]);
  const rounds = await designerBClient
    .from("design_versions")
    .select("id")
    .eq("project_id", projectId)
    .not("board_id", "is", null);
  expect(rounds.error).toBeNull();
  expect(rounds.data).toEqual([]);
  const comments = await designerBClient
    .from("internal_comments")
    .select("author_id")
    .eq("project_id", projectId);
  expect((comments.data ?? []).some((comment) => comment.author_id === designerA)).toBe(false);
  await signIn(page, designerBEmail);
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVBoardB1/);
  await expect(page.getByText(/Direction A|Alex Morgan/)).toHaveCount(0);
  await expect(page.locator('iframe[src*="uXjVBoardA1"]')).toHaveCount(0);
  await capture(page, "designer-b-working-files");
});
