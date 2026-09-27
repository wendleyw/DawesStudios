import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import {
  credentials,
  localAdmin,
  localAgency,
  preserveBoardPreference,
  signIn,
} from "./test-support";

// One disposable SABRE project. The agency sets, shows, replaces and removes its cover; the
// client's board only ever shows it while it is visible to the client, and the assigned designer
// always sees it.
test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

const png = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
let projectId = "";
let clientId = "";
let designerEmail = "";
const restores: (() => Promise<void>)[] = [];

test.beforeAll(async () => {
  const fixture = await createProductionFixture(await localAgency());
  projectId = fixture.projectId;
  clientId = fixture.clientId;
  designerEmail = (await localAdmin.auth.admin.getUserById(fixture.designerId)).data.user!.email!;
  for (const email of [credentials.agency, credentials.client, designerEmail])
    restores.push(await preserveBoardPreference(email, clientId));
});

test.afterAll(async () => {
  for (const restore of restores) await restore();
  if (projectId) await cleanupTestProject(projectId);
});

async function storedCovers() {
  const listed = await localAdmin.storage.from("project-covers").list(projectId);
  if (listed.error) throw listed.error;
  return listed.data.map((object) => object.name);
}

/** The project's card on the canvas board, which is the one view that shows a cover. */
function cardImage(page: Page) {
  return page.locator(`.react-flow__node[data-id="${projectId}"] .board-card-media img`);
}

async function openBoard(page: Page) {
  await page.goto(`/clients/${clientId}/board`);
  const canvas = page.getByRole("button", { name: "Canvas view", exact: true });
  await canvas.click();
  await expect(canvas).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`.react-flow__node[data-id="${projectId}"]`)).toHaveCount(1);
}

async function session(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  return page;
}

test("the agency controls a project cover and each role sees what it may", async ({ browser }) => {
  test.setTimeout(180_000);
  const studio = await session(browser, credentials.agency);
  const client = await session(browser, credentials.client);
  const designer = await session(browser, designerEmail);
  // Every request the client's pages make, to prove no cover object is fetched while it is hidden.
  const clientRequests: string[] = [];
  client.on("request", (request) => clientRequests.push(request.url()));

  // 1. The agency sets a cover from Project details.
  await studio.goto(`/projects/${projectId}`);
  await studio
    .getByRole("group", { name: "Project actions" })
    .getByRole("button", { name: "Project details", exact: true })
    .click();
  const block = studio.locator(".project-cover");
  await expect(block).toContainText("No cover set yet.");
  await block.locator('input[type="file"]').setInputFiles(png);
  await expect(block.getByRole("img", { name: "Project cover" })).toBeVisible({
    timeout: 20_000,
  });
  const visible = block.getByRole("switch", { name: "Visible to the client" });
  await expect(visible).not.toBeChecked();
  const first = await storedCovers();
  expect(first).toHaveLength(1);

  // 2. The agency's board card shows it.
  await openBoard(studio);
  await expect(cardImage(studio)).toBeVisible();
  await expect(cardImage(studio)).toHaveAttribute("src", /project-covers/);

  // 3. The client's card does not, and the client never fetches a cover object.
  await openBoard(client);
  await expect(client.locator(`.react-flow__node[data-id="${projectId}"]`)).toContainText(
    "No cover yet",
  );
  await expect(cardImage(client)).toHaveCount(0);
  expect(clientRequests.filter((url) => url.includes("project-covers"))).toEqual([]);

  // 4. Visible to the client: the client's card shows it.
  await studio.goto(`/projects/${projectId}`);
  await studio
    .getByRole("group", { name: "Project actions" })
    .getByRole("button", { name: "Project details", exact: true })
    .click();
  // The switch reflects the saved row, so it turns on once the write lands rather than on click.
  await studio.getByRole("switch", { name: "Visible to the client" }).click();
  await expect(studio.getByRole("switch", { name: "Visible to the client" })).toBeChecked();
  await expect
    .poll(
      async () =>
        (
          await localAdmin
            .from("project_covers")
            .select("client_visible")
            .eq("project_id", projectId)
            .single()
        ).data?.client_visible,
    )
    .toBe(true);
  await openBoard(client);
  await expect(cardImage(client)).toBeVisible();

  // 5. The assigned designer sees it.
  await openBoard(designer);
  await expect(cardImage(designer)).toBeVisible();

  // 6. Replacing the cover discards the old object and keeps it visible to the client.
  await studio.locator(".project-cover input[type='file']").setInputFiles(png);
  await expect
    .poll(
      async () => {
        const names = await storedCovers();
        return names.length === 1 && names[0] !== first[0];
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(studio.getByRole("switch", { name: "Visible to the client" })).toBeChecked();

  // 7. Remove clears it everywhere.
  await studio
    .locator(".project-cover")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await studio
    .getByRole("dialog", { name: "Remove this cover?" })
    .getByRole("button", { name: "Remove cover", exact: true })
    .click();
  await expect(studio.locator(".project-cover")).toContainText("No cover set yet.");
  await expect.poll(storedCovers).toEqual([]);
  expect(
    (await localAdmin.from("project_covers").select("project_id").eq("project_id", projectId)).data,
  ).toEqual([]);
  for (const page of [studio, client, designer]) {
    await openBoard(page);
    await expect(cardImage(page)).toHaveCount(0);
  }
  for (const page of [studio, client, designer]) await page.context().close();
});
