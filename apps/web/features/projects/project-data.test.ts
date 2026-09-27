import { describe, expect, it, vi } from "vitest";
import {
  assignDesigner,
  clearMiroLink,
  moveProjectMonth,
  MonthShortfallError,
  projectCreditCharge,
  settleProjectCredits,
  postComment,
  resolveComment,
  reviewPublication,
  revokeDesignAssignment,
  setMiroLink,
  setProjectCoverVisibility,
  updateProjectDetails,
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
const row: Result = { data: { id: "project-1" }, error: null };

describe("project procedures", () => {
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

  it("sets a cover's client visibility", async () => {
    const { database, rpc } = stubDatabase(ok);
    await setProjectCoverVisibility(database, { projectId: "project-1", visible: true });
    expect(rpc).toHaveBeenCalledWith("set_project_cover_visibility", {
      p_project_id: "project-1",
      p_client_visible: true,
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

  it("posts a round's feedback with its version", async () => {
    const { database, rpc } = stubDatabase(ok);
    await postComment(database, {
      projectId: "project-1",
      channel: "client",
      body: "Move this up",
      versionId: "version-1",
    });
    expect(rpc).toHaveBeenCalledWith("post_comment", {
      p_project_id: "project-1",
      p_channel: "client",
      p_body: "Move this up",
      p_version_id: "version-1",
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
});

describe("project write failures", () => {
  const failures: [string, (database: never) => Promise<unknown>][] = [
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

describe("Miro link writes", () => {
  it("sets a publication link on the client channel", async () => {
    const { database, rpc } = stubDatabase(ok);
    await setMiroLink(database, {
      channel: "client",
      versionId: "pub-1",
      url: "https://miro.com/app/board/uXjVKabc123=/",
    });
    expect(rpc).toHaveBeenCalledWith("set_publication_miro_link", {
      p_publication_id: "pub-1",
      p_url: "https://miro.com/app/board/uXjVKabc123=/",
    });
  });

  it("sets an internal link on the internal channel", async () => {
    const { database, rpc } = stubDatabase(ok);
    await setMiroLink(database, {
      channel: "internal",
      versionId: "v-1",
      url: "https://miro.com/app/board/uXjVKabc123=/",
    });
    expect(rpc).toHaveBeenCalledWith("set_version_miro_link", {
      p_version_id: "v-1",
      p_url: "https://miro.com/app/board/uXjVKabc123=/",
    });
  });

  it("clears by channel", async () => {
    const { database, rpc } = stubDatabase(ok);
    await clearMiroLink(database, { channel: "client", versionId: "pub-1" });
    await clearMiroLink(database, { channel: "internal", versionId: "v-1" });
    expect(rpc).toHaveBeenCalledWith("clear_publication_miro_link", { p_publication_id: "pub-1" });
    expect(rpc).toHaveBeenCalledWith("clear_version_miro_link", { p_version_id: "v-1" });
  });
});

describe("project credits", () => {
  it("charges the project what its credit month holds, plus any final adjustment", () => {
    expect(
      projectCreditCharge(
        [
          { amount: -9, kind: "project_debit", month: "2026-09-01" },
          { amount: 9, kind: "project_refund", month: "2026-09-01" },
          { amount: -9, kind: "project_debit", month: "2026-11-01" },
          { amount: -3, kind: "final_adjustment", month: "2026-10-01" },
        ],
        "2026-11-01",
      ),
    ).toBe(12);
    // A debit left in an expired origin month stays spent but is not the project's charge.
    expect(
      projectCreditCharge(
        [
          { amount: -9, kind: "project_debit", month: "2026-08-01" },
          { amount: -9, kind: "project_debit", month: "2026-10-01" },
        ],
        "2026-10-01",
      ),
    ).toBe(9);
  });

  it("moves a project to another month with its key and full-charge confirmation", async () => {
    const { database, rpc } = stubDatabase({ data: "entry-1", error: null });
    await moveProjectMonth(database, {
      projectId: "project-1",
      toMonth: "2026-11-01",
      chargeFull: true,
      idempotencyKey: "move:project-1:a:2026-11-01",
    });
    expect(rpc).toHaveBeenCalledWith("move_project_month", {
      p_project_id: "project-1",
      p_to_month: "2026-11-01",
      p_idempotency_key: "move:project-1:a:2026-11-01",
      p_charge_full: true,
    });
  });

  it("settles with the current month by default and a chosen charge month when given", async () => {
    const { database, rpc } = stubDatabase({ data: { project_id: "project-1" }, error: null });
    const input = {
      projectId: "project-1",
      finalCredits: 12,
      reason: "Two extra sizes",
      idempotencyKey: "settle:project-1:a",
    };
    await settleProjectCredits(database, { ...input, chargeMonth: null });
    expect(rpc).toHaveBeenLastCalledWith("settle_project_credits", {
      p_project_id: "project-1",
      p_final_credits: 12,
      p_reason: "Two extra sizes",
      p_idempotency_key: "settle:project-1:a",
    });
    await settleProjectCredits(database, { ...input, chargeMonth: "2026-11-01" });
    expect(rpc).toHaveBeenLastCalledWith(
      "settle_project_credits",
      expect.objectContaining({ p_charge_month: "2026-11-01" }),
    );
  });

  it("turns insufficient_month_credits into a shortfall the dialog can act on", async () => {
    const { database } = stubDatabase({
      data: null,
      error: {
        message: "insufficient_month_credits",
        details: JSON.stringify({ month: "2026-09-01", available: 2, required: 3, shortfall: 1 }),
      },
    } as never);
    const error = await settleProjectCredits(database, {
      projectId: "project-1",
      finalCredits: 12,
      reason: "Two extra sizes",
      chargeMonth: null,
      idempotencyKey: "settle:project-1:a",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MonthShortfallError);
    expect(error).toMatchObject({ month: "2026-09-01", available: 2, shortfall: 1 });
  });

  it("surfaces any other settlement error as it is", async () => {
    const { database } = stubDatabase({
      data: null,
      error: { message: "This project is already settled" },
    });
    await expect(
      settleProjectCredits(database, {
        projectId: "project-1",
        finalCredits: 12,
        reason: "r",
        chargeMonth: null,
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("This project is already settled");
  });
});
