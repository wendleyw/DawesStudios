import { describe, expect, it } from "vitest";
import type { CreditEntry } from "@/features/credits/credit-model";
import type { ReviewRow } from "@/features/reviews/review-data";
import { createDateFormatters, type Project } from "@/features/workspace/workspace-data";
import {
  bySoonestDue,
  clientOverview,
  deliveredOn,
  designerOverview,
  designerVersions,
  relativeAge,
} from "./overview-model";

const now = new Date("2026-09-25T15:00:00Z");
const { formatMonth } = createDateFormatters("America/New_York");

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? "p1",
    client_id: "c1",
    campaign_id: null,
    briefing_id: null,
    title: overrides.title ?? "Project",
    description: "",
    status: "in_progress",
    service_type: "social",
    due_date: null,
    delivered_at: null,
    start_date: null,
    board_position: { x: 0, y: 0 },
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: overrides.id ?? "v1",
    projectId: "p1",
    title: "Project",
    deliverable: "Portrait Feed",
    version: 1,
    status: "pending",
    date: "2026-09-20T00:00:00Z",
    note: null,
    internal: false,
    ...overrides,
  };
}

function debit(projectId: string, amount: number): CreditEntry {
  return {
    id: `d-${projectId}`,
    client_id: "c1",
    project_id: projectId,
    amount: -amount,
    balance_after: 0,
    kind: "project_debit",
    description: "",
    created_at: "2026-09-01T00:00:00Z",
  };
}

describe("relativeAge", () => {
  // The studio is in New York; `now` sits at 09:00 EDT, so a UTC instant close to midnight can name
  // a different calendar day there than a raw 24-hour-block count would give.
  const { formatDayKey } = createDateFormatters("America/New_York");
  const nowInStudio = new Date("2026-09-25T13:00:00Z");

  it("counts calendar days in the studio time zone, not elapsed 24-hour blocks", () => {
    expect(relativeAge("2026-09-25T04:30:00Z", nowInStudio, formatDayKey)).toBe("today");
    expect(relativeAge("2026-09-25T00:30:00Z", nowInStudio, formatDayKey)).toBe("yesterday");
    expect(relativeAge("2026-09-23T14:00:00Z", nowInStudio, formatDayKey)).toBe("2 days ago");
    expect(relativeAge("2026-09-17T12:00:00Z", nowInStudio, formatDayKey)).toBe("last week");
  });

  it("names how long ago a date was", () => {
    expect(relativeAge("2026-09-08T12:00:00Z", nowInStudio, formatDayKey)).toBe("2 weeks ago");
    expect(relativeAge("2026-08-20T12:00:00Z", nowInStudio, formatDayKey)).toBe("last month");
    expect(relativeAge("2026-07-20T12:00:00Z", nowInStudio, formatDayKey)).toBe("2 months ago");
    expect(relativeAge("2025-09-01T12:00:00Z", nowInStudio, formatDayKey)).toBe("last year");
  });

  it("never reads a future instant as ahead", () => {
    expect(relativeAge("2026-09-26T12:00:00Z", nowInStudio, formatDayKey)).toBe("today");
  });
});

describe("deliveredOn", () => {
  it("prefers the delivery instant and falls back to the last update", () => {
    expect(deliveredOn(project({ delivered_at: "2026-09-10T00:00:00Z" }))).toBe(
      "2026-09-10T00:00:00Z",
    );
    expect(deliveredOn(project({ updated_at: "2026-08-02T00:00:00Z" }))).toBe(
      "2026-08-02T00:00:00Z",
    );
  });
});

describe("bySoonestDue", () => {
  it("orders by due date and puts undated work last, newest first", () => {
    const list = [
      project({ id: "none-old", created_at: "2026-01-01T00:00:00Z" }),
      project({ id: "late", due_date: "2026-10-20" }),
      project({ id: "none-new", created_at: "2026-09-01T00:00:00Z" }),
      project({ id: "soon", due_date: "2026-09-30" }),
    ];
    expect(list.toSorted(bySoonestDue).map((item) => item.id)).toEqual([
      "soon",
      "late",
      "none-new",
      "none-old",
    ]);
  });
});

