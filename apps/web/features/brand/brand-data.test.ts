import { describe, expect, it, vi } from "vitest";
import {
  downloadBrandAssetFile,
  findBrandAssetById,
  insertBrandAsset,
  removeBrandAssetFile,
  saveBrandSection,
  updateTemplateDraft,
  uploadBrandAssetFile,
} from "./brand-data";

type Result = { data: unknown; error: { message: string } | null };
type Call = { method: string; args: unknown[] };

/**
 * A database whose query builder and storage builder each record every call in order and resolve
 * to `result` when awaited.
 *
 * Recording the whole chain is the point: a relocated query or storage call is only faithful if its
 * table or bucket, its column selection or upload options, and its filters are the ones the
 * component used to issue.
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
  return { database: { from, storage: { from: storageFrom } } as never, calls };
}

const ok: Result = { data: [], error: null };
const row: Result = { data: { id: "asset-1" }, error: null };

describe("brand asset writes", () => {
  it("uploads a file to the brand-assets bucket with its content type", async () => {
    const { database, calls } = stubDatabase(ok);
    const file = { type: "image/png" } as File;
    await uploadBrandAssetFile(database, { path: "client-1/asset-1.png", file });
    expect(calls).toEqual([
      { method: "storage.from", args: ["brand-assets"] },
      {
        method: "storage.upload",
        args: ["client-1/asset-1.png", file, { contentType: "image/png", upsert: false }],
      },
    ]);
  });

  it("looks for a committed asset row by id", async () => {
    const { database, calls } = stubDatabase(row);
    await findBrandAssetById(database, { id: "asset-1" });
    expect(calls).toEqual([
      { method: "from", args: ["brand_assets"] },
      { method: "select", args: ["id"] },
      { method: "eq", args: ["id", "asset-1"] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("inserts the asset row with its full metadata", async () => {
    const { database, calls } = stubDatabase(row);
    await insertBrandAsset(database, {
      id: "asset-1",
      clientId: "client-1",
      name: "Primary logo",
      category: "Logo",
      description: "Light background",
      tags: ["primary", "approved"],
      mimeType: "image/png",
      storagePath: "client-1/asset-1.png",
    });
    expect(calls).toEqual([
      { method: "from", args: ["brand_assets"] },
      {
        method: "insert",
        args: [
          {
            id: "asset-1",
            client_id: "client-1",
            name: "Primary logo",
            category: "Logo",
            description: "Light background",
            tags: ["primary", "approved"],
            mime_type: "image/png",
            storage_path: "client-1/asset-1.png",
            folder_id: null,
          },
        ],
      },
      { method: "select", args: ["id"] },
      { method: "single", args: [] },
    ]);
  });

  it("removes an unregistered upload's file from the bucket", async () => {
    const { database, calls } = stubDatabase(ok);
    await removeBrandAssetFile(database, { path: "client-1/asset-1.png" });
    expect(calls).toEqual([
      { method: "storage.from", args: ["brand-assets"] },
      { method: "storage.remove", args: [["client-1/asset-1.png"]] },
    ]);
  });

  it("downloads the real file behind a stored asset", async () => {
    const blob = new Blob(["x"]);
    const { database, calls } = stubDatabase({ data: blob, error: null });
    const result = await downloadBrandAssetFile(database, { path: "client-1/asset-1.png" });
    expect(calls).toEqual([
      { method: "storage.from", args: ["brand-assets"] },
      { method: "storage.download", args: ["client-1/asset-1.png"] },
    ]);
    expect(result).toBe(blob);
  });
});

describe("template draft writes", () => {
  it("saves a draft guarded by the revision it was opened on", async () => {
    const { database, calls } = stubDatabase({
      data: { updated_at: "2026-09-20T10:00:00Z" },
      error: null,
    });
    const updatedAt = await updateTemplateDraft(database, {
      id: "draft-1",
      clientId: "client-1",
      ownerId: "owner-1",
      revision: "2026-09-19T10:00:00Z",
      name: "My draft",
      content: { headline: "Hi" } as never,
    });
    expect(calls).toEqual([
      { method: "from", args: ["template_drafts"] },
      {
        method: "update",
        args: [
          {
            name: "My draft",
            content: { headline: "Hi" },
            updated_at: expect.any(String),
          },
        ],
      },
      { method: "eq", args: ["id", "draft-1"] },
      { method: "eq", args: ["client_id", "client-1"] },
      { method: "eq", args: ["owner_id", "owner-1"] },
      { method: "eq", args: ["updated_at", "2026-09-19T10:00:00Z"] },
      { method: "select", args: ["updated_at"] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(updatedAt).toBe("2026-09-20T10:00:00Z");
  });

  it("reports a concurrent edit when no row matches the guarded revision", async () => {
    const { database } = stubDatabase({ data: null, error: null });
    await expect(
      updateTemplateDraft(database, {
        id: "draft-1",
        clientId: "client-1",
        ownerId: "owner-1",
        revision: "stale",
        name: "My draft",
        content: { headline: "Hi" } as never,
      }),
    ).rejects.toThrow("This draft changed elsewhere");
  });
});

describe("brand section writes", () => {
  it("upserts the section content keyed on client and section", async () => {
    const { database, calls } = stubDatabase({ data: { section: "colors" }, error: null });
    await saveBrandSection(database, {
      clientId: "client-1",
      section: "colors",
      content: { palette: [] },
    });
    expect(calls).toEqual([
      { method: "from", args: ["brand_sections"] },
      {
        method: "upsert",
        args: [
          {
            client_id: "client-1",
            section: "colors",
            content: { palette: [] },
            updated_at: expect.any(String),
          },
          { onConflict: "client_id,section" },
        ],
      },
      { method: "select", args: ["section"] },
      { method: "single", args: [] },
    ]);
  });
});

describe("brand write failures", () => {
  const failures: [string, (database: never) => Promise<unknown>][] = [
    [
      "uploadBrandAssetFile",
      (database) =>
        uploadBrandAssetFile(database, {
          path: "client-1/a.png",
          file: { type: "image/png" } as File,
        }),
    ],
    ["findBrandAssetById", (database) => findBrandAssetById(database, { id: "asset-1" })],
    [
      "insertBrandAsset",
      (database) =>
        insertBrandAsset(database, {
          id: "asset-1",
          clientId: "client-1",
          name: "n",
          category: "Logo",
          description: "",
          tags: [],
          mimeType: "image/png",
          storagePath: "client-1/a.png",
        }),
    ],
    [
      "removeBrandAssetFile",
      (database) => removeBrandAssetFile(database, { path: "client-1/a.png" }),
    ],
    [
      "downloadBrandAssetFile",
      (database) => downloadBrandAssetFile(database, { path: "client-1/a.png" }),
    ],
    [
      "updateTemplateDraft",
      (database) =>
        updateTemplateDraft(database, {
          id: "draft-1",
          clientId: "client-1",
          ownerId: "owner-1",
          revision: "r",
          name: "n",
          content: { headline: "Hi" } as never,
        }),
    ],
    [
      "saveBrandSection",
      (database) =>
        saveBrandSection(database, { clientId: "client-1", section: "colors", content: {} }),
    ],
  ];

  it.each(failures)("%s surfaces the database error message", async (_name, run) => {
    const { database } = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(run(database)).rejects.toThrow("permission denied");
  });
});
