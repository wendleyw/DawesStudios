import { describe, expect, it } from "vitest";
import {
  createDateFormatters,
  statusLabels,
  versionStatusLabel,
  versionStatusLabels,
  type VersionStatus,
} from "./workspace-data";

/**
 * The two vocabularies a version is read through, taken from the database rather than from the
 * component that renders them:
 *
 * - `design_versions.status text not null default 'draft' check(status in ('draft','submitted','reviewed'))`
 * - `publication_reviews.status text not null default 'pending' check(status in ('pending','approved','changes_requested'))`
 *
 * (`supabase/migrations/202609200001_foundation.sql:75` and `:111`.) Both reach the project canvas,
 * the version history and the reviews list, so a label map that covers one of them is the state
 * this file exists to prevent.
 */
const databaseVersionStatuses = [
  "draft",
  "submitted",
  "reviewed",
  "pending",
  "approved",
  "changes_requested",
] as const;

describe("versionStatusLabels", () => {
  it("names every status either version table may hold", () => {
    expect(Object.keys(versionStatusLabels).toSorted()).toEqual(
      [...databaseVersionStatuses].toSorted(),
    );
    for (const status of databaseVersionStatuses)
      expect(versionStatusLabels[status]).toMatch(/^[A-Z]/);
  });

  it("speaks the same vocabulary as the project status a version moves", () => {
    // A version submitted to the studio and a project in studio review are one moment in the
    // workflow; the canvas showed the bare token `submitted` beside the badge `Studio review`.
    expect(versionStatusLabels.submitted).toBe(statusLabels.internal_review);
    expect(versionStatusLabels.pending).toBe(statusLabels.client_review);
    expect(versionStatusLabels.approved).toBe(statusLabels.approved);
    expect(versionStatusLabels.changes_requested).toBe(statusLabels.changes_requested);
  });

  it("reads one way for one state, whatever surface asks", () => {
    const status: VersionStatus = "changes_requested";
    expect(versionStatusLabel(status)).toBe("Changes requested");
    expect(versionStatusLabel(status)).toBe(versionStatusLabels.changes_requested);
  });

  it("still returns a word for a status this build does not name", () => {
    expect(versionStatusLabel("withdrawn_by_studio")).toBe("withdrawn by studio");
  });
});

describe("createDateFormatters", () => {
  const studio = createDateFormatters("America/Sao_Paulo");
  const utc = createDateFormatters("UTC");

  it("reads an instant in the studio's timezone", () => {
    // 02:00Z is the previous evening in São Paulo: the notifications page was the only surface that
    // said so, while the comment created by the same action said the next day.
    expect(studio.formatDate("2026-09-21T02:00:00.000Z")).toBe("Sep 20");
    expect(studio.formatDateTime("2026-09-21T02:00:00.000Z")).toBe("Sep 20, 2026, 11:00 PM");
    expect(utc.formatDate("2026-09-21T02:00:00.000Z")).toBe("Sep 21");
  });

  it("leaves a calendar date on the day it names", () => {
    // A due date is a day, not an instant; reading it in a western zone would move it a day back.
    expect(studio.formatDate("2026-09-21")).toBe("Sep 21");
    expect(studio.formatDateLong("2026-09-21")).toBe("Sep 21, 2026");
    expect(studio.formatMonth("2026-09-01")).toBe("September 2026");
    expect(studio.formatWeekdayDate("2026-09-21")).toBe("Monday, September 21");
  });

  it("names the missing value the way the surface asking for it would", () => {
    expect(studio.formatDate(null)).toBe("No date");
    expect(studio.formatDate(null, "No due date")).toBe("No due date");
    expect(studio.formatDate("not a date", "To be planned")).toBe("To be planned");
  });
});
