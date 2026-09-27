import { randomUUID } from "node:crypto";
import { cleanupTestProject, removeClientCredits } from "./project-fixture";
import { credentials, localAdmin, localCaller, password } from "./test-support";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("The Playground fixture did not return a record.");
  return result.data as NonNullable<T>;
}

const clientEmailPattern = /^acceptance-playground-[0-9a-f-]{36}@client\.dawes\.local$/i;

/**
 * Isolated client/project, plus a disposable client-role user created just for this fixture. The
 * fixture must never add the shared SABRE demo client login to a temporary client: a real person
 * signed in with those demo credentials would then see this throwaway workspace in their client
 * switcher while the test runs.
 */
export async function createPlaygroundFixture() {
  const name = `Acceptance Playground ${randomUUID()}`;
  const client = value(
    await localAdmin
      .from("clients")
      .insert({ name, slug: `acceptance-playground-${randomUUID()}` })
      .select("id")
      .single(),
  );
  const clientEmail = `acceptance-playground-${randomUUID()}@client.dawes.local`;
  let projectId: string | undefined;
  let otherProjectId: string | undefined;
  let reviewerId: string | undefined;
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
    removeClientCredits(client.id);
    const removed = await localAdmin.from("clients").delete().eq("id", client.id);
    if (removed.error) throw removed.error;
    if (reviewerId) {
      if (!clientEmailPattern.test(clientEmail))
        throw new Error("Refusing to remove a non-Playground acceptance client user.");
      const account = await localAdmin.auth.admin.getUserById(reviewerId);
      if (account.error || account.data.user?.email !== clientEmail)
        throw new Error("Refusing to remove a non-Playground acceptance client user.");
      const removedUser = await localAdmin.auth.admin.deleteUser(reviewerId);
      if (removedUser.error) throw removedUser.error;
    }
  }
  try {
    const designer = await localCaller(credentials.designer);
    const designerAccount = await designer.auth.getUser();
    if (designerAccount.error || !designerAccount.data.user)
      throw new Error("Designer fixture authentication failed.");
    const designerId = designerAccount.data.user.id;
    const reviewer = await localAdmin.auth.admin.createUser({
      email: clientEmail,
      password,
      email_confirm: true,
    });
    if (reviewer.error || !reviewer.data.user)
      throw reviewer.error ?? new Error("The Playground client user was not created.");
    reviewerId = reviewer.data.user.id;
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
      client: { email: clientEmail, password },
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
 * Adds one Brand Hub asset, in a named folder, to a fixture's client. Kept separate from
 * `createPlaygroundFixture()` so every other Playground scenario's setup stays as small as today.
 * The client-scoped Brand Hub asset, its folder and its object need their own cleanup here, before
 * the base fixture deletes the client.
 */
export async function seedPlaygroundAlbumsFixture(fixture: { clientId: string }) {
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

  async function cleanup() {
    const removed = await localAdmin.storage.from("brand-assets").remove([assetPath]);
    if (removed.error) throw removed.error;
    const assetRow = await localAdmin.from("brand_assets").delete().eq("id", asset.id);
    if (assetRow.error) throw assetRow.error;
    const folderRow = await localAdmin.from("brand_asset_folders").delete().eq("id", folder.id);
    if (folderRow.error) throw folderRow.error;
  }
  return { folderId: folder.id, assetId: asset.id, cleanup };
}
