import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import { createPlaygroundFixture } from "./playground-fixture";
import { credentials, localAdmin, screenshotDirectory, signIn } from "./test-support";

test("brand folders persist, organize real files, and preserve files when deleted", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const fixture = await createPlaygroundFixture();
  const base = `/clients/${fixture.clientId}/brand`;
  const contexts = [];
  const path = page.getByRole("navigation", { name: "Folder path" });
  const folderTile = (name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });
  try {
    await signIn(page, credentials.agency);
    await page.goto(`${base}/templates`);
    await expect(page).toHaveURL(`${base}/assets`);
    await expect(
      page
        .getByRole("navigation", { name: "Brand sections" })
        .getByRole("link", { name: "Templates", exact: true }),
    ).toHaveCount(0);
    let lostResponse = false;
    await page.route("**/rest/v1/brand_asset_folders*", async (route) => {
      if (route.request().method() === "POST" && !lostResponse) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        lostResponse = true;
        await route.abort("failed");
      } else await route.continue();
    });
    for (const name of ["Photography", "Campaign launch"]) {
      await page.getByRole("button", { name: "New folder", exact: true }).click();
      await page.getByLabel("Folder name").fill(name);
      await page.getByRole("button", { name: "Save folder", exact: true }).click();
      if (name === "Photography") {
        await expect(
          page.getByRole("dialog", { name: "New folder", exact: true }).getByRole("alert"),
        ).toBeVisible();
        await page.getByRole("button", { name: "Save folder", exact: true }).click();
      }
      await expect(page.getByRole("dialog", { name: "New folder", exact: true })).toHaveCount(0);
      // A new folder opens, the way a file browser enters a folder it just made.
      await expect(path.locator('[aria-current="page"]')).toHaveText(name);
      await path.getByRole("button", { name: "Assets", exact: true }).click();
    }
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    await page.getByLabel("Folder name").fill("photography");
    await page.getByRole("button", { name: "Save folder", exact: true }).click();
    await expect(page.getByText("A folder with this name already exists here.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await folderTile("Campaign launch").click();
    await page.getByRole("button", { name: "Add asset", exact: true }).click();
    const upload = page.getByRole("dialog", { name: "Add a brand asset" });
    await expect(
      upload.getByRole("combobox", { name: "Folder", exact: true }).locator("option:checked"),
    ).toHaveText("Campaign launch");
    await upload
      .getByLabel("File", { exact: true })
      .setInputFiles(fileURLToPath(new URL("../../public/brand/logo.webp", import.meta.url)));
    await upload.getByLabel("Asset name", { exact: true }).fill("Approved campaign logo");
    await upload.getByRole("button", { name: "Add asset", exact: true }).click();
    await expect(upload).toHaveCount(0);
    await expect(page.locator(".brand-asset-card")).toHaveCount(1);
    const folders = await localAdmin
      .from("brand_asset_folders")
      .select("id,name")
      .eq("client_id", fixture.clientId);
    expect(folders.error).toBeNull();
    const photos = folders.data!.find((folder) => folder.name === "Photography")!;
    await page.locator(".brand-asset-card").click();
    const asset = page.getByRole("dialog", { name: "Approved campaign logo" });
    await asset.getByRole("combobox", { name: "Folder", exact: true }).selectOption(photos.id);
    await asset.getByRole("button", { name: "Move asset", exact: true }).click();
    await expect(asset.getByText("Asset moved.", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".brand-asset-card")).toHaveCount(0);
    await page.reload();
    await expect(folderTile("Photography")).toContainText("1 asset");
    await folderTile("Photography").click();
    await expect(page.locator(".brand-asset-card")).toHaveCount(1);
    // A search looks through every folder, then clearing it returns to the open folder.
    await page.getByLabel("Search brand assets").fill("missing");
    await expect(page.locator(".brand-asset-card")).toHaveCount(0);
    await page.getByLabel("Search brand assets").fill("campaign");
    await expect(page.locator(".brand-asset-card")).toHaveCount(1);
    await page.getByLabel("Search brand assets").fill("");
    await page.getByRole("button", { name: "Rename folder", exact: true }).click();
    await page.getByLabel("Folder name").fill("Approved photography");
    await page.getByRole("button", { name: "Save folder", exact: true }).click();
    await expect(path.locator('[aria-current="page"]')).toHaveText("Approved photography");
    for (const role of ["client", "designer"] as const) {
      const context = await browser.newContext();
      contexts.push(context);
      const viewer = await context.newPage();
      // The fixture's own client user: the shared demo login never joins a fixture client.
      await signIn(viewer, role === "client" ? fixture.client.email : credentials[role]);
      await viewer.goto(`${base}/assets`);
      await viewer.getByRole("button", { name: /^Approved photography/ }).click();
      await expect(viewer.locator(".brand-asset-card")).toHaveCount(1);
      // A client may add folders and images to its own Brand Hub; neither role organizes them.
      await expect(
        viewer.getByRole("button", { name: /^(New folder|Add image|Add link)$/ }),
      ).toHaveCount(role === "client" ? 3 : 0);
      await expect(
        viewer.getByRole("button", { name: /^(Add asset|Rename folder|Delete folder)$/ }),
      ).toHaveCount(0);
      await viewer.locator(".brand-asset-card").click();
      await expect(viewer.getByRole("button", { name: "Move asset", exact: true })).toHaveCount(0);
      const download = viewer.waitForEvent("download");
      await viewer.getByRole("button", { name: "Download file", exact: true }).click();
      expect(await (await download).failure()).toBeNull();
    }
    for (const [width, height] of [
      [1600, 1000],
      [1024, 700],
      [390, 844],
      [320, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(path).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <= innerWidth &&
              document.querySelector(".main-content")!.scrollWidth <=
                document.querySelector(".main-content")!.clientWidth,
          ),
        )
        .toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `${screenshotDirectory}/brand-folders-${width}.png` });
    }
    await page.getByRole("button", { name: "Delete folder", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Delete folder" })).toContainText(
      "No files will be deleted.",
    );
    await page
      .getByRole("dialog", { name: "Delete folder" })
      .getByRole("button", { name: "Delete folder", exact: true })
      .click();
    // Its asset moves up to the top level, where the path is no longer shown.
    await expect(path).toHaveCount(0);
    await expect(page.locator(".brand-asset-card")).toHaveCount(1);
    await page.locator(".brand-asset-card").click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download file", exact: true }).click();
    expect(await (await download).failure()).toBeNull();
  } finally {
    for (const context of contexts) await context.close();
    const assets = await localAdmin
      .from("brand_assets")
      .select("storage_path")
      .eq("client_id", fixture.clientId);
    expect(assets.error).toBeNull();
    const paths = assets.data!.flatMap((asset) => (asset.storage_path ? [asset.storage_path] : []));
    if (paths.length)
      expect((await localAdmin.storage.from("brand-assets").remove(paths)).error).toBeNull();
    expect(
      (await localAdmin.from("brand_assets").delete().eq("client_id", fixture.clientId)).error,
    ).toBeNull();
    expect(
      (await localAdmin.from("brand_asset_folders").delete().eq("client_id", fixture.clientId))
        .error,
    ).toBeNull();
    await fixture.cleanup();
  }
});
