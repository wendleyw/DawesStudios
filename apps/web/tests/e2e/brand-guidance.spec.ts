import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";
import { cleanupIntakeFixture, createIntakeFixture } from "./intake-fixture";

test.use({ reducedMotion: "reduce" });

test("agency guidance persists, reusable formats copy safely, and clients cannot edit canonical content", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const fixture = await createIntakeFixture();
  const agency = await localAgency();
  const base = "/clients/" + fixture.clientId + "/brand";
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
  try {
    await signIn(page, credentials.agency);
    const edits = [
      {
        section: "overview",
        title: "overview",
        fields: {
          "Brand name": "Acceptance Brand",
          Tagline: "Clear by design",
          "About the brand": "A distinctive independent studio.",
          Audience: "Careful creative teams",
          "Tone of voice — one trait per line": "Direct\nWarm",
          "Brand principles — one per line": "Keep the meaning clear",
        },
      },
      {
        section: "logos",
        title: "logos",
        fields: {
          "Logo usage guidance": "Use the approved logo with clear space.",
          "Approved variants — one per line": "Primary\nCompact",
        },
      },
      {
        section: "typography",
        title: "typography",
        fields: {
          "Heading font": "Inter",
          "Body font": "Arial",
          "Heading font source URL": "https://fonts.google.com/specimen/Inter",
          "Body font source URL": "https://learn.microsoft.com/en-us/typography/font-list/arial",
          "Type sizes in pixels, separated by commas": "14, 20, 32",
        },
      },
      {
        section: "visual-style",
        title: "visual style",
        fields: {
          "Visual principles — one per line": "Natural texture",
          "Photography direction": "Soft daylight",
          "Use — one direction per line": "Simple compositions",
          "Avoid — one direction per line": "Busy backgrounds",
        },
      },
      {
        section: "messaging",
        title: "messaging",
        fields: {
          "Primary headline": "Make room for thoughtful work",
          "Supporting message": "A clear process from idea to delivery.",
          "Call to action": "Explore the collection",
          "Preferred terminology — one term per line": "Studio\nCreative team",
          "Messaging rules — one per line": "Use concrete language",
        },
      },
      {
        section: "ai",
        title: "brand context",
        fields: {
          "Reusable brand instructions": "Keep every output consistent with approved guidance.",
          "Use — one instruction per line": "Plain language",
          "Never — one instruction per line": "Invent unsupported claims",
        },
      },
    ];
    for (const edit of edits) {
      await page.goto(base + "/" + edit.section);
      await page.getByRole("button", { name: "Edit " + edit.title, exact: true }).click();
      for (const [label, value] of Object.entries(edit.fields))
        await page.getByLabel(label, { exact: true }).fill(value!);
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await page.reload();
      await page.getByRole("button", { name: "Edit " + edit.title, exact: true }).click();
      for (const [label, value] of Object.entries(edit.fields))
        await expect(page.getByLabel(label, { exact: true })).toHaveValue(value!);
      await page.keyboard.press("Escape");
    }
    await page.goto(base + "/typography");
    await expect(
      page.getByRole("link", { name: "Headings font source", exact: true }),
    ).toHaveAttribute("href", "https://fonts.google.com/specimen/Inter");
    await page.getByLabel("Try a few words").fill("Readable custom sample");
    await expect(page.locator(".brand-type-heading")).toHaveText("Readable custom sample");
    await expect(page.locator(".brand-type-body")).toHaveText("Readable custom sample");
    await page.goto(base + "/colors");
    await page.getByRole("button", { name: "Edit colors", exact: true }).click();
    await page.getByRole("button", { name: "Add color", exact: true }).click();
    await page.getByLabel("Color name", { exact: true }).fill("Paper Warm");
    await page.getByLabel("HEX value", { exact: true }).fill("#abc");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    for (const [format, output] of [
      ["hex", "#AABBCC"],
      ["rgb", "rgb(170, 187, 204)"],
      ["css", "--brand-paper-warm: #AABBCC;"],
      ["tailwind", "bg-[#AABBCC] text-[#AABBCC] border-[#AABBCC]"],
    ]) {
      await page.getByLabel("Copy format", { exact: true }).selectOption(format);
      await page.getByRole("button", { name: "Copy Paper Warm", exact: true }).click();
      await expect(page.getByLabel("Text to copy", { exact: true })).toHaveValue(output);
      await page.getByRole("button", { name: "Done", exact: true }).click();
    }
    await page.goto(base + "/ai");
    await page.getByRole("button", { name: "Copy brand context", exact: true }).click();
    const context = page.getByLabel("Text to copy", { exact: true });
    await expect(context).toHaveValue(/Use:/);
    await expect(context).toHaveValue(/Plain language/);
    await expect(context).toHaveValue(/Never:[\s\S]*Invent unsupported claims/);
    await expect(context).toHaveValue(/Terminology:[\s\S]*Creative team/);
    await page.keyboard.press("Escape");
    await page.goto(base + "/products");
    await page.getByRole("button", { name: "Edit products", exact: true }).click();
    for (let index = 0; index < 3; index++) {
      await page.getByRole("button", { name: "Add product", exact: true }).click();
      await page
        .getByLabel("Product name", { exact: true })
        .nth(index)
        .fill("Product " + (index + 1));
      await page
        .getByLabel("Specifications", { exact: true })
        .nth(index)
        .fill("Specification " + (index + 1));
      await page
        .getByLabel("Usage guidance", { exact: true })
        .nth(index)
        .fill("Rule " + (index + 1));
    }
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    // Only "Product 1" gets a matching brand asset, so its reference link should render with the
    // correctly-encoded filtered search, while "Product 2" and "Product 3" — with nothing to link
    // to — should render no link at all. That proves both halves of the filtered-link behaviour
    // fixed by defect G-1 (54645f1): a real match still resolves, and an empty result is omitted.
    const matchingAsset = await localAdmin.from("brand_assets").insert({
      client_id: fixture.clientId,
      name: "Product 1 field kit",
      category: "Reference",
    });
    expect(matchingAsset.error).toBeNull();
    await page.reload();
    const productWithMatch = page.locator(".brand-product").nth(0);
    await expect(productWithMatch).toContainText("Product 1");
    await expect(productWithMatch).toContainText("Specification 1");
    await expect(productWithMatch.getByRole("link")).toHaveAttribute(
      "href",
      base + "/assets?search=Product%201",
    );
    for (let index = 1; index < 3; index++) {
      const product = page.locator(".brand-product").nth(index);
      await expect(product).toContainText("Product " + (index + 1));
      await expect(product).toContainText("Specification " + (index + 1));
      await expect(product.getByRole("link")).toHaveCount(0);
    }
    const client = await localCaller(fixture.email);
    try {
      const changed = await client
        .from("brand_sections")
        .update({ content: { name: "Unauthorized change" } })
        .eq("client_id", fixture.clientId)
        .eq("section", "overview")
        .select("section");
      expect(changed.error).toBeNull();
      expect(changed.data).toEqual([]);
    } finally {
      await client.auth.signOut();
    }
    const clientContext = await browser.newContext();
    try {
      const clientPage = await clientContext.newPage();
      await signIn(clientPage, fixture.email);
      for (const section of [
        "overview",
        "logos",
        "colors",
        "typography",
        "visual-style",
        "products",
        "assets",
        "messaging",
        "ai",
      ]) {
        await clientPage.goto(base + "/" + section);
        await expect(
          clientPage.getByRole("heading", { name: "Brand Hub", exact: true }),
        ).toBeVisible();
        await expect(clientPage.getByRole("button", { name: /^Edit / })).toHaveCount(0);
      }
    } finally {
      await clientContext.close();
    }
    const designer = await localCaller(credentials.designer);
    try {
      const sabre = await agency.from("clients").select("id").eq("slug", "sabre").single();
      expect(sabre.error).toBeNull();
      const allowed = await designer
        .from("brand_sections")
        .select("section")
        .eq("client_id", sabre.data!.id);
      expect(allowed.error).toBeNull();
      expect(allowed.data!.length).toBeGreaterThan(0);
      const changed = await designer
        .from("brand_sections")
        .update({ content: { name: "Unauthorized designer change" } })
        .eq("client_id", sabre.data!.id)
        .eq("section", "overview")
        .select("section");
      expect(changed.error).toBeNull();
      expect(changed.data).toEqual([]);
    } finally {
      await designer.auth.signOut();
    }
  } finally {
    await cleanupIntakeFixture(fixture);
    await agency.auth.signOut();
  }
});

