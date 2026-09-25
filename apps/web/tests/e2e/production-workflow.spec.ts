import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  credentials,
  localAdmin,
  localAgency,
  localCaller,
  screenshotDirectory,
  signIn,
} from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

const preview = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
async function addVersion(page: Page) {
  await page.getByRole("button", { name: "New version for Campaign square" }).click();
  await page.getByRole("textbox", { name: "Version note" }).fill("Develop the campaign direction.");
  await page.getByRole("button", { name: "Create version", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function addDesign(page: Page, name: string) {
  await page.getByRole("button", { name: "Add design to version 1" }).click();
  await page.getByRole("textbox", { name: "Design name" }).fill(name);
  await page.getByLabel("Design file").setInputFiles(preview);
  await page.getByRole("dialog").getByRole("button", { name: "Add design", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function sharedDesigns(projectId: string) {
  const { data, error } = await localAdmin
    .from("published_designs")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order");
  expect(error).toBeNull();
  return data!;
}

test("production, private feedback, immutable client revisions, approval and real delivery", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [studio, designer, client] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const errors: string[] = [];
  for (const page of [studio, designer, client])
    page.on("pageerror", (error) => errors.push(error.message));
  try {
    await signIn(studio, credentials.agency);
    await signIn(designer, credentials.designer);
    await signIn(client, credentials.client);
    await client.goto(`/projects/${fixture.projectId}`);
    await expect(
      client.getByText("Your studio will share designs here when they’re ready."),
    ).toBeVisible();
    await designer.goto(`/projects/${fixture.projectId}`);
    await addVersion(designer);
    await addDesign(designer, "Campaign direction A");
    await addDesign(designer, "Campaign direction B");
    await designer.getByRole("button", { name: "Open Campaign direction A" }).click();
    await designer
      .getByRole("textbox", { name: "Your message" })
      .fill("Unsent internal draft stays with direction A.");
    await designer.getByRole("button", { name: "Next design" }).click();
    await expect(designer.getByRole("textbox", { name: "Your message" })).toBeEmpty();
    await designer.getByRole("button", { name: "Previous design" }).click();
    await expect(designer.getByRole("textbox", { name: "Your message" })).toHaveValue(
      "Unsent internal draft stays with direction A.",
    );
    await designer.getByRole("button", { name: "Add pin", exact: true }).click();
    await designer.locator(".artwork-stage").click({ position: { x: 95, y: 110 } });
    await designer
      .getByRole("textbox", { name: "Your message" })
      .fill("Internal note: refine the composition before sharing.");
    await designer.getByRole("button", { name: "Send message" }).click();
    await expect(
      designer.getByText("Internal note: refine the composition before sharing.", { exact: true }),
    ).toBeVisible();
    await designer.getByRole("button", { name: "All designs", exact: true }).click();
    await designer.getByRole("button", { name: "Send to studio", exact: true }).click();
    await designer
      .getByRole("dialog")
      .getByRole("button", { name: "Send to studio", exact: true })
      .click();
    await expect(designer.getByRole("dialog")).toHaveCount(0);
    await client.reload();
    await expect(client.locator(".design-preview")).toHaveCount(0);
    await expect(
      client.getByText("Internal note: refine the composition before sharing."),
    ).toHaveCount(0);
    await studio.goto(`/projects/${fixture.projectId}`);
    await studio.getByRole("button", { name: "Share with client", exact: true }).click();
    await studio
      .getByRole("textbox", { name: "A note for the client" })
      .fill("Two directions for your review.");
    await studio.getByRole("button", { name: "Share version", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    await expect(client.locator(".design-preview")).toHaveCount(2);
    const original = await sharedDesigns(fixture.projectId);
    expect(original).toHaveLength(2);
    const beforeBlob = await localAdmin.storage
      .from("published-assets")
      .download(original[0].asset_path!);
    expect(beforeBlob.error).toBeNull();
    const beforeHash = createHash("sha256")
      .update(Buffer.from(await beforeBlob.data!.arrayBuffer()))
      .digest("hex");
    await studio.getByRole("button", { name: "Open Campaign direction A" }).click();
    await studio.getByRole("button", { name: "Edit working design", exact: true }).click();
    await studio.getByRole("textbox", { name: "Design name" }).fill("Private refinement A");
    await studio.getByRole("button", { name: "Save working design", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    expect(await sharedDesigns(fixture.projectId)).toEqual(original);
    const afterBlob = await localAdmin.storage
      .from("published-assets")
      .download(original[0].asset_path!);
    expect(
      createHash("sha256")
        .update(Buffer.from(await afterBlob.data!.arrayBuffer()))
        .digest("hex"),
    ).toBe(beforeHash);
    await client.getByRole("button", { name: "Open Campaign direction A" }).click();
    await client.getByRole("button", { name: "Add pin", exact: true }).click();
    await client.locator(".artwork-stage").click({ position: { x: 150, y: 150 } });
    await client
      .getByRole("textbox", { name: "Your message" })
      .fill("Could we give the headline more breathing room?");
    await client.getByRole("button", { name: "Send message" }).click();
    await expect(
      client.getByText("Could we give the headline more breathing room?", { exact: true }),
    ).toBeVisible();
    await client.screenshot({ path: `${screenshotDirectory}/client-pinned-feedback.png` });
    await client.getByRole("button", { name: "All designs", exact: true }).click();
    await client.getByRole("button", { name: "Review version", exact: true }).click();
    await client.getByLabel("Your decision").selectOption("changes_requested");
    await client
      .getByRole("textbox", { name: "Feedback", exact: true })
      .fill("Please increase the headline spacing.");
    await client.getByRole("button", { name: "Send review", exact: true }).click();
    await expect(client.getByRole("dialog")).toHaveCount(0);
    await expect(client.locator(".project-heading .status-badge")).toHaveText("Changes requested");
    await studio.getByRole("button", { name: "All designs", exact: true }).click();
    await addVersion(studio);
    await expect(studio.locator(".version-card")).toHaveCount(2);
    await studio
      .locator(".version-card")
      .filter({ has: studio.getByText("V2", { exact: true }) })
      .getByRole("button", { name: "Share with client", exact: true })
      .click();
    await studio
      .getByRole("textbox", { name: "A note for the client" })
      .fill("Spacing revised. The original review remains available.");
    await studio.getByRole("button", { name: "Share version", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    await expect(client.locator(".version-card")).toHaveCount(2);
    const latestCard = client
      .locator(".version-card")
      .filter({ has: client.getByText("V2", { exact: true }) });
    await latestCard.getByRole("button", { name: "Review version", exact: true }).click();
    await client
      .getByRole("textbox", { name: "Feedback", exact: true })
      .fill("Approved. Ready for delivery.");
    await client.getByRole("button", { name: "Send review", exact: true }).click();
    await expect(client.locator(".project-heading .status-badge")).toHaveText("Approved");
    await studio.goto(`/clients/${fixture.clientId}/assets?project=${fixture.projectId}`);
    await studio.getByRole("button", { name: "Delivery file", exact: true }).click();
    await studio.getByLabel("File name", { exact: true }).fill("Approved campaign final");
    await studio.getByLabel("File", { exact: true }).setInputFiles(preview);
    await studio.getByRole("button", { name: "Add file", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    await expect(
      studio.getByRole("heading", { name: "Approved campaign final.png" }),
    ).toBeVisible();
    await studio.getByRole("button", { name: "Complete delivery", exact: true }).click();
    await studio
      .getByRole("dialog")
      .getByRole("button", { name: "Complete delivery", exact: true })
      .click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    await client.goto(`/clients/${fixture.clientId}/assets?project=${fixture.projectId}`);
    const downloadPromise = client.waitForEvent("download");
    await client.getByRole("button", { name: "Download Approved campaign final.png" }).click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe("Approved campaign final.png");
    const clientApi = await localCaller(credentials.client);
    expect(
      (await clientApi.from("internal_comments").select("*").eq("project_id", fixture.projectId))
        .data,
    ).toEqual([]);
    const delivered = (
      await clientApi
        .from("projects")
        .select("status,delivered_at")
        .eq("id", fixture.projectId)
        .single()
    ).data;
    expect(delivered?.status).toBe("delivered");
    // `mark_project_delivered` stamps the delivery instant for the dashboards.
    expect(Date.now() - new Date(delivered!.delivered_at!).getTime()).toBeLessThan(10 * 60_000);
    expect(
      (await localAdmin.from("client_comments").select("*").eq("project_id", fixture.projectId))
        .data,
    ).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await cleanupTestProject(fixture.projectId);
  }
});
