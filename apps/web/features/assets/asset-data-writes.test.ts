import { describe, expect, it, vi } from "vitest";
import {
  findAssetByStoragePath,
  markProjectDelivered,
  recordProjectAsset,
  removeUnusedUpload,
  uploadInternalAsset,
} from "./asset-data";

/**
 * Unit tests for the write (and non-hook read) functions relocated from `upload-file-dialog.tsx`
 * and `assets-page.tsx` into `asset-data.ts`. Kept in a separate file from `asset-data.test.ts`,
 * which is the pre-existing regression safety net for `initialUploadProject` and is not modified by
 * this migration.
 */

type Result = { data: unknown; error: { message: string } | null };
type Call = { method: string; args: unknown[] };

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
  const storageFrom = vi.fn((bucket: string) => {
    calls.push({ method: "storage.from", args: [bucket] });
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    database: { from, storage: { from: storageFrom }, rpc } as never,
    calls,
    rpc,
  };
}

const ok: Result = { data: [], error: null };
const failure: Result = { data: null, error: { message: "permission denied" } };

describe("findAssetByStoragePath", () => {
  it("looks up a project asset row by its exact storage path", async () => {
    const { database, calls } = stubDatabase(ok);
    await findAssetByStoragePath(database, { path: "project-1/artwork.png" });
    expect(calls).toEqual([
      { method: "from", args: ["project_assets"] },
      { method: "select", args: ["id"] },
      { method: "eq", args: ["storage_path", "project-1/artwork.png"] },
    ]);
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase(failure);
    await expect(
      findAssetByStoragePath(database, { path: "project-1/artwork.png" }),
    ).rejects.toThrow("permission denied");
  });
});

describe("removeUnusedUpload", () => {
  it("removes the file from the internal-assets bucket by its path", async () => {
    const { database, calls } = stubDatabase(ok);
    await removeUnusedUpload(database, { path: "project-1/artwork.png" });
    expect(calls).toEqual([
      { method: "storage.from", args: ["internal-assets"] },
      { method: "remove", args: [["project-1/artwork.png"]] },
    ]);
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase(failure);
    await expect(removeUnusedUpload(database, { path: "project-1/artwork.png" })).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("uploadInternalAsset", () => {
  it("uploads to the internal-assets bucket without overwriting an existing object", async () => {
    const { database, calls } = stubDatabase(ok);
    const file = new File(["x"], "artwork.png", { type: "image/png" });
    await uploadInternalAsset(database, { path: "project-1/artwork.png", file });
    expect(calls).toEqual([
      { method: "storage.from", args: ["internal-assets"] },
      {
        method: "upload",
        args: ["project-1/artwork.png", file, { contentType: "image/png", upsert: false }],
      },
    ]);
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase(failure);
    const file = new File(["x"], "artwork.png", { type: "image/png" });
    await expect(
      uploadInternalAsset(database, { path: "project-1/artwork.png", file }),
    ).rejects.toThrow("permission denied");
  });
});

describe("recordProjectAsset", () => {
  it("inserts a project_assets row with the exact recorded fields", async () => {
    const { database, calls } = stubDatabase(ok);
    await recordProjectAsset(database, {
      projectId: "project-1",
      name: "Reference artwork",
      path: "project-1/artwork.png",
      mime: "image/png",
      size: 2048,
    });
    expect(calls).toEqual([
      { method: "from", args: ["project_assets"] },
      {
        method: "insert",
        args: [
          {
            project_id: "project-1",
            name: "Reference artwork",
            storage_path: "project-1/artwork.png",
            mime_type: "image/png",
            file_size: 2048,
          },
        ],
      },
    ]);
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase(failure);
    await expect(
      recordProjectAsset(database, {
        projectId: "project-1",
        name: "Reference artwork",
        path: "project-1/artwork.png",
        mime: "image/png",
        size: 2048,
      }),
    ).rejects.toThrow("permission denied");
  });
});

describe("markProjectDelivered", () => {
  it("calls the mark_project_delivered procedure with the project id", async () => {
    const { database, rpc } = stubDatabase(ok);
    await markProjectDelivered(database, { projectId: "project-1" });
    expect(rpc).toHaveBeenCalledWith("mark_project_delivered", { p_project_id: "project-1" });
  });

  it("surfaces the database error message", async () => {
    const { database } = stubDatabase(failure);
    await expect(markProjectDelivered(database, { projectId: "project-1" })).rejects.toThrow(
      "permission denied",
    );
  });
});
