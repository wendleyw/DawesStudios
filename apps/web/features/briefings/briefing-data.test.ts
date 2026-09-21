import { describe, expect, it, vi } from "vitest";
import type { Database } from "@database";
import {
  acceptBriefing,
  addBriefingAttachment,
  confirmBriefingBudget,
  downloadBriefingAttachmentFile,
  findBriefingAttachmentByPath,
  removeBriefingAttachment,
  removeBriefingAttachmentFile,
  saveBriefingRevision,
  submitBriefing,
  uploadBriefingAttachmentFile,
} from "./briefing-data";

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Call = { method: string; args: unknown[] };

/**
 * A database whose query builder, storage builder and `rpc` each record every call in order and
 * resolve to `result` when awaited.
 *
 * Recording the whole chain is the point: a relocated query, storage call or procedure call is only
 * faithful if its table or bucket, its column selection or upload options, its filters, and its RPC
 * name and argument object are the ones the component used to issue.
 */
function stubDatabase(result: Result) {
  const calls: Call[] = [];
  function makeChain(prefix: string) {
    return new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") return (resolve: (value: Result) => unknown) => resolve(result);
          return (...args: unknown[]) => {
            calls.push({ method: `${prefix}${String(property)}`, args });
            return makeChain(prefix);
          };
        },
      },
    );
  }
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return makeChain("");
  });
  const storageFrom = vi.fn((bucket: string) => {
    calls.push({ method: "storage.from", args: [bucket] });
    return makeChain("storage.");
  });
  const rpc = vi.fn((name: string, args: unknown) => {
    calls.push({ method: "rpc", args: [name, args] });
    return Promise.resolve(result);
  });
  return { database: { from, storage: { from: storageFrom }, rpc } as never, calls, rpc };
}

const ok: Result = { data: [], error: null };

describe("budget-acceptance writes", () => {
  it("confirms the approved project budget with its note", async () => {
    const { database, rpc } = stubDatabase({ data: null, error: null });
    await confirmBriefingBudget(database, {
      briefingId: "briefing-1",
      credits: 40,
      note: "Adjusted for a rush turnaround.",
    });
    expect(rpc).toHaveBeenCalledWith("confirm_briefing_budget", {
      p_briefing_id: "briefing-1",
      p_credits: 40,
      p_note: "Adjusted for a rush turnaround.",
    });
  });

  it("accepts a briefing and returns the created project id", async () => {
    const { database, rpc } = stubDatabase({ data: "project-1", error: null });
    const projectId = await acceptBriefing(database, { briefingId: "briefing-1" });
    expect(rpc).toHaveBeenCalledWith("accept_briefing", { p_briefing_id: "briefing-1" });
    expect(projectId).toBe("project-1");
  });

  it("surfaces the database error message when confirming a budget fails", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(
      confirmBriefingBudget(database, { briefingId: "briefing-1", credits: 10, note: "" }),
    ).rejects.toThrow("permission denied");
  });

  it("surfaces the database error message when acceptance fails, e.g. insufficient balance", async () => {
    const { database } = stubDatabase({
      data: null,
      error: { message: "insufficient credit balance" },
    });
    await expect(acceptBriefing(database, { briefingId: "briefing-1" })).rejects.toThrow(
      "insufficient credit balance",
    );
  });
});

