import { describe, expect, it } from "vitest";
import { versionGroupKey } from "./version-row";

describe("versionGroupKey", () => {
  it("groups a round by its board and a client version by its project", () => {
    expect(versionGroupKey({ board_id: "b", project_id: "p" })).toBe("board:b");
    expect(versionGroupKey({ board_id: null, project_id: "p" })).toBe("project:p");
    expect(versionGroupKey({ project_id: "p" })).toBe("project:p");
  });
});
