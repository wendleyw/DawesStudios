import { describe, expect, it, vi } from "vitest";
import { discardUnreferencedArtwork } from "./artwork-files";

type Result = { data: unknown; error: { message: string } | null };

function stubDatabase(rows: Result, removal: Result = { data: [], error: null }) {
  const eq = vi.fn().mockResolvedValue(rows);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const remove = vi.fn().mockResolvedValue(removal);
  const bucket = vi.fn().mockReturnValue({ remove });
  return {
    database: { from, storage: { from: bucket } } as never,
    from,
    select,
    eq,
    bucket,
    remove,
  };
}

describe("discardUnreferencedArtwork", () => {
  it("removes an upload no design references", async () => {
    const stub = stubDatabase({ data: [], error: null });
    await discardUnreferencedArtwork(stub.database, "project-1/artwork.png");
    expect(stub.from).toHaveBeenCalledWith("designs");
    expect(stub.select).toHaveBeenCalledWith("id");
    expect(stub.eq).toHaveBeenCalledWith("internal_asset_path", "project-1/artwork.png");
    expect(stub.bucket).toHaveBeenCalledWith("internal-assets");
    expect(stub.remove).toHaveBeenCalledWith(["project-1/artwork.png"]);
  });

  it("keeps an upload a design already points at", async () => {
    const stub = stubDatabase({ data: [{ id: "design-1" }], error: null });
    await discardUnreferencedArtwork(stub.database, "project-1/artwork.png");
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it("surfaces the database error message", async () => {
    const stub = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(
      discardUnreferencedArtwork(stub.database, "project-1/artwork.png"),
    ).rejects.toThrow("permission denied");
  });

  it("surfaces a storage error message", async () => {
    const stub = stubDatabase(
      { data: [], error: null },
      { data: null, error: { message: "object not found" } },
    );
    await expect(
      discardUnreferencedArtwork(stub.database, "project-1/artwork.png"),
    ).rejects.toThrow("object not found");
  });
});
