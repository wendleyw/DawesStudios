import { describe, expect, it, vi } from "vitest";
import {
  addDesign,
  assignDesigner,
  createDesignVersion,
  downloadDesignAssetFile,
  findDesignByAsset,
  findUnchangedDesign,
  postComment,
  publishVersion,
  resolveComment,
  reviewPublication,
  revokeDesignAssignment,
  submitDesignVersion,
  updateDesignContent,
  updateProjectDetails,
  updateWorkingDesign,
} from "./project-data";

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Call = { method: string; args: unknown[] };

/**
 * A database whose query builder records every call in order and resolves to `result` when awaited.
 *
 * Recording the whole chain is the point: a relocated query is only faithful if its table, its
 * column selection, its filters and their order are the ones the component used to issue.
 */
function stubDatabase(result: Result) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return (resolve: (value: Result) => unknown) => resolve(result);
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });
          return chain;
        };
      },
    },
  );
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue(result);
  const storageFrom = vi.fn((bucket: string) => {
    calls.push({ method: "storage.from", args: [bucket] });
    return chain;
  });
  return { database: { from, rpc, storage: { from: storageFrom } } as never, calls, rpc };
}

const ok: Result = { data: [], error: null };
const row: Result = { data: { id: "design-1" }, error: null };

describe("project procedures", () => {
  it("creates a design version without copying when no source is given", async () => {
    const { database, rpc } = stubDatabase(ok);
    await createDesignVersion(database, { deliverableId: "deliverable-1", notes: "explore" });
    expect(rpc).toHaveBeenCalledWith("create_design_version", {
      p_deliverable_id: "deliverable-1",
      p_notes: "explore",
    });
  });

  it("creates a design version that copies the version it is given", async () => {
    const { database, rpc } = stubDatabase(ok);
    await createDesignVersion(database, {
      deliverableId: "deliverable-1",
      notes: "",
      copyVersionId: "version-1",
    });
    expect(rpc).toHaveBeenCalledWith("create_design_version", {
      p_deliverable_id: "deliverable-1",
      p_notes: "",
      p_copy_version_id: "version-1",
    });
  });

  it("resolves to the new version's id", async () => {
    const { database } = stubDatabase({ data: "version-99", error: null });
    await expect(
      createDesignVersion(database, { deliverableId: "deliverable-1", notes: "" }),
    ).resolves.toBe("version-99");
  });

  it("adds a text design without an artwork path", async () => {
    const { database, rpc } = stubDatabase(ok);
    await addDesign(database, {
      versionId: "version-1",
      title: "Hero",
      content: { headline: "Hero" },
      internalAssetPath: null,
    });
    expect(rpc).toHaveBeenCalledWith("add_design", {
      p_version_id: "version-1",
      p_title: "Hero",
      p_content: { headline: "Hero" },
    });
  });

  it("adds a design with the artwork path it uploaded", async () => {
    const { database, rpc } = stubDatabase(ok);
    await addDesign(database, {
      versionId: "version-1",
      title: "Hero",
      content: { headline: "Hero" },
      internalAssetPath: "project-1/artwork.png",
    });
    expect(rpc).toHaveBeenCalledWith("add_design", {
      p_version_id: "version-1",
      p_title: "Hero",
      p_content: { headline: "Hero" },
      p_internal_asset_path: "project-1/artwork.png",
    });
  });

  it("publishes a version with its prepared assets and no submission key", async () => {
    const { database, rpc } = stubDatabase(ok);
    await publishVersion(database, {
      versionId: "version-1",
      releaseNote: "First look",
      assets: { "design-1": "published/design-1.png" },
    });
    expect(rpc).toHaveBeenCalledWith("publish_version", {
      p_version_id: "version-1",
      p_release_note: "First look",
      p_assets: { "design-1": "published/design-1.png" },
    });
  });

  it("submits a version to the studio", async () => {
    const { database, rpc } = stubDatabase(ok);
    await submitDesignVersion(database, { versionId: "version-1" });
    expect(rpc).toHaveBeenCalledWith("submit_design_version", { p_version_id: "version-1" });
  });

  it("reviews a publication with the decision and feedback", async () => {
    const { database, rpc } = stubDatabase(ok);
    await reviewPublication(database, {
      publicationId: "publication-1",
      decision: "changes_requested",
      feedback: "Tighten the headline.",
    });
    expect(rpc).toHaveBeenCalledWith("review_publication", {
      p_publication_id: "publication-1",
      p_decision: "changes_requested",
      p_feedback: "Tighten the headline.",
    });
  });

  it("assigns a designer to a project", async () => {
    const { database, rpc } = stubDatabase(ok);
    await assignDesigner(database, { projectId: "project-1", designerId: "designer-1" });
    expect(rpc).toHaveBeenCalledWith("assign_designer", {
      p_project_id: "project-1",
      p_designer_id: "designer-1",
    });
  });

  it("revokes a design assignment", async () => {
    const { database, rpc } = stubDatabase(ok);
    await revokeDesignAssignment(database, { projectId: "project-1", designerId: "designer-1" });
    expect(rpc).toHaveBeenCalledWith("revoke_design_assignment", {
      p_project_id: "project-1",
      p_designer_id: "designer-1",
    });
  });

  it("posts a project-level comment with only the fields it has", async () => {
    const { database, rpc } = stubDatabase(ok);
    await postComment(database, {
      projectId: "project-1",
      channel: "internal",
      body: "Looks good",
    });
    expect(rpc).toHaveBeenCalledWith("post_comment", {
      p_project_id: "project-1",
      p_channel: "internal",
      p_body: "Looks good",
    });
  });

  it("posts a pinned design comment with its version, design and pin", async () => {
    const { database, rpc } = stubDatabase(ok);
    await postComment(database, {
      projectId: "project-1",
      channel: "client",
      body: "Move this up",
      versionId: "version-1",
      designId: "design-1",
      pin: { x: 0.25, y: 0.75 },
    });
    expect(rpc).toHaveBeenCalledWith("post_comment", {
      p_project_id: "project-1",
      p_channel: "client",
      p_body: "Move this up",
      p_version_id: "version-1",
      p_design_id: "design-1",
      p_pin_x: 0.25,
      p_pin_y: 0.75,
      p_pin_t: undefined,
    });
  });

  it("passes the pin's time when the design carrying it is a video", async () => {
    const { database, rpc } = stubDatabase(ok);
    await postComment(database, {
      projectId: "project-1",
      channel: "internal",
      body: "Logo lands too late",
      designId: "design-1",
      pin: { x: 0.4, y: 0.6, t: 12.5 },
    });
    expect(rpc).toHaveBeenCalledWith("post_comment", {
      p_project_id: "project-1",
      p_channel: "internal",
      p_body: "Logo lands too late",
      p_design_id: "design-1",
      p_pin_x: 0.4,
      p_pin_y: 0.6,
      p_pin_t: 12.5,
    });
  });

  it("leaves the pin time unset for a still image", async () => {
    const { database, rpc } = stubDatabase(ok);
    await postComment(database, {
      projectId: "project-1",
      channel: "internal",
      body: "Crop tighter",
      designId: "design-1",
      pin: { x: 0.4, y: 0.6 },
    });
    expect(rpc).toHaveBeenCalledWith("post_comment", {
      p_project_id: "project-1",
      p_channel: "internal",
      p_body: "Crop tighter",
      p_design_id: "design-1",
      p_pin_x: 0.4,
      p_pin_y: 0.6,
      p_pin_t: undefined,
    });
  });

  it("passes an idempotency key when the attempt carries one", async () => {
    const { database, rpc } = stubDatabase(ok);
    await postComment(database, {
      projectId: "project-1",
      channel: "internal",
      body: "Same text",
      idempotencyKey: "comment:fixed",
    });
    expect(rpc).toHaveBeenCalledWith("post_comment", {
      p_project_id: "project-1",
      p_channel: "internal",
      p_body: "Same text",
      p_idempotency_key: "comment:fixed",
    });
  });

  it("resolves a comment on its own channel", async () => {
    const { database, rpc } = stubDatabase(ok);
    await resolveComment(database, {
      commentId: "comment-1",
      channel: "internal",
      resolved: true,
    });
    expect(rpc).toHaveBeenCalledWith("resolve_comment", {
      p_comment_id: "comment-1",
      p_channel: "internal",
      p_resolved: true,
    });
  });
});

