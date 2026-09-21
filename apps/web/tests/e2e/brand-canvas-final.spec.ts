import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { credentials, localAgency, screenshotDirectory, signIn } from "./test-support";

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

async function assertPinAlignment(page: Page, pin: Locator, x: number, y: number) {
  await expect
    .poll(
      async () => {
        const stage = await page.locator(".artwork-stage").boundingBox();
        const marker = await pin.boundingBox();
        if (!stage || !marker || stage.width <= 0 || stage.height <= 0) return 1;
        return Math.max(
          Math.abs((marker.x + marker.width / 2 - stage.x) / stage.width - x),
          Math.abs((marker.y + marker.height / 2 - stage.y) / stage.height - y),
        );
      },
      { message: "The rendered pin center must match its persisted normalized artwork coordinate" },
    )
    .toBeLessThan(0.005);
}

test("published pin coordinates stay aligned through zoom and responsive sidebar changes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  try {
    const pinned = await agency
      .from("client_comments")
      .select("id,body,project_id,publication_id,design_id,pin_x,pin_y")
      .eq("resolved", false)
      .not("pin_x", "is", null)
      .not("pin_y", "is", null)
      .not("design_id", "is", null)
      .order("id")
      .limit(1)
      .single();
    expect(pinned.error).toBeNull();
    const comment = pinned.data!;
    const design = await agency
      .from("published_designs")
      .select("title")
      .eq("id", comment.design_id!)
      .single();
    expect(design.error).toBeNull();
    await signIn(page, credentials.agency);
    await page.goto("/projects/" + comment.project_id + "?channel=client");
    const card = page.locator('.react-flow__node[data-id="' + comment.publication_id + '"]');
    await card.getByRole("button", { name: "Open " + design.data!.title, exact: true }).click();
    const bodyPrefix = comment.body.slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pin = page.getByRole("button", {
      name: new RegExp("^View pin \\d+: " + bodyPrefix + "$"),
    });
    await expect(pin).toBeVisible();
    await assertPinAlignment(page, pin, comment.pin_x!, comment.pin_y!);
    const controls = page.locator(".design-viewport .react-flow__controls");
    const beforeZoom = (await page.locator(".artwork-stage").boundingBox())!.width;
    await controls.getByRole("button", { name: "Zoom In", exact: true }).click();
    await expect
      .poll(async () => (await page.locator(".artwork-stage").boundingBox())!.width)
      .toBeGreaterThan(beforeZoom + 1);
    await assertPinAlignment(page, pin, comment.pin_x!, comment.pin_y!);
    await controls.getByRole("button", { name: "Zoom Out", exact: true }).click();
    await assertPinAlignment(page, pin, comment.pin_x!, comment.pin_y!);
    const beforeSidebar = (await page.locator(".design-viewport").boundingBox())!.width;
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await expect
      .poll(async () => (await page.locator(".design-viewport").boundingBox())!.width)
      .toBeGreaterThan(beforeSidebar + 100);
    await assertPinAlignment(page, pin, comment.pin_x!, comment.pin_y!);
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    for (const width of [1600, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await controls.getByRole("button", { name: "Fit View", exact: true }).click();
      await assertPinAlignment(page, pin, comment.pin_x!, comment.pin_y!);
      await pin.click();
      await expect(page.locator('[data-comment-id="' + comment.id + '"]')).toHaveClass(/selected/);
      await page.screenshot({
        path: screenshotDirectory + "/design-persisted-pin-alignment-" + width + ".png",
        fullPage: true,
      });
    }
  } finally {
    await agency.auth.signOut();
  }
});
