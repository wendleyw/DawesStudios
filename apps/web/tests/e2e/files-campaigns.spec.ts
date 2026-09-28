import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import {
  credentials,
  localAdmin,
  localAgency,
  localCaller,
  screenshotDirectory,
  signIn,
} from "./test-support";

/**
 * The canonical seed holds no SABRE files (its one delivery belongs to another client), so this file
 * brings its own: four disposable SABRE projects across SABRE's three campaigns — two in the first,
 * so a campaign groups files under more than one project — each with delivery files, and working
 * files in the first. The projects are marked delivered, which is when a client reads delivery files
 * (`private.delivery_released`). Every expectation is still counted from each role's own reads, so
 * the SABRE overlay's files are counted alongside these.
 */
test.describe.configure({ mode: "serial" });

const png = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
const fixtureProjects: string[] = [];

async function storeFile(
  bucket: "delivery-files" | "internal-assets",
  projectId: string,
  name: string,
) {
  const bytes = readFileSync(png);
  const storagePath = `${projectId}/${crypto.randomUUID()}.png`;
  const uploaded = await localAdmin.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: "image/png" });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const row = {
    project_id: projectId,
    name,
    storage_path: storagePath,
    mime_type: "image/png",
    file_size: bytes.byteLength,
  };
  const recorded =
    bucket === "delivery-files"
      ? await localAdmin.from("delivery_files").insert(row)
      : await localAdmin.from("project_assets").insert(row);
  if (recorded.error) throw new Error(recorded.error.message);
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const agency = await localAgency();
  const campaigns = await localAdmin
    .from("campaigns")
    .select("id")
    .eq("client_id", await sabreId())
    .order("title");
  expect(campaigns.error).toBeNull();
  expect(campaigns.data!.length).toBeGreaterThanOrEqual(3);
  // Two projects in the first campaign, one in each of the next two; the file counts differ, so
  // the first campaign is unambiguously the busiest for the agency and for the client.
  const plan = [
    { campaign: 0, deliveries: 2, working: 2 },
    { campaign: 0, deliveries: 1, working: 0 },
    { campaign: 1, deliveries: 1, working: 0 },
    { campaign: 2, deliveries: 1, working: 0 },
  ];
  for (const [index, entry] of plan.entries()) {
    const { projectId } = await createProductionFixture(agency);
    fixtureProjects.push(projectId);
    const moved = await localAdmin
      .from("projects")
      .update({ campaign_id: campaigns.data![entry.campaign].id, status: "delivered" })
      .eq("id", projectId);
    if (moved.error) throw new Error(moved.error.message);
    for (let file = 1; file <= entry.deliveries; file += 1)
      await storeFile(
        "delivery-files",
        projectId,
        `Files fixture ${index + 1} delivery ${file}.png`,
      );
    for (let file = 1; file <= entry.working; file += 1)
      await storeFile(
        "internal-assets",
        projectId,
        `Files fixture ${index + 1} working ${file}.png`,
      );
  }
});

test.afterAll(async () => {
  for (const projectId of fixtureProjects.splice(0)) await cleanupTestProject(projectId);
});

/**
 * Files per campaign as the signed-in role's own reads return them (the page reads working files
 * only for the studio). Counted through that role's own session rather than the service role, so row
 * security decides what counts, on the canonical seed and the local SABRE overlay alike.
 */
