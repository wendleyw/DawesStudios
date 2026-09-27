import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cleanupIntakeFixture, createIntakeFixture } from "./intake-fixture";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { localAdmin, localAgency } from "./test-support";

async function recordCounts() {
  const sabre = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  if (sabre.error) throw sabre.error;
  const [clients, projects] = await Promise.all([
    localAdmin.from("clients").select("id", { count: "exact", head: true }),
    localAdmin.from("projects").select("id", { count: "exact", head: true }),
  ]);
  const sabreProjects = await localAdmin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", sabre.data.id);
  if (clients.error) throw clients.error;
  if (projects.error) throw projects.error;
  if (sabreProjects.error) throw sabreProjects.error;
  if (clients.count === null || projects.count === null || sabreProjects.count === null)
    throw new Error("Acceptance record counts are unavailable.");
  return { clients: clients.count, projects: projects.count, sabreProjects: sabreProjects.count };
}

test("project fixture cleanup removes Playground rows and persisted bytes", async () => {
  test.setTimeout(90_000);
  const before = await recordCounts();
  let fixture: Awaited<ReturnType<typeof createProductionFixture>> | undefined;
  try {
    fixture = await createProductionFixture(await localAgency());
    const boardId = randomUUID();
    const itemId = randomUUID();
    const assetPath = `${boardId}/${itemId}/cleanup-regression.txt`;
    const content = Buffer.from("Disposable Playground attachment for fixture cleanup.\n");

    const board = await localAdmin.from("playground_boards").insert({
      id: boardId,
      client_id: fixture.clientId,
      project_id: fixture.projectId,
      role: "agency",
    });
    if (board.error) throw board.error;
    const uploaded = await localAdmin.storage.from("playground-assets").upload(assetPath, content, {
      contentType: "text/plain",
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const item = await localAdmin.from("playground_items").insert({
      id: itemId,
      board_id: boardId,
      kind: "file",
      title: "Cleanup regression attachment",
      body: "",
      asset_path: assetPath,
      mime_type: "text/plain",
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    });
    if (item.error) throw item.error;
    const persisted = await localAdmin.storage.from("playground-assets").download(assetPath);
    if (persisted.error) throw persisted.error;
    expect(Buffer.from(await persisted.data.arrayBuffer())).toEqual(content);

    await cleanupTestProject(fixture.projectId);
    fixture = undefined;
    const [boards, items, files] = await Promise.all([
      localAdmin.from("playground_boards").select("id").eq("id", boardId),
      localAdmin.from("playground_items").select("id").eq("id", itemId),
      localAdmin.storage.from("playground-assets").list(`${boardId}/${itemId}`),
    ]);
    if (boards.error) throw boards.error;
    if (items.error) throw items.error;
    if (files.error) throw files.error;
    expect(boards.data).toEqual([]);
    expect(items.data).toEqual([]);
    expect(files.data).toEqual([]);
    const missing = await localAdmin.storage.from("playground-assets").download(assetPath);
    expect(missing.error).not.toBeNull();
  } finally {
    if (fixture) await cleanupTestProject(fixture.projectId);
    expect(await recordCounts()).toEqual(before);
  }
});

test("intake fixture cleanup removes an agency preference for its client", async () => {
  test.setTimeout(90_000);
  const before = await recordCounts();
  let fixture: Awaited<ReturnType<typeof createIntakeFixture>> | undefined;
  try {
    fixture = await createIntakeFixture();
    const agency = await localAgency();
    const account = await agency.auth.getUser();
    if (account.error) throw account.error;
    if (!account.data.user) throw new Error("Agency account is unavailable.");
    const agencyId = account.data.user.id;
    const inserted = await localAdmin.from("board_preferences").insert({
      user_id: agencyId,
      client_id: fixture.clientId,
      active_view: "list",
    });
    if (inserted.error) throw inserted.error;
    const saved = await localAdmin
      .from("board_preferences")
      .select("client_id")
      .eq("user_id", agencyId)
      .eq("client_id", fixture.clientId);
    if (saved.error) throw saved.error;
    expect(saved.data).toHaveLength(1);

    const clientId = fixture.clientId;
    await cleanupIntakeFixture(fixture);
    fixture = undefined;
    const remaining = await localAdmin
      .from("board_preferences")
      .select("client_id")
      .eq("user_id", agencyId)
      .eq("client_id", clientId);
    if (remaining.error) throw remaining.error;
    expect(remaining.data).toEqual([]);
  } finally {
    if (fixture) await cleanupIntakeFixture(fixture);
    expect(await recordCounts()).toEqual(before);
  }
});