test("failed brand registration retries one file and cancellation removes only its orphan", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const fixture = await createIntakeFixture();
  const agency = await localAgency();
  const paths: string[] = [];
  let rejectNext = true;
  await page.route(
    (url) => url.pathname === "/rest/v1/brand_assets",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const payload = route.request().postDataJSON() as { storage_path: string };
      paths.push(payload.storage_path);
      if (rejectNext) {
        rejectNext = false;
        return route.fulfill({
          status: 503,
          json: { message: "Registration temporarily unavailable." },
        });
      }
      return route.continue();
    },
  );
  try {
    await signIn(page, credentials.agency);
    await page.goto("/clients/" + fixture.clientId + "/brand/assets");
    for (const name of ["Retry resource", "Abandoned resource"]) {
      rejectNext = true;
      await page.getByRole("button", { name: "Add asset", exact: true }).click();
      await page
        .getByLabel("File", { exact: true })
        .setInputFiles(fileURLToPath(new URL("../../public/brand/logo.webp", import.meta.url)));
      await page.getByLabel("Asset name", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Add asset", exact: true }).last().click();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
        "Registration temporarily unavailable.",
      );
      await expect(page.getByLabel("File", { exact: true })).toBeDisabled();
      if (name === "Retry resource") {
        await page.getByRole("button", { name: "Add asset", exact: true }).last().click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        expect(paths).toHaveLength(2);
        expect(paths[0]).toBe(paths[1]);
        await expect(page.locator(".brand-asset-card")).toHaveCount(1);
      } else {
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        const orphan = await agency.storage
          .from("brand-assets")
          .list(fixture.clientId, { search: paths.at(-1)!.split("/").at(-1)! });
        expect(orphan.error).toBeNull();
        expect(orphan.data).toEqual([]);
        await expect(page.locator(".brand-asset-card")).toHaveCount(1);
      }
    }
  } finally {
    expect(
      (await agency.from("brand_assets").delete().eq("client_id", fixture.clientId)).error,
    ).toBeNull();
    if (paths.length)
      expect(
        (await agency.storage.from("brand-assets").remove([...new Set(paths)])).error,
      ).toBeNull();
    await cleanupIntakeFixture(fixture);
    await agency.auth.signOut();
  }
});

