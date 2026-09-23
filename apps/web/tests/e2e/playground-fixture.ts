import { randomUUID } from "node:crypto";
import { cleanupTestProject } from "./project-fixture";
import { credentials, localAdmin, localCaller } from "./test-support";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("The Playground fixture did not return a record.");
  return result.data as NonNullable<T>;
}

/** Isolated client/project, using existing role accounts without changing their access elsewhere. */
export async function createPlaygroundFixture() {
  const name = `Acceptance Playground ${randomUUID()}`;
  const client = value(
    await localAdmin
      .from("clients")
      .insert({ name, slug: `acceptance-playground-${randomUUID()}` })
      .select("id")
      .single(),
  );
  let projectId: string | undefined;
  let otherProjectId: string | undefined;
  async function cleanup() {
    const found = value(
      await localAdmin.from("clients").select("name").eq("id", client.id).single(),
    );
    if (found.name !== name || !found.name.startsWith("Acceptance Playground "))
      throw new Error("Refusing to clean up a non-Playground acceptance client.");
    const boards = value(
      await localAdmin.from("playground_boards").select("id").eq("client_id", client.id),
    );
    // Include failed staged transfers, not only files already attached to a saved item.
    for (const board of boards) {
      const folders = value(
        await localAdmin.storage.from("playground-assets").list(board.id, { limit: 1000 }),
      );
      for (const folder of folders) {
        const prefix = `${board.id}/${folder.name}`;
        const paths = folder.id
          ? [prefix]
          : value(
              await localAdmin.storage.from("playground-assets").list(prefix, { limit: 1000 }),
            ).map((file) => `${prefix}/${file.name}`);
        if (paths.length) {
          const removed = await localAdmin.storage.from("playground-assets").remove(paths);
          if (removed.error) throw removed.error;
        }
      }
    }
    if (boards.length) {
      const items = await localAdmin
        .from("playground_items")
        .delete()
        .in(
          "board_id",
          boards.map((board) => board.id),
        );
      if (items.error) throw items.error;
    }
    const deleted = await localAdmin.from("playground_boards").delete().eq("client_id", client.id);
    if (deleted.error) throw deleted.error;
    if (projectId) await cleanupTestProject(projectId);
    if (otherProjectId) await cleanupTestProject(otherProjectId);
    const removed = await localAdmin.from("clients").delete().eq("id", client.id);
    if (removed.error) throw removed.error;
  }
  try {
    const designer = await localCaller(credentials.designer);
    const reviewer = await localCaller(credentials.client);
    const designerAccount = await designer.auth.getUser();
    const reviewerAccount = await reviewer.auth.getUser();
    if (designerAccount.error || !designerAccount.data.user)
      throw new Error("Designer fixture authentication failed.");
    if (reviewerAccount.error || !reviewerAccount.data.user)
      throw new Error("Client fixture authentication failed.");
    const designerId = designerAccount.data.user.id;
    const reviewerId = reviewerAccount.data.user.id;
    const project = value(
      await localAdmin
        .from("projects")
        .insert({ client_id: client.id, title: name, service_type: "static-ad" })
        .select("id")
        .single(),
    );
    projectId = project.id;
    const otherProject = value(
      await localAdmin
        .from("projects")
        .insert({ client_id: client.id, title: `${name} alternate`, service_type: "static-ad" })
        .select("id")
        .single(),
    );
    otherProjectId = otherProject.id;
    for (const result of [
      await localAdmin.from("project_assignments").insert([
        { project_id: project.id, designer_id: designerId },
        { project_id: otherProject.id, designer_id: designerId },
      ]),
      await localAdmin
        .from("client_memberships")
        .insert({ client_id: client.id, user_id: reviewerId }),
      await localAdmin.from("deliverables").insert({
        project_id: project.id,
        name: "Campaign square",
        format: "square",
        width: 1080,
        height: 1080,
        quantity: 1,
        scope: "original",
        sort_order: 0,
      }),
    ])
      if (result.error) throw result.error;
    return {
      clientId: client.id,
      projectId: project.id,
      otherProjectId: otherProject.id,
      name,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
