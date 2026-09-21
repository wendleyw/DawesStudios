import { describe, expect, it, vi } from "vitest";
import { moveProjectPosition } from "./board-data";

function stubDatabase(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, update, eq, select, single };
}

describe("moveProjectPosition", () => {
  it("updates the project's stored board position by id", async () => {
    const database = stubDatabase({ data: { id: "project-1" }, error: null });
    await moveProjectPosition(database as never, {
      id: "project-1",
      position: { x: 120, y: 340 },
    });
    expect(database.from).toHaveBeenCalledWith("projects");
    expect(database.update).toHaveBeenCalledWith({ board_position: { x: 120, y: 340 } });
    expect(database.eq).toHaveBeenCalledWith("id", "project-1");
    expect(database.select).toHaveBeenCalledWith("id");
  });

  it("surfaces the database error message", async () => {
    const database = stubDatabase({ data: null, error: { message: "row not found" } });
    await expect(
      moveProjectPosition(database as never, { id: "project-1", position: { x: 0, y: 0 } }),
    ).rejects.toThrow("row not found");
  });
});
