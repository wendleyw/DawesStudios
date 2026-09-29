import { describe, expect, it } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";
import { dueRange, groupProjects, isOverdue, statusSegments } from "./list-groups";

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    client_id: "client",
    campaign_id: null,
    briefing_id: null,
    title: overrides.id,
    description: "",
    status: "planned",
    service_type: "",
    due_date: null,
    delivered_at: null,
    start_date: null,
    board_position: { x: 0, y: 0 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupProjects", () => {
  it("splits delivered work from the rest and keeps the caller's order", () => {
    const groups = groupProjects([
      project({ id: "c", status: "delivered" }),
      project({ id: "b", status: "client_review" }),
      project({ id: "a", status: "delivered" }),
      project({ id: "d" }),
    ]);
    expect(groups.map((group) => [group.key, group.projects.map((p) => p.id)])).toEqual([
      ["active", ["b", "d"]],
      ["delivered", ["c", "a"]],
    ]);
  });

  it("always returns both groups, even when one is empty", () => {
    expect(groupProjects([project({ id: "a" })]).map((group) => group.projects.length)).toEqual([
      1, 0,
    ]);
  });
});

describe("isOverdue", () => {
  it("flags only dated, undelivered work due before today", () => {
    expect(isOverdue(project({ id: "a", due_date: "2026-09-27" }), "2026-09-28")).toBe(true);
    expect(isOverdue(project({ id: "a", due_date: "2026-09-28" }), "2026-09-28")).toBe(false);
    expect(isOverdue(project({ id: "a" }), "2026-09-28")).toBe(false);
    expect(
      isOverdue(project({ id: "a", due_date: "2026-09-01", status: "delivered" }), "2026-09-28"),
    ).toBe(false);
  });
});

describe("statusSegments", () => {
  it("counts each public label once, in first-seen order", () => {
    const segments = statusSegments([
      project({ id: "a", status: "client_review" }),
      project({ id: "b", status: "in_progress" }),
      project({ id: "c", status: "internal_review" }),
      project({ id: "d", status: "client_review" }),
    ]);
    // Studio review reads as In progress publicly, so it joins that segment.
    expect(segments.map(({ label, count }) => [label, count])).toEqual([
      ["In review", 2],
      ["In progress", 2],
    ]);
  });
});

describe("dueRange", () => {
  it("spans the earliest and latest dated project", () => {
    expect(
      dueRange([
        project({ id: "a", due_date: "2026-09-29" }),
        project({ id: "b" }),
        project({ id: "c", due_date: "2026-09-27" }),
      ]),
    ).toEqual({ from: "2026-09-27", to: "2026-09-29" });
  });

  it("is null when nothing has a date", () => {
    expect(dueRange([project({ id: "a" })])).toBeNull();
  });
});
