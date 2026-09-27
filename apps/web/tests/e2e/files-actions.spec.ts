import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAgency, localCaller, signIn } from "./test-support";

const uploadPath = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
const uploadBytes = readFileSync(uploadPath);

async function uploadWorkingFile(page: Page, name: string) {
  await page.getByRole("button", { name: "Working file", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a working file" });
  await dialog.getByLabel("File name").fill(name);
  await dialog.getByLabel("File", { exact: true }).setInputFiles(uploadPath);
  await dialog.getByRole("button", { name: "Add file", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".file-card").filter({ hasText: name })).toBeVisible();
}

async function expectDownloadedBytes(page: Page, name: string) {
  const receiving = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download ${name}` }).click();
  const download = await receiving;
  expect(download.suggestedFilename()).toBe(`${name}.png`);
  expect(await download.failure()).toBeNull();
  expect(readFileSync(await download.path())).toEqual(uploadBytes);
}

test("agency and assigned designer upload durable working files; the client cannot read them", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const agencyName = `Acceptance agency working ${crypto.randomUUID().slice(0, 8)}`;
  const designerName = `Acceptance designer working ${crypto.randomUUID().slice(0, 8)}`;
  const filesUrl = `/clients/${fixture.clientId}/brand/files?project=${fixture.projectId}`;
  const designerContext = await browser.newContext();
  const clientContext = await browser.newContext();
  try {
    await signIn(page, credentials.agency);
    await page.goto(filesUrl);
    await uploadWorkingFile(page, agencyName);
    await page.reload();
    const filter = page.getByLabel("Filter project", { exact: true });
    await expect(filter).toHaveValue(fixture.projectId);
    await expect(page.locator(".file-card").filter({ hasText: agencyName })).toBeVisible();
    await expectDownloadedBytes(page, agencyName);

    const designerPage = await designerContext.newPage();
    await signIn(designerPage, credentials.designer);
    await designerPage.goto(filesUrl);
    await expect(designerPage.locator(".file-card").filter({ hasText: agencyName })).toBeVisible();
    await uploadWorkingFile(designerPage, designerName);
    await designerPage.reload();
    await expect(designerPage.getByLabel("Filter project", { exact: true })).toHaveValue(
      fixture.projectId,
    );
    await expect(
      designerPage.locator(".file-card").filter({ hasText: designerName }),
    ).toBeVisible();
    await expectDownloadedBytes(designerPage, designerName);

    await page.reload();
    await expect(page.locator(".file-card").filter({ hasText: designerName })).toBeVisible();
    const projectFiles = page.locator(".file-card");
    await expect(projectFiles).toHaveCount(2);
    await page.getByRole("button", { name: "Approved", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No matching files." })).toBeVisible();
    await page.getByRole("button", { name: "All files", exact: true }).click();
    await expect(projectFiles).toHaveCount(2);
    await filter.selectOption("");
    await filter.selectOption(fixture.projectId);
    await expect(projectFiles).toHaveCount(2);

    const recorded = await agency
      .from("project_assets")
      .select("name,storage_path,file_size")
      .eq("project_id", fixture.projectId);
    expect(recorded.error).toBeNull();
    expect(recorded.data?.map((file) => file.name).sort()).toEqual(
      [agencyName, designerName].sort(),
    );
    for (const file of recorded.data!) expect(file.file_size).toBe(uploadBytes.byteLength);

    const clientPage = await clientContext.newPage();
    await signIn(clientPage, credentials.client);
    await clientPage.goto(filesUrl);
    await expect(clientPage.getByRole("button", { name: "Working file" })).toHaveCount(0);
    await expect(clientPage.locator(".file-card").filter({ hasText: agencyName })).toHaveCount(0);
    await expect(clientPage.locator(".file-card").filter({ hasText: designerName })).toHaveCount(0);
    const client = await localCaller(credentials.client);
    const clientRows = await client
      .from("project_assets")
      .select("id")
      .eq("project_id", fixture.projectId);
    expect(clientRows.error).toBeNull();
    expect(clientRows.data).toEqual([]);
    const denied = await client.storage
      .from("internal-assets")
      .download(recorded.data![0].storage_path);
    expect(denied.error).not.toBeNull();
  } finally {
    await designerContext.close();
    await clientContext.close();
    await cleanupTestProject(fixture.projectId);
  }
});