test("legacy drafts retain their private editor without creating production or credit records", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await createIntakeFixture();
  const agency = await localAgency();
  const base = "/clients/" + fixture.clientId + "/brand";
  const templates = [
    { name: "Instagram Post", category: "Social", width: 1080, height: 1080 },
    { name: "Website Hero", category: "Web", width: 1920, height: 1080 },
    { name: "Amazon Gallery", category: "Commerce", width: 2000, height: 2000 },
    { name: "Presentation", category: "Presentation", width: 1920, height: 1080 },
    { name: "Email Header", category: "Email", width: 1200, height: 600 },
    { name: "Print Flyer", category: "Print", width: 1240, height: 1754 },
    { name: "Product Card", category: "Commerce", width: 1200, height: 1500 },
  ];
  try {
    const inserted = await agency.from("brand_templates").insert(
      templates.map((template) => ({
        ...template,
        client_id: fixture.clientId,
        content: {
          headline: "A shared starting point",
          cta: "Explore",
          background: "#FFFFFF",
          foreground: "#191919",
          accent: "#D4DCB4",
          layout: "editorial",
        },
      })),
    );
    expect(inserted.error).toBeNull();
    const beforeCredits = await agency
      .from("credit_ledger")
      .select("id")
      .eq("client_id", fixture.clientId);
    expect(beforeCredits.error).toBeNull();
    await signIn(page, credentials.agency);
    for (const template of templates) {
      const source = await agency
        .from("brand_templates")
        .select("id,content")
        .eq("client_id", fixture.clientId)
        .eq("name", template.name)
        .single();
      expect(source.error).toBeNull();
      const owner = await agency.auth.getUser();
      const draft = await agency
        .from("template_drafts")
        .insert({
          client_id: fixture.clientId,
          template_id: source.data!.id,
          owner_id: owner.data.user!.id,
          name: template.name,
          content: source.data!.content,
        })
        .select("id")
        .single();
      expect(draft.error).toBeNull();
      await page.goto(base + "/drafts/" + draft.data!.id);
      await page.getByLabel("Call to action", { exact: true }).fill("Discover " + template.name);
      await page.getByLabel("Headline", { exact: true }).fill("Edited " + template.name);
      await page.getByLabel("Preview zoom", { exact: true }).selectOption("125");
      await expect(page.locator(".brand-preview-sheet")).toHaveAttribute("style", /125%/);
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.getByText("Saved to your drafts", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Call to action", { exact: true })).toHaveValue(
        "Discover " + template.name,
      );
      await expect(page.locator(".brand-art-cta")).toHaveText("Discover " + template.name);
    }
    await page.goto(base + "/templates");
    await expect(page).toHaveURL(base + "/assets");
    await expect(
      page
        .getByRole("navigation", { name: "Brand sections" })
        .getByRole("link", { name: "Templates", exact: true }),
    ).toHaveCount(0);
    const projects = await agency.from("projects").select("id").eq("client_id", fixture.clientId);
    const afterCredits = await agency
      .from("credit_ledger")
      .select("id")
      .eq("client_id", fixture.clientId);
    expect(projects.error).toBeNull();
    expect(projects.data).toEqual([]);
    expect(afterCredits.error).toBeNull();
    expect(afterCredits.data).toEqual(beforeCredits.data);
  } finally {
    await cleanupIntakeFixture(fixture);
    await agency.auth.signOut();
  }
});
