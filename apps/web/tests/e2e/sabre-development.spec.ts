import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  credentials,
  localAdmin,
  localCaller,
  preserveBoardPreference,
  signIn,
} from "./test-support";

test("the reduced local SABRE dataset keeps five public phases and a discoverable Backlog project", async ({
  page,
}) => {
  test.skip(
    process.env.SABRE_DEVELOPMENT !== "1",
    "Run explicitly against the reduced local development dataset.",
  );
  const clients = await localAdmin.from("clients").select("id,slug");
  expect(clients.error).toBeNull();
  expect(clients.data).toHaveLength(1);
  expect(clients.data![0].slug).toBe("sabre");
  const clientId = clients.data![0].id;
  const projects = await localAdmin.from("projects").select("id,title,status,activity");
  expect(projects.error).toBeNull();
  expect(projects.data).toHaveLength(6);
  expect(
    projects.data!.map((row) => (row.activity === "backlog" ? "backlog" : row.status)).sort(),
  ).toEqual([
    "approved",
    "backlog",
    "changes_requested",
    "client_review",
    "delivered",
    "in_progress",
  ]);
  const client = await localCaller(credentials.client);
  const visible = await client.rpc("visible_projects");
  expect(visible.error).toBeNull();
  expect(visible.data).toHaveLength(6);
  expect(JSON.stringify(visible.data)).not.toContain("internal_review");
  const internal = await client.from("board_work_requests").select("*");
  expect(internal.error).toBeNull();
  expect(internal.data).toEqual([]);
  const oldClient = await localCaller("northfield-bank@client.dawes.local");
  expect((await oldClient.from("clients").select("id")).data).toEqual([]);
  expect(
    (await oldClient.rpc("get_project_workflow", { p_project_id: projects.data![0].id })).error
      ?.code,
  ).toBe("42501");
  const delivered = projects.data!.find((row) => row.status === "delivered")!;
  const files = await client
    .from("delivery_files")
    .select("storage_path")
    .eq("project_id", delivered.id);
  expect(files.error).toBeNull();
  expect(files.data!.length).toBeGreaterThan(0);
  const downloaded = await client.storage
    .from("delivery-files")
    .download(files.data![0].storage_path);
  expect(downloaded.error).toBeNull();
  expect(downloaded.data!.size).toBeGreaterThan(0);
  const restore = await preserveBoardPreference(credentials.agency, clientId);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${clientId}/board`);
    await page
      .getByRole("group", { name: "Board view" })
      .getByRole("button", { name: "List view", exact: true })
      .click();
    await expect(page.getByText("Brand Guidelines", { exact: true })).toBeVisible();
    await expect(page.getByText("Social Launch", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption("");
    for (const project of projects.data!)
      await expect(page.getByText(project.title, { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Status", exact: true })).not.toContainText(
      "Studio review",
    );
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.screenshot({
      path: fileURLToPath(
        new URL("../../../../outputs/sabre-development-six-projects.png", import.meta.url),
      ),
    });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption("backlog");
    await expect(page.getByText("Social Launch", { exact: true })).toBeVisible();
    await expect(page.getByText("Brand Guidelines", { exact: true })).toHaveCount(0);
  } finally {
    await restore();
  }
});
