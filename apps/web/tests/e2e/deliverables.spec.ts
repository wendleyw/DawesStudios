import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";

const uploadPath = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
const driveUrl = "https://drive.google.com/drive/folders/acceptance-deliverable-backup";

test("the agency adds a deliverable with its Google Drive backup; only the agency adds one", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const name = `Acceptance deliverable ${crypto.randomUUID().slice(0, 8)}`;
  const deliverablesUrl = `/clients/${fixture.clientId}/brand/files?project=${fixture.projectId}`;
  const designerContext = await browser.newContext();
  try {
    // A delivery belongs to an approved project; the review workflow itself is exercised elsewhere.
    const arranged = await localAdmin
      .from("projects")
      .update({ status: "approved" })
      .eq("id", fixture.projectId);
    expect(arranged.error).toBeNull();

    await signIn(page, credentials.agency);
    await page.goto(deliverablesUrl);
    const sections = page.getByRole("navigation", { name: "Brand sections" });
    await expect(sections.locator('[aria-current="page"]')).toHaveText("Deliverables");
    await expect(page.getByRole("button", { name: "Working file" })).toHaveCount(0);
    await page.getByRole("button", { name: "Delivery file", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a deliverable" });
    await dialog.getByLabel("File name").fill(name);
    await dialog.getByLabel("File", { exact: true }).setInputFiles(uploadPath);
    await dialog.getByLabel("Google Drive backup (optional)").fill("https://example.com/folder");
    await dialog.getByRole("button", { name: "Add deliverable", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Google Drive link");
    await dialog.getByLabel("Google Drive backup (optional)").fill(driveUrl);
    await dialog.getByRole("button", { name: "Add deliverable", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(page.locator(".file-card").filter({ hasText: name })).toBeVisible();
    await expect(page.getByRole("link", { name: "Google Drive backup" })).toHaveAttribute(
      "href",
      driveUrl,
    );
    const receiving = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${name}` }).click();
    const download = await receiving;
    // The media worker sanitizes a delivered image, so its bytes are checked for content only.
    expect(await download.failure()).toBeNull();
    expect(readFileSync(await download.path()).byteLength).toBeGreaterThan(0);

    const link = await agency
      .from("project_drive_links")
      .select("url")
      .eq("project_id", fixture.projectId)
      .eq("channel", "client")
      .single();
    expect(link.error).toBeNull();
    expect(link.data?.url).toBe(driveUrl);

    const designerPage = await designerContext.newPage();
    await signIn(designerPage, credentials.designer);
    await designerPage.goto(deliverablesUrl);
    await expect(designerPage.getByRole("button", { name: "Delivery file" })).toHaveCount(0);
  } finally {
    await designerContext.close();
    await cleanupTestProject(fixture.projectId);
  }
});
