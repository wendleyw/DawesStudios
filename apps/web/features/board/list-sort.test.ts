import { describe, expect, it } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";
import {
  LIST_SORT_OPTIONS,
  listSortAccessibleName,
  listSortFromOptionValue,
  listSortOptionValue,
  nextListSort,
  sortProjects,
} from "./list-sort";

function project(overrides: Partial<Project> & { id: string; title: string }): Project {
  return {
    client_id: "client",
    campaign_id: null,
    briefing_id: null,
    description: "",
    status: "planned",
    service_type: "",
    due_date: null,
    start_date: null,
    board_position: { x: 0, y: 0 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const campaignName = (id: string | null) =>
  id === "camp-a" ? "Alpha launch" : id === "camp-b" ? "Beta launch" : "Studio projects";

describe("sortProjects", () => {
  it("keeps today's order when nothing has been sorted", () => {
    const projects = [project({ id: "1", title: "Zebra" }), project({ id: "2", title: "Apple" })];
    expect(sortProjects(projects, null, campaignName)).toEqual(projects);
  });

  it("does not mutate the input array", () => {
    const projects = [project({ id: "1", title: "Zebra" }), project({ id: "2", title: "Apple" })];
    const copy = [...projects];
    sortProjects(projects, { key: "project", direction: "asc" }, campaignName);
    expect(projects).toEqual(copy);
  });

  it("sorts by project title A-Z and reverses it", () => {
    const projects = [
      project({ id: "1", title: "banana" }),
      project({ id: "2", title: "Apple" }),
      project({ id: "3", title: "cherry" }),
    ];
    expect(
      sortProjects(projects, { key: "project", direction: "asc" }, campaignName).map((p) => p.id),
    ).toEqual(["2", "1", "3"]);
    expect(
      sortProjects(projects, { key: "project", direction: "desc" }, campaignName).map((p) => p.id),
    ).toEqual(["3", "1", "2"]);
  });

  it("sorts by campaign name and breaks ties by title", () => {
    const projects = [
      project({ id: "1", title: "B project", campaign_id: "camp-b" }),
      project({ id: "2", title: "Z project", campaign_id: "camp-a" }),
      project({ id: "3", title: "A project", campaign_id: "camp-a" }),
      project({ id: "4", title: "No campaign", campaign_id: null }),
    ];
    expect(
      sortProjects(projects, { key: "campaign", direction: "asc" }, campaignName).map((p) => p.id),
    ).toEqual(["3", "2", "1", "4"]);
    expect(
      sortProjects(projects, { key: "campaign", direction: "desc" }, campaignName).map((p) => p.id),
    ).toEqual(["4", "1", "3", "2"]);
  });

  it("sorts by status workflow order and reverses it", () => {
    const projects = [
      project({ id: "1", title: "B", status: "delivered" }),
      project({ id: "2", title: "A", status: "planned" }),
      project({ id: "3", title: "C", status: "in_progress" }),
    ];
    expect(
      sortProjects(projects, { key: "status", direction: "asc" }, campaignName).map((p) => p.id),
    ).toEqual(["2", "3", "1"]);
    expect(
      sortProjects(projects, { key: "status", direction: "desc" }, campaignName).map((p) => p.id),
    ).toEqual(["1", "3", "2"]);
  });

  it("breaks status ties by title", () => {
    const projects = [
      project({ id: "1", title: "Zebra", status: "planned" }),
      project({ id: "2", title: "Apple", status: "planned" }),
    ];
    expect(
      sortProjects(projects, { key: "status", direction: "asc" }, campaignName).map((p) => p.id),
    ).toEqual(["2", "1"]);
  });

  it("sorts by due date earliest/latest first and breaks ties by title", () => {
    const projects = [
      project({ id: "1", title: "B", due_date: "2026-03-01" }),
      project({ id: "2", title: "A", due_date: "2026-01-01" }),
      project({ id: "3", title: "Z", due_date: "2026-01-01" }),
    ];
    expect(
      sortProjects(projects, { key: "due", direction: "asc" }, campaignName).map((p) => p.id),
    ).toEqual(["2", "3", "1"]);
    expect(
      sortProjects(projects, { key: "due", direction: "desc" }, campaignName).map((p) => p.id),
    ).toEqual(["1", "2", "3"]);
  });

  it("always sends projects without a due date last, in both directions", () => {
    const projects = [
      project({ id: "1", title: "Has date", due_date: "2026-01-01" }),
      project({ id: "2", title: "No date A", due_date: null }),
      project({ id: "3", title: "No date B", due_date: null }),
    ];
    expect(
      sortProjects(projects, { key: "due", direction: "asc" }, campaignName).map((p) => p.id),
    ).toEqual(["1", "2", "3"]);
    expect(
      sortProjects(projects, { key: "due", direction: "desc" }, campaignName).map((p) => p.id),
    ).toEqual(["1", "2", "3"]);
  });
});

describe("nextListSort", () => {
  it("sorts a newly clicked column ascending", () => {
    expect(nextListSort(null, "due")).toEqual({ key: "due", direction: "asc" });
    expect(nextListSort({ key: "project", direction: "desc" }, "status")).toEqual({
      key: "status",
      direction: "asc",
    });
  });

  it("reverses the active column on a second click", () => {
    expect(nextListSort({ key: "due", direction: "asc" }, "due")).toEqual({
      key: "due",
      direction: "desc",
    });
    expect(nextListSort({ key: "due", direction: "desc" }, "due")).toEqual({
      key: "due",
      direction: "asc",
    });
  });
});

describe("listSortAccessibleName", () => {
  it("is just the column name until it is the active column", () => {
    expect(listSortAccessibleName("project", null)).toBe("Project");
    expect(listSortAccessibleName("due", { key: "status", direction: "asc" })).toBe("Due");
  });

  it("states direction once a column is active", () => {
    expect(listSortAccessibleName("due", { key: "due", direction: "asc" })).toBe(
      "Due, earliest first",
    );
    expect(listSortAccessibleName("due", { key: "due", direction: "desc" })).toBe(
      "Due, latest first",
    );
    expect(listSortAccessibleName("project", { key: "project", direction: "asc" })).toBe(
      "Project, A to Z",
    );
    expect(listSortAccessibleName("project", { key: "project", direction: "desc" })).toBe(
      "Project, Z to A",
    );
    expect(listSortAccessibleName("campaign", { key: "campaign", direction: "asc" })).toBe(
      "Campaign, A to Z",
    );
    expect(listSortAccessibleName("status", { key: "status", direction: "asc" })).toBe(
      "Status, workflow order",
    );
    expect(listSortAccessibleName("status", { key: "status", direction: "desc" })).toBe(
      "Status, reverse workflow order",
    );
  });
});

describe("list sort select options", () => {
  it("round-trips every option through its value", () => {
    for (const option of LIST_SORT_OPTIONS) {
      expect(listSortFromOptionValue(option.value)).toEqual(option.sort);
      expect(listSortOptionValue(option.sort)).toBe(option.value);
    }
  });

  it("falls back to the default order for an unrecognized value", () => {
    expect(listSortFromOptionValue("nonsense")).toBeNull();
  });
});
