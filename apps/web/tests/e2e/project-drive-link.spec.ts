import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";

// One disposable SABRE project with its assigned designer. The agency sets two separate Drive
// links — internal and client — in
// Project details; the designer sees only the internal one (in the More menu, always on the
// internal channel), the client sees only the client one (in the More menu and in Files), and
// clearing each removes it everywhere it was visible.
test.describe.configure({ mode: "serial" });

const internalUrl = "https://drive.google.com/drive/folders/1AcceptanceInternalLink";
const clientUrl = "https://drive.google.com/drive/folders/1AcceptanceClientLink";
const png = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
let projectId = "";
let clientId = "";
let designerEmail = "";

test.beforeAll(async () => {
  const fixture = await createProductionFixture(await localAgency());
  projectId = fixture.projectId;
  clientId = fixture.clientId;
  designerEmail = (await localAdmin.auth.admin.getUserById(fixture.designerId)).data.user!.email!;
  // The Files page only shows a project's group heading (and its Drive icon) once the project has
  // at least one file the viewer can read; a client never reads working files (`project_assets`),
  // so this fixture stores a delivery file instead, uploaded directly with the service role. A
  // client reads a delivery file only once the project is delivered (`private.delivery_released`),
  // which this disposable fixture is marked as directly, skipping the full delivery workflow.
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

test("the agency sets one Drive link per channel, and each role sees only its own", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const studio = await session(browser, credentials.agency);
  const designer = await session(browser, designerEmail);
  const client = await session(browser, credentials.client);

  // 1. Project details offers both channels with no link yet, and refuses an invalid one.
  await studio.goto(`/projects/${projectId}`);
  await openProjectDetails(studio);
  await expect(
    studio.getByRole("heading", { name: "Internal Drive link", exact: true }),
  ).toBeVisible();
  await expect(
    studio.getByRole("heading", { name: "Client Drive link", exact: true }),
  ).toBeVisible();
  await studio.getByRole("button", { name: "Add Internal Drive link" }).click();
  const internalDialog = studio.getByRole("dialog", { name: "Add Internal Drive link" });
  await internalDialog
    .getByRole("textbox", { name: "Drive link", exact: true })
    .fill("http://drive.google.com/drive/folders/1");
  await internalDialog.getByRole("button", { name: "Save link" }).click();
  await expect(
    studio.getByText("Paste a Google Drive link (https://drive.google.com/…)."),
  ).toBeVisible();

  // 2. A valid internal link saves, and Details switches to Edit with the open link.
  await internalDialog.getByRole("textbox", { name: "Drive link", exact: true }).fill(internalUrl);
  await internalDialog.getByRole("button", { name: "Save link" }).click();
  await expect(
    studio.getByRole("button", { name: "Edit Internal Drive link", exact: true }),
  ).toBeVisible();
  await expect(studio.getByRole("link", { name: "Open internal Drive folder" })).toHaveAttribute(
    "href",
    internalUrl,
  );

  // 3. The client link saves independently, and the internal one is untouched.
  await studio.getByRole("button", { name: "Add Client Drive link" }).click();
  const clientDialog = studio.getByRole("dialog", { name: "Add Client Drive link" });
  await clientDialog.getByRole("textbox", { name: "Drive link", exact: true }).fill(clientUrl);
  await clientDialog.getByRole("button", { name: "Save link" }).click();
  await expect(
    studio.getByRole("button", { name: "Edit Client Drive link", exact: true }),
  ).toBeVisible();
  await expect(studio.getByRole("link", { name: "Open client Drive folder" })).toHaveAttribute(
    "href",
    clientUrl,
  );
  await expect(studio.getByRole("link", { name: "Open internal Drive folder" })).toHaveAttribute(
    "href",
    internalUrl,
  );
  // Reload from the database before switching roles: both independent values must persist.
  await studio.reload();
  await openProjectDetails(studio);
  await expect(studio.getByRole("link", { name: "Open internal Drive folder" })).toHaveAttribute(
    "href",
    internalUrl,
  );
  await expect(studio.getByRole("link", { name: "Open client Drive folder" })).toHaveAttribute(
    "href",
    clientUrl,
  );
  await closeProjectDetails(studio);

  // 4. The agency's More menu shows only the channel on screen: internal on Working files.
  const studioMenu = await openMore(studio);
  await expect(
    studioMenu.getByRole("link", { name: "Open internal Drive folder" }),
  ).toHaveAttribute("href", internalUrl);
  await expect(studioMenu.getByRole("link", { name: "Open client Drive folder" })).toHaveCount(0);
  await studio.keyboard.press("Escape");

  // 5. Switching to Shared with client flips the More menu to the client link alone.
  await studio.getByRole("button", { name: "Shared with client" }).click();
  const studioClientMenu = await openMore(studio);
  await expect(
    studioClientMenu.getByRole("link", { name: "Open client Drive folder" }),
  ).toHaveAttribute("href", clientUrl);
  await expect(
    studioClientMenu.getByRole("link", { name: "Open internal Drive folder" }),
  ).toHaveCount(0);
  await studio.keyboard.press("Escape");

  // 6. Files (agency) shows the client link only, never the internal one, beside the project.
  await studio.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(studio.getByRole("link", { name: "Open client Drive folder" })).toHaveAttribute(
    "href",
    clientUrl,
  );
  await expect(studio.getByRole("link", { name: "Open internal Drive folder" })).toHaveCount(0);

  // 7. The designer, always on the internal channel, sees only the internal link — never Project
  // details' Drive controls (agency only) and never the client link in the More menu.
  await designer.goto(`/projects/${projectId}`);
  const designerMenu = await openMore(designer);
  await expect(
    designerMenu.getByRole("link", { name: "Open internal Drive folder" }),
  ).toHaveAttribute("href", internalUrl);
  await expect(designerMenu.getByRole("link", { name: "Open client Drive folder" })).toHaveCount(0);
  await designer.keyboard.press("Escape");
  await openProjectDetails(designer);
  await expect(designer.getByRole("button", { name: /Drive link/ })).toHaveCount(0);

  // 8. The client sees only the client link — in the More menu and in Files — never the internal
  // one, and never Project details' Drive controls (agency only).
  await client.goto(`/projects/${projectId}`);
  const clientMenu = await openMore(client);
  await expect(clientMenu.getByRole("link", { name: "Open client Drive folder" })).toHaveAttribute(
    "href",
    clientUrl,
  );
  await expect(clientMenu.getByRole("link", { name: "Open internal Drive folder" })).toHaveCount(0);
  await client.keyboard.press("Escape");
  await openProjectDetails(client);
  await expect(client.getByRole("button", { name: /Drive link/ })).toHaveCount(0);
  await client.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(client.getByRole("link", { name: "Open client Drive folder" })).toHaveAttribute(
    "href",
    clientUrl,
  );
  await expect(client.getByRole("link", { name: "Open internal Drive folder" })).toHaveCount(0);

  // 9. The agency clears each channel with an empty save, and each icon disappears everywhere it
  // was visible.
  await studio.goto(`/projects/${projectId}`);
  await openProjectDetails(studio);
  await studio.getByRole("button", { name: "Edit Internal Drive link", exact: true }).click();
  const editInternal = studio.getByRole("dialog", {
    name: "Edit Internal Drive link",
    exact: true,
  });
  await editInternal.getByRole("textbox", { name: "Drive link", exact: true }).fill("");
  await editInternal.getByRole("button", { name: "Save link" }).click();
  await studio.getByRole("button", { name: "Edit Client Drive link", exact: true }).click();
  const editClient = studio.getByRole("dialog", { name: "Edit Client Drive link", exact: true });
  await editClient.getByRole("textbox", { name: "Drive link", exact: true }).fill("");
  await editClient.getByRole("button", { name: "Save link" }).click();
  await expect(studio.getByText("No link yet.")).toHaveCount(2);
  await closeProjectDetails(studio);

  await studio.getByRole("button", { name: "Shared with client" }).click();
  const studioMenuAfter = await openMore(studio);
  await expect(studioMenuAfter.getByRole("link", { name: "Open client Drive folder" })).toHaveCount(
    0,
  );
  await studio.keyboard.press("Escape");
  await studio.getByRole("button", { name: "Working files" }).click();
  const studioInternalMenuAfter = await openMore(studio);
  await expect(
    studioInternalMenuAfter.getByRole("link", { name: "Open internal Drive folder" }),
  ).toHaveCount(0);
  await studio.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(studio.getByRole("link", { name: "Open client Drive folder" })).toHaveCount(0);

  await designer.goto(`/projects/${projectId}`);
  const designerMenuAfter = await openMore(designer);
  await expect(
    designerMenuAfter.getByRole("link", { name: "Open internal Drive folder" }),
  ).toHaveCount(0);

  await client.goto(`/projects/${projectId}`);
  const clientMenuAfter = await openMore(client);
  await expect(clientMenuAfter.getByRole("link", { name: "Open client Drive folder" })).toHaveCount(
    0,
  );
  await client.goto(`/clients/${clientId}/brand/files?project=${projectId}`);
  await expect(client.getByRole("link", { name: "Open client Drive folder" })).toHaveCount(0);

  for (const page of [studio, designer, client]) await page.context().close();
});
