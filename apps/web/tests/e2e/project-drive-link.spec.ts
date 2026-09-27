import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";

// One disposable SABRE project. The agency adds a Google Drive backup link in Project details; the
// client sees the same icon link in the More menu and in Files, and it opens in a new tab; the
// agency then clears it and the icon disappears everywhere.
test.describe.configure({ mode: "serial" });

const driveUrl = "https://drive.google.com/drive/folders/1AcceptanceDriveLink";
const png = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
let projectId = "";
let clientId = "";

test.beforeAll(async () => {
  const fixture = await createProductionFixture(await localAgency());
  projectId = fixture.projectId;
  clientId = fixture.clientId;
  // The Files page only shows a project's group heading (and its Drive icon) once the project has
  // at least one file the viewer can read; a client never reads working files (`project_assets`),
  // so this fixture stores a delivery file instead, uploaded directly with the service role. A
  // client reads a delivery file only once the project is delivered (`private.delivery_released`),
  // which this disposable fixture is marked as directly, skipping the full delivery workflow.
  // Consequence: step 5 below (the client's Files path) is proven only for a delivered project —
  // it is the only status under which a client's Files group renders at all, so there is no
  // non-delivered variant of that assertion to add. The agency's Files path (step 4) and the More
  // menu (steps 3/5) do not depend on delivery status; only the client's `assets-page.tsx` read
  // does.
  const objectPath = `${projectId}/drive-link-fixture.png`;
  const bytes = readFileSync(png);
  const uploaded = await localAdmin.storage
    .from("delivery-files")
    .upload(objectPath, bytes, { contentType: "image/png" });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const recorded = await localAdmin.from("delivery_files").insert({
    project_id: projectId,
    name: "Drive link fixture.png",
    storage_path: objectPath,
    mime_type: "image/png",
    file_size: bytes.byteLength,
  });
  if (recorded.error) throw new Error(recorded.error.message);
  const delivered = await localAdmin
    .from("projects")
    .update({ status: "delivered" })
    .eq("id", projectId);
  if (delivered.error) throw new Error(delivered.error.message);
});

test.afterAll(async () => {
  if (projectId) await cleanupTestProject(projectId);
});

async function session(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  return page;
}

async function openMore(page: Page) {
  const more = page.locator(".project-chrome").getByRole("button", { name: "More", exact: true });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  return page.locator(".miro-bar-popover");
}

async function openProjectDetails(page: Page) {
  await page
    .getByRole("group", { name: "Project actions" })
    .getByRole("button", { name: "Project details", exact: true })
    .click();
}

async function closeProjectDetails(page: Page) {
  await page.getByRole("button", { name: "Close project details" }).click();
}

test("the agency adds a Drive link, the client sees it in the More menu and Files, and clearing removes it", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const studio = await session(browser, credentials.agency);
  const client = await session(browser, credentials.client);

  // 1. Project details offers Add Drive link with no link yet, and refuses an invalid one.
  await studio.goto(`/projects/${projectId}`);
  await openProjectDetails(studio);
  await expect(studio.getByText("No backup link yet.")).toBeVisible();
  await studio.getByRole("button", { name: "Add Drive link" }).click();
  await studio
    .getByRole("textbox", { name: "Drive link", exact: true })
    .fill("http://drive.google.com/drive/folders/1");
  await studio.getByRole("button", { name: "Save link" }).click();
  await expect(
    studio.getByText("Paste a Google Drive link (https://drive.google.com/…)."),
  ).toBeVisible();

  // 2. A valid link saves, and Project details switches to Edit Drive link with the open link.
  await studio.getByRole("textbox", { name: "Drive link", exact: true }).fill(driveUrl);
  await studio.getByRole("button", { name: "Save link" }).click();
  await expect(studio.getByRole("button", { name: "Edit Drive link" })).toBeVisible();
  await expect(studio.getByRole("link", { name: "Open Google Drive backup" })).toHaveAttribute(
    "href",
    driveUrl,
  );
  await closeProjectDetails(studio);

  // 3. The agency sees it in the More menu, opening in a new tab.
  const studioMenu = await openMore(studio);
  const studioMenuLink = studioMenu.getByRole("link", { name: "Open Google Drive backup" });
  await expect(studioMenuLink).toHaveAttribute("href", driveUrl);
  await expect(studioMenuLink).toHaveAttribute("target", "_blank");
  await expect(studioMenuLink).toHaveAttribute("rel", "noopener noreferrer");

  // 4. The agency sees it in Files, beside the project.
  await studio.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(studio.getByRole("link", { name: "Open Google Drive backup" })).toHaveAttribute(
    "href",
    driveUrl,
  );

  // 5. The client sees the same icon link, in the More menu and in Files, opening in a new tab.
  await client.goto(`/projects/${projectId}`);
  const clientMenu = await openMore(client);
  const clientMenuLink = clientMenu.getByRole("link", { name: "Open Google Drive backup" });
  await expect(clientMenuLink).toHaveAttribute("href", driveUrl);
  await expect(clientMenuLink).toHaveAttribute("target", "_blank");
  await expect(clientMenuLink).toHaveAttribute("rel", "noopener noreferrer");
  await client.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(client.getByRole("link", { name: "Open Google Drive backup" })).toHaveAttribute(
    "href",
    driveUrl,
  );

  // 6. The agency clears the link with an empty save, and the icon disappears everywhere.
  await studio.goto(`/projects/${projectId}`);
  await openProjectDetails(studio);
  await studio.getByRole("button", { name: "Edit Drive link" }).click();
  await studio.getByRole("textbox", { name: "Drive link", exact: true }).fill("");
  await studio.getByRole("button", { name: "Save link" }).click();
  await expect(studio.getByText("No backup link yet.")).toBeVisible();
  await expect(studio.getByRole("link", { name: "Open Google Drive backup" })).toHaveCount(0);
  await closeProjectDetails(studio);
  const studioMenuAfter = await openMore(studio);
  await expect(studioMenuAfter.getByRole("link", { name: "Open Google Drive backup" })).toHaveCount(
    0,
  );
  await studio.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(studio.getByRole("link", { name: "Open Google Drive backup" })).toHaveCount(0);

  await client.goto(`/projects/${projectId}`);
  const clientMenuAfter = await openMore(client);
  await expect(clientMenuAfter.getByRole("link", { name: "Open Google Drive backup" })).toHaveCount(
    0,
  );
  await client.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(client.getByRole("link", { name: "Open Google Drive backup" })).toHaveCount(0);

  for (const page of [studio, client]) await page.context().close();
});
