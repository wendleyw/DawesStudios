import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { credentials, localAgency, signIn } from "./test-support";

test.use({ reducedMotion: "reduce" });

test("brand categories clear predictably and copied references preserve the selected resource", async ({
  page,
}) => {
  const agency = await localAgency();
  try {
    const client = await agency.from("clients").select("id").eq("slug", "sabre").single();
    expect(client.error).toBeNull();
    const asset = await agency
      .from("brand_assets")
      .select("id,name")
      .eq("client_id", client.data!.id)
      .eq("category", "Logo")
      .eq("mime_type", "image/svg+xml")
      .limit(1)
      .single();
    expect(asset.error).toBeNull();
    await page.context().addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Clipboard permission denied for acceptance verification.");
          },
        },
      }),
    );
    await signIn(page, credentials.agency);
    const base = "/clients/" + client.data!.id + "/brand/assets";
    await page.goto(base);
    await page.getByLabel("Search brand assets").fill(asset.data!.name);
    await page.getByLabel("Asset category").selectOption("Document");
    await expect(
      page.getByRole("heading", { name: "No matching assets.", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.getByLabel("Search brand assets")).toHaveValue("");
    await expect(page.getByLabel("Asset category")).toHaveValue("");
    await page.getByLabel("Asset category").selectOption("Logo");
    await expect
      .poll(async () => page.locator(".brand-asset-card .eyebrow").allTextContents())
      .toEqual(["Logo", "Logo", "Logo"]);
    await page
      .locator(".brand-asset-card")
      .filter({ has: page.getByRole("heading", { name: asset.data!.name, exact: true }) })
      .click();
    await page.getByRole("button", { name: "Copy reference", exact: true }).click();
    const reference = new URL(base + "?asset=" + asset.data!.id, page.url()).href;
    await expect(page.getByLabel("Text to copy", { exact: true })).toHaveValue(reference);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.goto(reference);
    await expect(page.getByRole("dialog", { name: asset.data!.name, exact: true })).toBeVisible();
  } finally {
    await agency.auth.signOut();
  }
});

test("logo library downloads actual PNG and PDF exports with usage guidance", async ({ page }) => {
  const agency = await localAgency();
  try {
    const client = await agency.from("clients").select("id").eq("slug", "sabre").single();
    expect(client.error).toBeNull();
    const files = await agency
      .from("brand_assets")
      .select("id,name,mime_type")
      .eq("client_id", client.data!.id)
      .eq("category", "Logo");
    expect(files.error).toBeNull();
    expect(files.data!.map((file) => file.mime_type)).toEqual(
      expect.arrayContaining(["image/svg+xml", "image/png", "application/pdf"]),
    );
    await signIn(page, credentials.agency);
    const base = "/clients/" + client.data!.id + "/brand";
    await page.goto(base + "/logos");
    await expect(page.getByRole("heading", { name: "Logo usage", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Approved variations", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Find logo files", exact: true }).click();
    await expect(page.getByLabel("Asset category")).toHaveValue("Logo");
    for (const mime of ["image/png", "application/pdf"]) {
      const file = files.data!.find((item) => item.mime_type === mime)!;
      await page
        .locator(".brand-asset-card")
        .filter({ has: page.getByRole("heading", { name: file.name, exact: true }) })
        .click();
      const dialog = page.getByRole("dialog", { name: file.name, exact: true });
      await expect(dialog).toBeVisible();
      if (mime === "application/pdf") {
        await expect(dialog.getByText("PDF document", { exact: true })).toBeVisible();
        await expect(dialog.locator("iframe,embed,object")).toHaveCount(0);
      }
      const receiving = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Download file", exact: true }).click();
      const download = await receiving;
      expect(await download.failure()).toBeNull();
      const path = await download.path();
      expect(path).not.toBeNull();
      const bytes = readFileSync(path!);
      expect(bytes.length).toBeGreaterThan(50);
      if (mime === "image/png")
        expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      else expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      await page.keyboard.press("Escape");
    }
  } finally {
    await agency.auth.signOut();
  }
});
