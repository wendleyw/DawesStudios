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

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/**
 * Adds one Brand Hub asset (in a named folder) and one internal design version/design — plus its
 * published copy, shared with the client — to a fixture project. Kept separate from
 * `createPlaygroundFixture()` so every other Playground scenario's setup stays as small as today.
 * The design/publication rows and their `internal-assets`/`published-assets` objects are already
 * swept by `cleanupTestProject` (called from the base fixture's `cleanup`, keyed by project id);
 * only the client-scoped Brand Hub asset, its folder and its object need their own cleanup here.
 */
export async function seedPlaygroundAlbumsFixture(fixture: {
  clientId: string;
  projectId: string;
}) {
  const folder = value(
    await localAdmin
      .from("brand_asset_folders")
      .insert({ client_id: fixture.clientId, name: "Acceptance logos" })
      .select("id")
      .single(),
  );
  const assetPath = `${fixture.clientId}/${randomUUID()}.png`;
  const uploadedAsset = await localAdmin.storage
    .from("brand-assets")
    .upload(assetPath, onePixelPng, { contentType: "image/png", upsert: false });
  if (uploadedAsset.error) throw uploadedAsset.error;
  const asset = value(
    await localAdmin
      .from("brand_assets")
      .insert({
        client_id: fixture.clientId,
        folder_id: folder.id,
        name: "Acceptance wordmark",
        category: "Logo",
        mime_type: "image/png",
        storage_path: assetPath,
      })
      .select("id")
      .single(),
  );

  const designer = await localCaller(credentials.designer);
  const designerAccount = await designer.auth.getUser();
  if (designerAccount.error || !designerAccount.data.user)
    throw new Error("Designer fixture authentication failed.");
  const deliverable = value(
    await localAdmin
      .from("deliverables")
      .select("id")
      .eq("project_id", fixture.projectId)
      .eq("name", "Campaign square")
      .single(),
  );
  const version = value(
    await localAdmin
      .from("design_versions")
      .insert({
        project_id: fixture.projectId,
        deliverable_id: deliverable.id,
        version_number: 1,
        created_by: designerAccount.data.user.id,
      })
      .select("id")
      .single(),
  );
  const designPath = `${fixture.projectId}/${randomUUID()}.png`;
  const uploadedDesign = await localAdmin.storage
    .from("internal-assets")
    .upload(designPath, onePixelPng, { contentType: "image/png", upsert: false });
  if (uploadedDesign.error) throw uploadedDesign.error;
  const design = value(
    await localAdmin
      .from("designs")
      .insert({
        project_id: fixture.projectId,
        version_id: version.id,
        title: "Acceptance square design",
        internal_asset_path: designPath,
        sort_order: 0,
        created_by: designerAccount.data.user.id,
      })
      .select("id")
      .single(),
  );
  const publication = value(
    await localAdmin
      .from("published_versions")
      .insert({ project_id: fixture.projectId, deliverable_id: deliverable.id, version_number: 1 })
      .select("id")
      .single(),
  );
  const publishedPath = `${fixture.projectId}/${randomUUID()}.png`;
  const uploadedPublished = await localAdmin.storage
    .from("published-assets")
    .upload(publishedPath, onePixelPng, { contentType: "image/png", upsert: false });
  if (uploadedPublished.error) throw uploadedPublished.error;
  const published = await localAdmin.from("published_designs").insert({
    project_id: fixture.projectId,
    publication_id: publication.id,
    title: "Acceptance square design",
    asset_path: publishedPath,
    sort_order: 0,
  });
  if (published.error) throw published.error;

  // The Brand Hub rows reference the client, so they go before the base fixture deletes it.
  async function cleanup() {
    const removed = await localAdmin.storage.from("brand-assets").remove([assetPath]);
    if (removed.error) throw removed.error;
    const assetRow = await localAdmin.from("brand_assets").delete().eq("id", asset.id);
    if (assetRow.error) throw assetRow.error;
    const folderRow = await localAdmin.from("brand_asset_folders").delete().eq("id", folder.id);
    if (folderRow.error) throw folderRow.error;
  }
  return { folderId: folder.id, assetId: asset.id, designId: design.id, cleanup };
}