async function expectedFolders(email: string, clientId: string) {
  const caller = await localCaller(email);
  const projects = await caller
    .from("projects")
    .select("id,title,campaign_id,campaigns(title)")
    .eq("client_id", clientId);
  expect(projects.error).toBeNull();
  const ids = projects.data!.map((project) => project.id);
  // The designs live in Miro, so Deliverables lists delivery files only, for every role.
  const deliveries = await caller.from("delivery_files").select("project_id").in("project_id", ids);
  expect(deliveries.error).toBeNull();
  const files = deliveries.data!;
  const campaignOf = new Map(
    projects.data!.map((project) => [
      project.id,
      project.campaign_id && project.campaigns
        ? { id: project.campaign_id, title: project.campaigns.title }
        : { id: "none", title: "No campaign" },
    ]),
  );
  const folders = new Map<string, { title: string; files: number; projects: Set<string> }>();
  for (const file of files) {
    const campaign = campaignOf.get(file.project_id)!;
    const folder = folders.get(campaign.id) ?? {
      title: campaign.title,
      files: 0,
      projects: new Set<string>(),
    };
    folder.files += 1;
    folder.projects.add(file.project_id);
    folders.set(campaign.id, folder);
  }
  return { folders, projects: projects.data! };
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

async function sabreId() {
  const sabre = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  expect(sabre.error).toBeNull();
  return sabre.data!.id;
}

async function expectNoAxeViolations(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test("files open as campaign folders and each campaign groups its files by project", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const clientId = await sabreId();
  const { folders, projects } = await expectedFolders(credentials.agency, clientId);
  const base = `/clients/${clientId}/brand/files`;
  await signIn(page, credentials.agency);
  await page.goto(base);

  await expect(
    page.getByRole("heading", { level: 2, name: "Deliverables", exact: true }),
  ).toBeVisible();
  // Projects live inside their campaign, so the folder view has no project filter.
  await expect(page.getByLabel("Filter project", { exact: true })).toHaveCount(0);
  const cards = page.locator(".folder-tile");
  await expect(cards).toHaveCount(folders.size);
  for (const [id, folder] of folders) {
    const card = page.locator(`.folder-tile[href="${base}?campaign=${id}"]`);
    await expect(card.locator("strong")).toHaveText(folder.title);
    await expect(card).toContainText(
      `${plural(folder.files, "file")} · ${plural(folder.projects.size, "project")}`,
    );
  }
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${screenshotDirectory}/files-folders-agency-1600.png` });

  // Open the busiest campaign: its files, grouped under each project's own heading.
  const [busiestId, busiest] = [...folders].sort((a, b) => b[1].files - a[1].files)[0];
  await page.locator(`.folder-tile[href="${base}?campaign=${busiestId}"]`).click();
  await expect(page).toHaveURL(`${base}?campaign=${busiestId}`);
  await expect(page.locator(".files-heading h2")).toHaveText(busiest.title);
  await expect(page.locator(".files-heading p")).toHaveText(
    `${plural(busiest.files, "file")} from ${plural(busiest.projects.size, "project")}`,
  );
  await expect(page.locator(".file-group")).toHaveCount(busiest.projects.size);
  await expect(page.locator(".file-card")).toHaveCount(busiest.files);
  for (const projectId of busiest.projects)
    await expect(page.locator(`.file-group h2 a[href="/projects/${projectId}"]`)).toHaveText(
      projects.find((project) => project.id === projectId)!.title,
    );
  const filter = page.getByLabel("Filter project", { exact: true });
  await expect(filter.locator("option")).toHaveCount(
    projects.filter((project) => (project.campaign_id ?? "none") === busiestId).length + 1,
  );
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${screenshotDirectory}/files-campaign-agency-1600.png` });

  // The browser's Back button and the title's back arrow both return to the folders.
  await page.goBack();
  await expect(cards).toHaveCount(folders.size);
  await page.goForward();
  await expect(page.locator(".files-heading h2")).toHaveText(busiest.title);
  await page.getByRole("link", { name: "All campaigns", exact: true }).click();
  await expect(page).toHaveURL(base);
  await expect(cards).toHaveCount(folders.size);

  // Search narrows the folders to the campaigns holding a match, and carries into a campaign.
  const onlyProject = [...busiest.projects][0];
  const sample =
    (
      await localAdmin
        .from("delivery_files")
        .select("name")
        .eq("project_id", onlyProject)
        .limit(1)
        .maybeSingle()
    ).data ??
    (
      await localAdmin
        .from("project_assets")
        .select("name")
        .eq("project_id", onlyProject)
        .limit(1)
        .maybeSingle()
    ).data;
  if (sample) {
    await page.getByRole("textbox", { name: "Search deliverables", exact: true }).fill(sample.name);
    await expect(page.locator(`.folder-tile[href="${base}?campaign=${busiestId}"]`)).toBeVisible();
    await page
      .getByRole("textbox", { name: "Search deliverables", exact: true })
      .fill("no such file");
    await expect(page.getByRole("heading", { name: "No matching deliverables." })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(cards).toHaveCount(folders.size);
  }

  // A project's own Files link opens its campaign already filtered to that project.
  await page.goto(`${base}?project=${onlyProject}`);
  await expect(page.locator(".files-heading h2")).toHaveText(busiest.title);
  await expect(filter).toHaveValue(onlyProject);
  await expect(page.locator(".file-group")).toHaveCount(1);
  await expect(page.locator(`.file-group h2 a[href="/projects/${onlyProject}"]`)).toBeVisible();

  // An unknown campaign falls back to the folders.
  await page.goto(`${base}?campaign=00000000-0000-0000-0000-000000000000`);
  await expect(cards).toHaveCount(folders.size);
});

test("clients see their own folders, and a campaign opens at the top on a phone", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const clientId = await sabreId();
  const { folders } = await expectedFolders(credentials.client, clientId);
  const base = `/clients/${clientId}/brand/files`;
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, credentials.client);
  await page.goto(base);
  const cards = page.locator(".folder-tile");
  await expect(cards).toHaveCount(folders.size);
  for (const [id, folder] of folders)
    await expect(page.locator(`.folder-tile[href="${base}?campaign=${id}"]`)).toContainText(
      `${plural(folder.files, "file")} · ${plural(folder.projects.size, "project")}`,
    );
  // Clients have no uploads, so no delivery action.
  await expect(page.getByRole("button", { name: "Delivery file" })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${screenshotDirectory}/files-folders-client-390.png` });

  // Scroll down to the last folder and open it: the campaign starts at its title.
  const last = cards.last();
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(page).toHaveURL(/\?campaign=/);
  const title = page.locator(".files-heading h2");
  // Files sits under the Brand Hub title card, so "the top" is the campaign's own title.
  await expect(title).toBeInViewport();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${screenshotDirectory}/files-campaign-client-390.png` });
});
