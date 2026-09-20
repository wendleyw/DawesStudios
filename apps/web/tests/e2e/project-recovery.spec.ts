import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

const artwork = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));

test("failed design registration preserves input, retries one file, and removes abandoned uploads", async ({
  page,
}) => {
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.designer);
    await page.goto(`/projects/${fixture.projectId}`);
    await page.getByRole("button", { name: "New version for Campaign square" }).click();
    await page.getByLabel("Version note").fill("Verify recoverable file registration.");
    await page.getByRole("button", { name: "Create version", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const objects = async () => {
      const result = await localAdmin.storage.from("internal-assets").list(fixture.projectId);
      expect(result.error).toBeNull();
      return result.data!;
    };
    const register = "**/rest/v1/rpc/add_design";
    await page.route(register, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary registration failure. Try again." }),
      }),
    );
    await page.getByRole("button", { name: "Add design to version 1" }).click();
    await page.getByLabel("Design name").fill("Retry-safe artwork");
    await page.getByLabel("Artwork file").setInputFiles(artwork);
    await page.getByRole("dialog").getByRole("button", { name: "Add design", exact: true }).click();
    await expect(page.locator("main [role=alert]")).toHaveText(
      "Temporary registration failure. Try again.",
    );
    await expect(page.getByLabel("Design name")).toHaveValue("Retry-safe artwork");
    await expect(page.getByLabel("Artwork file")).toBeDisabled();
    expect(await objects()).toHaveLength(1);
    expect(
      (await agency.from("designs").select("id").eq("project_id", fixture.projectId)).data,
    ).toHaveLength(0);
    await page.unroute(register);
    await page.getByRole("dialog").getByRole("button", { name: "Add design", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await objects()).toHaveLength(1);
    expect(
      (await agency.from("designs").select("id").eq("project_id", fixture.projectId)).data,
    ).toHaveLength(1);
    await page.route(register, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary registration failure. Try again." }),
      }),
    );
    await page.getByRole("button", { name: "Add design to version 1" }).click();
    await page.getByLabel("Design name").fill("Abandoned artwork");
    await page.getByLabel("Artwork file").setInputFiles(artwork);
    await page.getByRole("dialog").getByRole("button", { name: "Add design", exact: true }).click();
    await expect(page.locator("main [role=alert]")).toBeVisible();
    expect(await objects()).toHaveLength(2);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await objects()).toHaveLength(1);
    await page.unroute(register);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Open Retry-safe artwork", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Abandoned artwork", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Open Retry-safe artwork", exact: true }).click();
    await page.getByRole("button", { name: "Edit working design", exact: true }).click();
    await page.getByLabel("Design name").fill("A stale file edit");
    const design = (
      await agency.from("designs").select("id").eq("project_id", fixture.projectId).single()
    ).data!;
    const competing = await agency
      .from("designs")
      .update({ internal_asset_path: null })
      .eq("id", design.id);
    expect(competing.error).toBeNull();
    await page.getByRole("button", { name: "Save working design", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "changed while you were editing",
    );
    expect(
      (
        await agency
          .from("designs")
          .select("title,internal_asset_path")
          .eq("id", design.id)
          .single()
      ).data,
    ).toEqual({ title: "Retry-safe artwork", internal_asset_path: null });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.goto(`/projects/${crypto.randomUUID()}`);
    await expect(page.getByRole("heading", { name: "Project unavailable." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to your work" })).toBeVisible();
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});
