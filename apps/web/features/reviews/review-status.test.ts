import { describe, expect, it } from "vitest";
import { versionStatusLabels } from "@/features/workspace/workspace-data";
import { inReviewTab, isFinished, publishedVersionStatus } from "./review-data";

describe("which version statuses are finished", () => {
  /**
   * Asserted over `versionStatusLabels` rather than a hand-written list, so a status added to the
   * enum cannot quietly default to one bucket or the other.
   */
  it("counts only an approved version as finished", () => {
    const buckets = Object.fromEntries(
      Object.keys(versionStatusLabels).map((status) => [status, isFinished(status)]),
    );
    expect(buckets).toEqual({
      draft: false,
      submitted: false,
      reviewed: false,
      pending: false,
      approved: true,
      changes_requested: false,
    });
  });

  /**
   * `reviewed` is the status a version keeps after the client rejects it, so reading it as finished
   * filed rejected work under "Approved — Shared with client" for the designer who had to revise it.
   */
  it("does not read a version merely shared with the client as finished", () => {
    expect(isFinished("reviewed")).toBe(false);
    expect(versionStatusLabels.reviewed).toBe("Shared");
  });
});

describe("a published version's outcome, read from its project", () => {
  it("reads a rejected publication as changes requested", () => {
    expect(publishedVersionStatus("reviewed", "changes_requested")).toBe("changes_requested");
    expect(isFinished(publishedVersionStatus("reviewed", "changes_requested"))).toBe(false);
  });

  it("stays shared with the client while the client is still deciding", () => {
    expect(publishedVersionStatus("reviewed", "client_review")).toBe("reviewed");
    expect(publishedVersionStatus("reviewed", "internal_review")).toBe("reviewed");
  });

  it("reads an accepted or delivered project's publication as approved", () => {
    expect(publishedVersionStatus("reviewed", "approved")).toBe("approved");
    expect(publishedVersionStatus("reviewed", "delivered")).toBe("approved");
    expect(isFinished(publishedVersionStatus("reviewed", "approved"))).toBe(true);
  });

  it("leaves a version that was never published alone", () => {
    for (const status of ["draft", "submitted", "pending", "approved", "changes_requested"])
      expect(publishedVersionStatus(status, "changes_requested")).toBe(status);
  });
});

describe("which rows each review tab shows", () => {
  const row = (status: string, internal = false) => ({ status, internal });

  it("shows a client only the versions still waiting on their decision under Waiting for you", () => {
    expect(inReviewTab("waiting", row("pending"), "client")).toBe(true);
    expect(inReviewTab("waiting", row("changes_requested"), "client")).toBe(false);
    expect(inReviewTab("waiting", row("approved"), "client")).toBe(false);
  });

  it("files a version the client sent back under With the studio", () => {
    expect(inReviewTab("with-studio", row("changes_requested"), "client")).toBe(true);
    expect(inReviewTab("with-studio", row("pending"), "client")).toBe(false);
  });

  it("keeps the agency's In review tab for every published version not yet approved", () => {
    expect(inReviewTab("waiting", row("pending"), "agency")).toBe(true);
    expect(inReviewTab("waiting", row("changes_requested"), "agency")).toBe(true);
    expect(inReviewTab("waiting", row("submitted", true), "agency")).toBe(false);
    expect(inReviewTab("studio", row("submitted", true), "agency")).toBe(true);
  });

  it("keeps a designer's own unfinished versions under In progress", () => {
    expect(inReviewTab("waiting", row("submitted", true), "designer")).toBe(true);
    expect(inReviewTab("waiting", row("changes_requested"), "designer")).toBe(true);
    expect(inReviewTab("approved", row("approved"), "designer")).toBe(true);
  });
});
