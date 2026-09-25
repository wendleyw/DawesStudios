import { test, expect } from "@playwright/test";
import {
  signIn,
  screenshotDirectory,
  preserveBoardPreference,
  credentials,
  localAgency,
} from "./test-support";

let restoreViews: (() => Promise<void>)[] = [];
test.beforeEach(async () => {
  const agency = await localAgency();
  const client = await agency.from("clients").select("id").eq("slug", "sabre").single();
  if (client.error) throw client.error;
  restoreViews = await Promise.all(
    [credentials.agency, credentials.client].map((email) =>
      preserveBoardPreference(email, client.data.id),
    ),
  );
});
test.afterEach(async () => {
  for (const restore of restoreViews) await restore();
});

test("agency signs in, sees ten workspaces, and opens a live project canvas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "studio@dawes.local");
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.locator(".workspace-card")).toHaveCount(10);
  await page.screenshot({ path: `${screenshotDirectory}/agency-home.png`, fullPage: true });
  await page.locator(".workspace-card").filter({ hasText: "SABRE" }).click();
  await page.getByRole("button", { name: "Canvas view", exact: true }).click();
  await expect(page.locator(".board-canvas .react-flow")).toBeVisible();
  await expect(page.locator(".react-flow__node-project .board-card")).toHaveCount(7);
  await page.screenshot({ path: `${screenshotDirectory}/agency-board.png` });
  // One click selects; a double click opens the project canvas.
  await page.locator(".react-flow__node-project .board-card-body").first().dblclick();
  await expect(page.locator(".project-canvas .react-flow")).toBeVisible();
  await expect(page.getByRole("button", { name: "Working files", exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshotDirectory}/agency-project.png` });
  await page.locator(".design-preview-artwork").first().dblclick();
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshotDirectory}/agency-design.png` });
  expect(errors).toEqual([]);
});

test("client sees only its own workspace and no internal production controls", async ({ page }) => {
  await signIn(page, "sabre@client.dawes.local");
  await expect(page).toHaveURL(/\/clients\/[^/]+\/overview$/);
  await page
    .getByRole("navigation", { name: "SABRE navigation", exact: true })
    .getByRole("link", { name: "Board", exact: true })
    .click();
  await expect(page).toHaveURL(/\/clients\/[^/]+\/board$/);
  await expect(page.getByRole("link", { name: "SABRE workspace", exact: true })).toBeVisible();
  await expect(page.locator(".client-navigation")).toHaveCount(1);
  await page.getByRole("button", { name: "Canvas view", exact: true }).click();
  await expect(page.getByRole("link", { name: "Studio settings" })).toHaveCount(0);
  await expect(page.getByText("Alex Morgan", { exact: true })).toHaveCount(0);
  await expect(page.locator(".react-flow__node-project .board-card")).toHaveCount(7);
  await expect(page.locator(".board-card-grip")).toHaveCount(0);
  // One click selects; a double click opens the project canvas.
  await page.locator(".react-flow__node-project .board-card-body").first().dblclick();
  await expect(page.getByText("Shared designs", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share with client" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Working files" })).toHaveCount(0);
  await page.screenshot({ path: `${screenshotDirectory}/client-project.png` });
});