describe("clientOverview", () => {
  const input = {
    projects: [
      project({ id: "a", status: "in_progress", due_date: "2026-10-01" }),
      project({ id: "b", status: "client_review", due_date: "2026-09-28" }),
      project({ id: "c", status: "delivered", delivered_at: "2026-09-03T12:00:00Z" }),
      // 02:00 UTC on Sep 1 is still August 31 in New York.
      project({ id: "d", status: "delivered", delivered_at: "2026-09-01T02:00:00Z" }),
    ],
    briefings: [{ status: "awaiting_review" }, { status: "budget_confirmed" }, { status: "draft" }],
    ledger: [debit("a", 12), debit("c", 3)],
    balance: 85,
    reviews: [
      review({ id: "wait-new", date: "2026-09-24T00:00:00Z" }),
      review({ id: "wait-old", date: "2026-09-10T00:00:00Z" }),
      review({ id: "internal", status: "pending", internal: true }),
      review({ id: "sent-back", status: "changes_requested" }),
    ],
    now,
    formatMonth,
  };

  it("counts credits, active work, this month's deliveries and waiting reviews", () => {
    const overview = clientOverview(input);
    expect(overview.credits).toEqual({ remaining: 85, used: 15, total: 100 });
    expect(overview.active).toBe(2);
    expect(overview.deliveredThisMonth).toBe(1);
    expect(overview.needsReview).toBe(2);
    expect(overview.inFlight).toEqual({ withStudio: 2, inProgress: 1, delivered: 2 });
    expect(overview.creditsByProject.get("a")).toBe(12);
  });

  it("orders each column and keeps internal rows out", () => {
    const overview = clientOverview(input);
    expect(overview.moving.map((item) => item.id)).toEqual(["b", "a"]);
    expect(overview.yourTurn.map((row) => row.id)).toEqual(["wait-old", "wait-new"]);
    expect(overview.shipped.map((item) => item.id)).toEqual(["c", "d"]);
  });

  it("shows at most five rows per column", () => {
    const many = Array.from({ length: 8 }, (_, index) => project({ id: `p${index}` }));
    expect(clientOverview({ ...input, projects: many }).moving).toHaveLength(5);
  });
});

describe("designerVersions and designerOverview", () => {
  const projects = [
    project({ id: "p1", title: "Launch", status: "changes_requested", due_date: "2026-10-02" }),
    project({ id: "p2", title: "Guide", status: "internal_review" }),
    project({
      id: "p3",
      title: "Poster",
      status: "delivered",
      delivered_at: "2026-09-12T00:00:00Z",
    }),
  ];
  const raw = [
    {
      id: "v1",
      project_id: "p1",
      deliverable_id: "d1",
      version_number: 1,
      status: "approved",
      created_at: "2026-09-01T00:00:00Z",
    },
    // The client sent the project back after this version was shared.
    {
      id: "v2",
      project_id: "p1",
      deliverable_id: "d1",
      version_number: 2,
      status: "reviewed",
      created_at: "2026-09-20T00:00:00Z",
    },
    {
      id: "v3",
      project_id: "p2",
      deliverable_id: "d2",
      version_number: 1,
      status: "submitted",
      created_at: "2026-09-22T00:00:00Z",
    },
  ];
  const deliverables = [
    { id: "d1", name: "Portrait Feed" },
    { id: "d2", name: "Story" },
  ];

  it("keeps each deliverable's latest version and reads a sent-back share as changes requested", () => {
    expect(designerVersions(raw, deliverables, projects)).toEqual([
      {
        id: "v2",
        projectId: "p1",
        title: "Launch",
        deliverable: "Portrait Feed",
        version: 2,
        status: "changes_requested",
        date: "2026-09-20T00:00:00Z",
      },
      {
        id: "v3",
        projectId: "p2",
        title: "Guide",
        deliverable: "Story",
        version: 1,
        status: "submitted",
        date: "2026-09-22T00:00:00Z",
      },
    ]);
  });

  it("counts the designer's work", () => {
    const overview = designerOverview({
      projects,
      versions: designerVersions(raw, deliverables, projects),
      now,
      formatMonth,
    });
    expect(overview).toMatchObject({
      active: 2,
      yourTurn: 1,
      inStudioReview: 1,
      deliveredThisMonth: 1,
    });
    expect(overview.moving.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(overview.yourTurnRows.map((row) => row.id)).toEqual(["v2"]);
    expect(overview.delivered.map((item) => item.id)).toEqual(["p3"]);
  });
});
