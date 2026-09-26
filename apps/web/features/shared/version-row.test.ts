import { describe, expect, it } from "vitest";
import { versionGroupKey } from "./version-row";

describe("versionGroupKey", () => {
  it("groups by deliverable, then board, then project", () => {
    expect(versionGroupKey({ deliverable_id: "d", board_id: null, project_id: "p" })).toBe("d");
    expect(versionGroupKey({ deliverable_id: null, board_id: "b", project_id: "p" })).toBe(
      "board:b",
    );
    expect(versionGroupKey({ deliverable_id: null, project_id: "p" })).toBe("project:p");
  });
});
