import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import {
  credentials,
  localAgency,
  screenshotDirectory,
  sectionLabels,
  signIn,
} from "./test-support";

test.use({ reducedMotion: "reduce" });

async function openBrand(page: Page) {
  await signIn(page, credentials.agency);
  const board = await page
    .locator(".workspace-card")
    .filter({ hasText: "SABRE" })
    .getAttribute("href");
  if (!board) throw new Error("The SABRE workspace is unavailable.");
  return board.replace(/\/board$/, "/brand");
}

async function verifySurface(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    name + " should fit its viewport",
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations, name + " should pass axe").toEqual(
    [],
  );
  await page.screenshot({ path: screenshotDirectory + "/brand-" + name + ".png", fullPage: true });
}

test("brand sections remain accessible across desktop, tablet, and narrow mobile layouts", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const base = await openBrand(page);
  for (const [width, height] of [
    [1600, 1000],
    [1024, 768],
    [1000, 800],
    [768, 1024],
    [390, 844],
    [320, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + "/overview");
    await expect(page.getByRole("heading", { name: "Brand Hub", exact: true })).toBeVisible();
    await verifySurface(page, "overview-" + width);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const section of [
    "logos",
    "colors",
    "typography",
    "visual-style",
    "assets",
    "messaging",
    "ai",
  ]) {
    // The sections are a row of links rather than a select, so a section is opened the way a viewer
    // opens it and the row itself reports which one is current.
    const sections = page.getByRole("navigation", { name: "Brand sections" });
    await sections.getByRole("link", { name: sectionLabels[section], exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/brand/" + section + "$"));
    await expect(sections.locator('[aria-current="page"]')).toHaveText(sectionLabels[section]);
    if (section === "assets")
      await expect(page.getByRole("button", { name: "Add files", exact: true })).toBeVisible();
    await verifySurface(page, section + "-desktop");
  }
});

test("mobile navigation and shared dialogs contain keyboard focus and restore their trigger", async ({
  page,
}) => {
  const base = await openBrand(page);
  await page.goto(base + "/overview");
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
  await trigger.click();
  const navigation = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(navigation).toBeVisible();
  expect(
    await page.locator(".workspace").evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
  expect(await navigation.evaluate((element) => element.contains(document.activeElement))).toBe(
    true,
  );
  for (let index = 0; index < 24; index++) {
    await page.keyboard.press("Tab");
    expect(await navigation.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
  }
  await verifySurface(page, "navigation-mobile");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  // Global Search was removed on 2026-09-24; "Overview" is the agency's own main-navigation link
  // and exercises the same following-a-link-closes-the-drawer behavior. Scoped to the drawer
  // itself, since the client workspace behind it reuses the same "Overview" name.
  await navigation.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  expect(
    await page.locator(".workspace").evaluate((element) => (element as HTMLElement).inert),
  ).toBe(false);
  await page.goto(base + "/overview");
  const edit = page.getByRole("button", { name: "Edit overview", exact: true });
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit overview", exact: true });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press(index % 2 ? "Tab" : "Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await verifySurface(page, "edit-dialog-mobile");
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
});

test("personal drafts persist privately and brand assets upload, filter, and download real bytes", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const agency = await localAgency();
  const base = await openBrand(page);
  const clientId = base.split("/")[2];
  const name = "Acceptance brand " + crypto.randomUUID();
  const droppedName = name.replaceAll("-", " ");
  let draftId: string | undefined;
  try {
    const template = await agency
      .from("brand_templates")
      .select("id,content")
      .eq("client_id", clientId)
      .limit(1)
      .single();
    expect(template.error).toBeNull();
    const owner = await agency.auth.getUser();
    const draft = await agency
      .from("template_drafts")
      .insert({
        client_id: clientId,
        template_id: template.data!.id,
        owner_id: owner.data.user!.id,
        name,
        content: template.data!.content,
      })
      .select("id")
      .single();
    expect(draft.error).toBeNull();
    draftId = draft.data!.id;
    await page.goto(base + "/drafts/" + draftId);
    await page.getByLabel("Draft name", { exact: true }).fill(name);
    await page.getByLabel("Headline", { exact: true }).fill("A persistent private exploration.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Saved to your drafts", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Headline", { exact: true })).toHaveValue(
      "A persistent private exploration.",
    );
    await verifySurface(page, "draft-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await verifySurface(page, "draft-mobile");
    await page.goto(base + "/assets");
    await page.getByLabel("Add files", { exact: true }).setInputFiles({
      name: name + ".webp",
      mimeType: "image/webp",
      buffer: readFileSync(fileURLToPath(new URL("../../public/brand/logo.webp", import.meta.url))),
    });
    await expect(page.locator(".brand-upload-queue")).toContainText("1 file added.");
    // A dropped file is named after itself (separators read as spaces); the dialog renames it.
    await page.getByLabel("Search brand assets").fill(droppedName);
    await expect(page.locator(".brand-asset-card")).toHaveCount(1);
    await page.locator(".brand-asset-card").click();
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    await page.getByLabel("Asset name", { exact: true }).fill(name);
    await page
      .getByLabel("Description", { exact: true })
      .fill("Temporary isolated acceptance asset; removed after verification.");
    await page.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeVisible();
    const receiving = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download file", exact: true }).click();
    const download = await receiving;
    expect(await download.failure()).toBeNull();
    await verifySurface(page, "asset-dialog-mobile");
    const clientContext = await browser.newContext();
    try {
      const clientPage = await clientContext.newPage();
      await signIn(clientPage, credentials.client);
      await clientPage.goto(base + "/overview");
      await expect(
        clientPage.getByRole("heading", { name: "Brand Hub", exact: true }),
      ).toBeVisible();
      await expect(
        clientPage.getByRole("button", { name: "Edit overview", exact: true }),
      ).toHaveCount(0);
      await clientPage.goto(base + "/drafts/" + draftId);
      await expect(
        clientPage.getByRole("heading", { name: "This draft is unavailable.", exact: true }),
      ).toBeVisible();
    } finally {
      await clientContext.close();
    }
  } finally {
    if (draftId)
      expect((await agency.from("template_drafts").delete().eq("id", draftId)).error).toBeNull();
    const assets = await agency
      .from("brand_assets")
      .select("id,storage_path")
      .eq("client_id", clientId)
      .in("name", [name, droppedName]);
    expect(assets.error).toBeNull();
    for (const asset of assets.data ?? []) {
      expect((await agency.from("brand_assets").delete().eq("id", asset.id)).error).toBeNull();
      if (asset.storage_path)
        expect(
          (await agency.storage.from("brand-assets").remove([asset.storage_path])).error,
        ).toBeNull();
    }
    await agency.auth.signOut();
  }
});
