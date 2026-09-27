import { describe, expect, it } from "vitest";
import type { CanvasVersion } from "./project-data";
import {
  boardRounds,
  canReviewShared,
  latestSharedLink,
  pickById,
  sharedVersions,
} from "./miro-workspace";

const link = (widgetId: string) => ({ boardId: "uXjVBoard01=", widgetId });
function v(partial: Partial<CanvasVersion> & { id: string; number: number }): CanvasVersion {
  return {
    projectId: "p",
    deliverableId: null,
    boardId: null,
    note: "",
    status: "pending",
    date: `2026-09-${String(partial.number).padStart(2, "0")}`,
    miro: link(String(partial.number)),
    ...partial,
  };
}

describe("boardRounds and sharedVersions", () => {
  const versions = [
    v({ id: "r1", number: 1, boardId: "b1", status: "submitted" }),
    v({ id: "r2", number: 2, boardId: "b1", status: "submitted" }),
    v({ id: "rx", number: 1, boardId: "b2" }),
    v({ id: "s1", number: 1 }),
    v({ id: "s2", number: 2 }),
    v({ id: "legacy", number: 3, deliverableId: "d" }),
  ];
  it("lists a board's rounds newest first", () => {
    expect(boardRounds(versions, "b1").map((item) => item.id)).toEqual(["r2", "r1"]);
  });
  it("lists project-level client versions newest first", () => {
    expect(sharedVersions(versions).map((item) => item.id)).toEqual(["s2", "s1"]);
  });
  it("picks the requested item or the first", () => {
    expect(pickById(sharedVersions(versions), "s1")?.id).toBe("s1");
    expect(pickById(sharedVersions(versions), "gone")?.id).toBe("s2");
    expect(pickById([], null)).toBeNull();
  });
  it("prefills from the newest shared link", () => {
    expect(latestSharedLink(sharedVersions(versions))).toEqual(link("2"));
    expect(latestSharedLink([])).toBeNull();
  });
});

describe("canReviewShared", () => {
  const shared = [v({ id: "s2", number: 2 }), v({ id: "s1", number: 1 })];
  it("lets a client decide only on the latest pending version before delivery", () => {
    expect(canReviewShared(shared[0], shared, "client", "client_review")).toBe(true);
    expect(canReviewShared(shared[1], shared, "client", "client_review")).toBe(false);
    expect(canReviewShared(shared[0], shared, "agency", "client_review")).toBe(false);
    expect(canReviewShared(shared[0], shared, "client", "delivered")).toBe(false);
    expect(
      canReviewShared({ ...shared[0], status: "approved" }, shared, "client", "approved"),
    ).toBe(false);
  });
});
