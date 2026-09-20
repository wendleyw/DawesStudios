import { test, expect } from "@playwright/test";
import { signIn, screenshotDirectory } from "./test-support";

test("agency signs in, sees ten workspaces, and opens a live project canvas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "studio@dawes.local");
  await expect(page.getByRole("heading", { name: "Client workspaces" })).toBeVisible();
  await expect(page.locator(".workspace-card")).toHaveCount(10);
  await page.screenshot({ path: `${screenshotDirectory}/agency-home.png`, fullPage: true });
  await page.locator(".workspace-card").filter({ hasText: "SABRE" }).click();
  await expect(page.locator(".board-canvas .react-flow")).toBeVisible();
  await expect(page.locator(".board-card")).toHaveCount(2);
  await page.screenshot({ path: `${screenshotDirectory}/agency-board.png` });
  await page.locator(".board-card-body").first().click();
  await expect(page.locator(".project-canvas .react-flow")).toBeVisible();
  await expect(page.getByRole("button", { name: "Working files", exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshotDirectory}/agency-project.png` });
  await page.locator(".design-preview").first().click();
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshotDirectory}/agency-design.png` });
  expect(errors).toEqual([]);
});

test("client sees only its own workspace and no internal production controls", async ({ page }) => {
  await signIn(page, "sabre@client.dawes.local");
  await expect(page).toHaveURL(/\/clients\/[^/]+\/board$/);
  await expect(page.locator(".client-nav")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Studio settings" })).toHaveCount(0);
  await expect(page.getByText("Alex Morgan", { exact: true })).toHaveCount(0);
  await expect(page.locator(".board-card")).toHaveCount(2);
  await expect(page.locator(".board-card-grip")).toHaveCount(0);
  await page.locator(".board-card-body").first().click();
  await expect(page.getByText("Shared designs", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share with client" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Working files" })).toHaveCount(0);
  await page.screenshot({ path: `${screenshotDirectory}/client-project.png` });
});