describe("project row writes", () => {
  it("saves project details guarded by the revision the form opened on", async () => {
    const { database, calls } = stubDatabase(row);
    await updateProjectDetails(database, {
      id: "project-1",
      revision: "2026-09-01T10:00:00Z",
      title: "Autumn campaign",
      description: "Two formats",
      startDate: "2026-09-02",
      dueDate: null,
    });
    expect(calls).toEqual([
      { method: "from", args: ["projects"] },
      {
        method: "update",
        args: [
          {
            title: "Autumn campaign",
            description: "Two formats",
            start_date: "2026-09-02",
            due_date: null,
          },
        ],
      },
      { method: "eq", args: ["id", "project-1"] },
      { method: "eq", args: ["updated_at", "2026-09-01T10:00:00Z"] },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });

  it("reports a concurrent edit when the project revision no longer matches", async () => {
    const { database } = stubDatabase({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
    });
    await expect(
      updateProjectDetails(database, {
        id: "project-1",
        revision: "stale",
        title: "Autumn campaign",
        description: "",
        startDate: null,
        dueDate: null,
      }),
    ).rejects.toThrow("This project changed while you were editing");
  });

  it("looks for a design already holding what this save would write", async () => {
    const { database, calls } = stubDatabase(ok);
    await findUnchangedDesign(database, {
      id: "design-1",
      title: "Hero",
      content: { headline: "Hero" },
      assetPath: "project-1/artwork.png",
    });
    expect(calls).toEqual([
      { method: "from", args: ["designs"] },
      { method: "select", args: ["id"] },
      { method: "eq", args: ["id", "design-1"] },
      { method: "eq", args: ["title", "Hero"] },
      { method: "eq", args: ["content", '{"headline":"Hero"}'] },
      { method: "eq", args: ["internal_asset_path", "project-1/artwork.png"] },
    ]);
  });

  it("matches a design with no artwork on a null path rather than an equality", async () => {
    const { database, calls } = stubDatabase(ok);
    await findUnchangedDesign(database, {
      id: "design-1",
      title: "Hero",
      content: {},
      assetPath: null,
    });
    expect(calls.at(-1)).toEqual({ method: "is", args: ["internal_asset_path", null] });
  });

  it("looks for the design in a version that already carries an uploaded artwork", async () => {
    const { database, calls } = stubDatabase(ok);
    await findDesignByAsset(database, {
      versionId: "version-1",
      assetPath: "project-1/artwork.png",
    });
    expect(calls).toEqual([
      { method: "from", args: ["designs"] },
      { method: "select", args: ["id"] },
      { method: "eq", args: ["version_id", "version-1"] },
      { method: "eq", args: ["internal_asset_path", "project-1/artwork.png"] },
    ]);
  });

  it("saves a working design guarded by the values the form opened on", async () => {
    const { database, calls } = stubDatabase(row);
    await updateWorkingDesign(database, {
      id: "design-1",
      title: "Hero B",
      content: { headline: "Hero B" },
      assetPath: "project-1/new.png",
      previousTitle: "Hero",
      previousContent: { headline: "Hero" },
      previousAssetPath: "project-1/old.png",
    });
    expect(calls).toEqual([
      { method: "from", args: ["designs"] },
      {
        method: "update",
        args: [
          {
            title: "Hero B",
            content: { headline: "Hero B" },
            internal_asset_path: "project-1/new.png",
          },
        ],
      },
      { method: "eq", args: ["id", "design-1"] },
      { method: "eq", args: ["title", "Hero"] },
      { method: "eq", args: ["content", '{"headline":"Hero"}'] },
      { method: "eq", args: ["internal_asset_path", "project-1/old.png"] },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });

  it("guards a working design that had no artwork on a null path", async () => {
    const { database, calls } = stubDatabase(row);
    await updateWorkingDesign(database, {
      id: "design-1",
      title: "Hero",
      content: {},
      assetPath: null,
      previousTitle: "Hero",
      previousContent: {},
      previousAssetPath: null,
    });
    expect(calls).toContainEqual({ method: "is", args: ["internal_asset_path", null] });
  });

  it("reports a concurrent edit when the design no longer matches", async () => {
    const { database } = stubDatabase({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
    });
    await expect(
      updateWorkingDesign(database, {
        id: "design-1",
        title: "Hero B",
        content: {},
        assetPath: null,
        previousTitle: "Hero",
        previousContent: {},
        previousAssetPath: null,
      }),
    ).rejects.toThrow("This design changed while you were editing");
  });

  it("rewrites the design a repeated upload resolved to", async () => {
    const { database, calls } = stubDatabase(row);
    await updateDesignContent(database, {
      id: "design-1",
      title: "Hero",
      content: { headline: "Hero" },
    });
    expect(calls).toEqual([
      { method: "from", args: ["designs"] },
      { method: "update", args: [{ title: "Hero", content: { headline: "Hero" } }] },
      { method: "eq", args: ["id", "design-1"] },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });
});

describe("downloadDesignAssetFile", () => {
  it("downloads from internal-assets on the internal channel", async () => {
    const blob = new Blob(["x"]);
    const { database, calls } = stubDatabase({ data: blob, error: null });
    const result = await downloadDesignAssetFile(database, {
      assetPath: "project-1/design-1.png",
      channel: "internal",
    });
    expect(calls).toEqual([
      { method: "storage.from", args: ["internal-assets"] },
      { method: "download", args: ["project-1/design-1.png"] },
    ]);
    expect(result).toBe(blob);
  });

  it("downloads from published-assets on the client channel", async () => {
    const blob = new Blob(["x"]);
    const { database, calls } = stubDatabase({ data: blob, error: null });
    await downloadDesignAssetFile(database, {
      assetPath: "project-1/design-1.png",
      channel: "client",
    });
    expect(calls[0]).toEqual({ method: "storage.from", args: ["published-assets"] });
  });
});

describe("project write failures", () => {
  const failures: [string, (database: never) => Promise<unknown>][] = [
    [
      "downloadDesignAssetFile",
      (database) =>
        downloadDesignAssetFile(database, {
          assetPath: "project-1/design-1.png",
          channel: "internal",
        }),
    ],
    [
      "updateProjectDetails",
      (database) =>
        updateProjectDetails(database, {
          id: "project-1",
          revision: "r",
          title: "t",
          description: "",
          startDate: null,
          dueDate: null,
        }),
    ],
    [
      "assignDesigner",
      (database) => assignDesigner(database, { projectId: "project-1", designerId: "designer-1" }),
    ],
    [
      "revokeDesignAssignment",
      (database) =>
        revokeDesignAssignment(database, { projectId: "project-1", designerId: "designer-1" }),
    ],
    [
      "postComment",
      (database) =>
        postComment(database, { projectId: "project-1", channel: "internal", body: "note" }),
    ],
    [
      "resolveComment",
      (database) =>
        resolveComment(database, { commentId: "comment-1", channel: "internal", resolved: true }),
    ],
    [
      "createDesignVersion",
      (database) => createDesignVersion(database, { deliverableId: "deliverable-1", notes: "" }),
    ],
    [
      "findUnchangedDesign",
      (database) =>
        findUnchangedDesign(database, {
          id: "design-1",
          title: "t",
          content: {},
          assetPath: null,
        }),
    ],
    [
      "findDesignByAsset",
      (database) => findDesignByAsset(database, { versionId: "version-1", assetPath: "p.png" }),
    ],
    [
      "updateWorkingDesign",
      (database) =>
        updateWorkingDesign(database, {
          id: "design-1",
          title: "t",
          content: {},
          assetPath: null,
          previousTitle: "t",
          previousContent: {},
          previousAssetPath: null,
        }),
    ],
    [
      "updateDesignContent",
      (database) => updateDesignContent(database, { id: "design-1", title: "t", content: {} }),
    ],
    [
      "addDesign",
      (database) =>
        addDesign(database, {
          versionId: "version-1",
          title: "t",
          content: {},
          internalAssetPath: null,
        }),
    ],
    [
      "publishVersion",
      (database) =>
        publishVersion(database, { versionId: "version-1", releaseNote: "", assets: {} }),
    ],
    ["submitDesignVersion", (database) => submitDesignVersion(database, { versionId: "v1" })],
    [
      "reviewPublication",
      (database) =>
        reviewPublication(database, { publicationId: "p1", decision: "approved", feedback: "" }),
    ],
  ];

  it.each(failures)("%s surfaces the database error message", async (_name, run) => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(run(database)).rejects.toThrow("permission denied");
  });
});