describe("draft save and submission writes", () => {
  const payload: Database["public"]["Functions"]["save_briefing_revision"]["Args"] = {
    p_client_id: "client-1",
    p_service_type: "social-post",
    p_title: "Autumn campaign",
    p_overview: "Launch creative",
    p_goals: "",
    p_direction: {},
    p_deliverables: [],
    p_estimated_credits: 20,
  };

  it("saves a revision without an expected-revision guard for a brand-new draft", async () => {
    const { database, rpc } = stubDatabase({
      data: { id: "briefing-1", updated_at: "2026-09-20T10:00:00Z" },
      error: null,
    });
    const stored = await saveBriefingRevision(database, { payload });
    expect(rpc).toHaveBeenCalledWith("save_briefing_revision", payload);
    expect(stored).toEqual({ id: "briefing-1", updated_at: "2026-09-20T10:00:00Z" });
  });

  it("saves a revision guarded by the revision the form was opened on", async () => {
    const { database, rpc } = stubDatabase({
      data: { id: "briefing-1", updated_at: "2026-09-20T11:00:00Z" },
      error: null,
    });
    await saveBriefingRevision(database, {
      payload,
      expectedRevision: "2026-09-20T10:00:00Z",
    });
    expect(rpc).toHaveBeenCalledWith("save_briefing_revision", {
      ...payload,
      p_expected_updated_at: "2026-09-20T10:00:00Z",
    });
  });

  it("submits a saved briefing to the studio", async () => {
    const { database, rpc } = stubDatabase({ data: null, error: null });
    await submitBriefing(database, { briefingId: "briefing-1" });
    expect(rpc).toHaveBeenCalledWith("submit_briefing", { p_briefing_id: "briefing-1" });
  });

  it("surfaces the database error message when a save is rejected as a stale revision", async () => {
    const { database } = stubDatabase({
      data: null,
      error: { message: "This briefing changed elsewhere." },
    });
    await expect(
      saveBriefingRevision(database, { payload, expectedRevision: "stale" }),
    ).rejects.toThrow("This briefing changed elsewhere.");
  });

  it("surfaces the database error message when submission fails", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(submitBriefing(database, { briefingId: "briefing-1" })).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("attachment writes", () => {
  it("uploads a file to the briefing-files bucket with its content type", async () => {
    const { database, calls } = stubDatabase(ok);
    const file = { type: "application/pdf" } as File;
    await uploadBriefingAttachmentFile(database, { path: "briefing-1/attachment-1.pdf", file });
    expect(calls).toEqual([
      { method: "storage.from", args: ["briefing-files"] },
      {
        method: "storage.upload",
        args: [
          "briefing-1/attachment-1.pdf",
          file,
          { contentType: "application/pdf", upsert: false },
        ],
      },
    ]);
  });

  it("registers an uploaded attachment with its full metadata", async () => {
    const { database, rpc } = stubDatabase({ data: "attachment-1", error: null });
    await addBriefingAttachment(database, {
      briefingId: "briefing-1",
      name: "Direction.pdf",
      storagePath: "briefing-1/attachment-1.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
    });
    expect(rpc).toHaveBeenCalledWith("add_briefing_attachment", {
      p_briefing_id: "briefing-1",
      p_name: "Direction.pdf",
      p_storage_path: "briefing-1/attachment-1.pdf",
      p_mime_type: "application/pdf",
      p_file_size: 2048,
    });
  });

  it("removes an attachment's registration and returns its storage path", async () => {
    const { database, rpc } = stubDatabase({
      data: "briefing-1/attachment-1.pdf",
      error: null,
    });
    const path = await removeBriefingAttachment(database, { id: "attachment-1" });
    expect(rpc).toHaveBeenCalledWith("remove_briefing_attachment", {
      p_attachment_id: "attachment-1",
    });
    expect(path).toBe("briefing-1/attachment-1.pdf");
  });

  it("removes an attachment's file from the bucket", async () => {
    const { database, calls } = stubDatabase(ok);
    await removeBriefingAttachmentFile(database, { path: "briefing-1/attachment-1.pdf" });
    expect(calls).toEqual([
      { method: "storage.from", args: ["briefing-files"] },
      { method: "storage.remove", args: [["briefing-1/attachment-1.pdf"]] },
    ]);
  });

  it("downloads the real file behind a stored attachment", async () => {
    const blob = new Blob(["x"]);
    const { database, calls } = stubDatabase({ data: blob, error: null });
    const result = await downloadBriefingAttachmentFile(database, {
      path: "briefing-1/attachment-1.pdf",
    });
    expect(calls).toEqual([
      { method: "storage.from", args: ["briefing-files"] },
      { method: "storage.download", args: ["briefing-1/attachment-1.pdf"] },
    ]);
    expect(result).toBe(blob);
  });

  it("looks for an already-registered attachment at this storage path", async () => {
    const { database, calls } = stubDatabase({ data: { id: "attachment-1" }, error: null });
    const result = await findBriefingAttachmentByPath(database, {
      briefingId: "briefing-1",
      path: "briefing-1/attachment-1.pdf",
    });
    expect(calls).toEqual([
      { method: "from", args: ["briefing_attachments"] },
      { method: "select", args: ["id"] },
      { method: "eq", args: ["briefing_id", "briefing-1"] },
      { method: "eq", args: ["storage_path", "briefing-1/attachment-1.pdf"] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(result).toEqual({ data: { id: "attachment-1" }, error: null });
  });

  it("returns the select's own error rather than throwing, so a retry can fall through to the original upload error", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    const result = await findBriefingAttachmentByPath(database, {
      briefingId: "briefing-1",
      path: "briefing-1/attachment-1.pdf",
    });
    expect(result.error).toEqual({ message: "permission denied" });
  });

  it("surfaces the database error message when registering an attachment fails", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(
      addBriefingAttachment(database, {
        briefingId: "briefing-1",
        name: "n",
        storagePath: "p",
        mimeType: "application/pdf",
        fileSize: 1,
      }),
    ).rejects.toThrow("permission denied");
  });

  it("surfaces the database error message when an upload fails", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "storage quota exceeded" } });
    await expect(
      uploadBriefingAttachmentFile(database, {
        path: "briefing-1/a.pdf",
        file: { type: "application/pdf" } as File,
      }),
    ).rejects.toThrow("storage quota exceeded");
  });

  it("surfaces the database error message when removing an attachment fails", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(removeBriefingAttachment(database, { id: "attachment-1" })).rejects.toThrow(
      "permission denied",
    );
  });

  it("surfaces the database error message when removing a file fails", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(
      removeBriefingAttachmentFile(database, { path: "briefing-1/a.pdf" }),
    ).rejects.toThrow("permission denied");
  });

  it("surfaces the database error message when a download fails", async () => {
    const { database } = stubDatabase({ data: null, error: { message: "object not found" } });
    await expect(
      downloadBriefingAttachmentFile(database, { path: "briefing-1/a.pdf" }),
    ).rejects.toThrow("object not found");
  });
});
