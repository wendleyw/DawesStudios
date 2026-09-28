import { describe, expect, it } from "vitest";
import type { Database } from "@database";
import { latestMiroLink, toCanvasVersions } from "./project-data";

type Row<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];

const internalVersion: Row<"design_versions"> = {
  id: "11111111-1111-1111-1111-111111111111",
  project_id: "project-1",
  board_id: "board-1",
  request_key: null,
  work_request_id: null,
  assignment_generation: 1,
  version_number: 1,
  notes: "V1 explores two square directions.",
  status: "reviewed",
  created_by: "designer-1",
  created_at: "2026-09-21T10:00:00.000Z",
};

const publishedVersion: Row<"published_versions"> = {
  id: "22222222-2222-2222-2222-222222222222",
  project_id: "project-1",
  version_number: 1,
  release_note: "First round for review.",
  published_at: "2026-09-21T11:00:00.000Z",
};

const review = (
  publicationId: string,
  reviewedBy: string | null = null,
): Row<"publication_reviews"> => ({
  id: "review-1",
  project_id: "project-1",
  publication_id: publicationId,
  status: "changes_requested",
  feedback: "Please give the headline more breathing room.",
  reviewed_at: "2026-09-21T12:00:00.000Z",
  reviewed_by: reviewedBy,
  review_revision: 1,
});

describe("canvas versions and their client review", () => {
  it("matches a client-channel version to its review by publication id", () => {
    const [version] = toCanvasVersions([publishedVersion], [review(publishedVersion.id)], true);
    expect(version.status).toBe("changes_requested");
    expect(version.feedback).toBe("Please give the headline more breathing room.");
    expect(version.note).toBe("First round for review.");
    expect(version.date).toBe("2026-09-21T11:00:00.000Z");
  });

  it("reads a client-channel version with no review yet as pending, with no feedback", () => {
    const [version] = toCanvasVersions([publishedVersion], [], true);
    expect(version.status).toBe("pending");
    expect(version.feedback).toBeUndefined();
  });

  /**
   * The id spaces are disjoint in the database, so the fixture forges the collision the production
   * comparison silently relied on: a review row whose `publication_id` is an internal
   * `design_versions` id. Nothing may come of it. `publication_reviews.publication_id` references
   * `published_versions.id`; an internal version reaches its publication only through
   * `private.publication_sources`, a table in a schema no API request can read, so the internal
   * channel has no review to attach and must never pick one up by id equality.
   */
  it("never attaches a publication review to an internal version, even on an id collision", () => {
    const [version] = toCanvasVersions([internalVersion], [review(internalVersion.id)], false);
    expect(version.feedback).toBeUndefined();
    expect(version.status).toBe("reviewed");
  });

  it("reads an internal version's own status, note and date", () => {
    const [version] = toCanvasVersions([internalVersion], [], false);
    expect(version).toEqual({
      id: internalVersion.id,
      projectId: "project-1",
      boardId: "board-1",
      number: 1,
      note: "V1 explores two square directions.",
      status: "reviewed",
      date: "2026-09-21T10:00:00.000Z",
      feedback: undefined,
      miro: null,
    });
  });

  it("carries who decided on a client-channel version, and when", () => {
    const [version] = toCanvasVersions(
      [publishedVersion],
      [review(publishedVersion.id, "ana")],
      true,
    );
    expect(version.reviewedBy).toBe("ana");
    expect(version.reviewedAt).toBe("2026-09-21T12:00:00.000Z");
  });

  it("never gives an internal version a reviewer, even on an id collision", () => {
    const [version] = toCanvasVersions(
      [internalVersion],
      [review(internalVersion.id, "ana")],
      false,
    );
    expect(version.reviewedBy).toBeUndefined();
    expect(version.reviewedAt).toBeUndefined();
  });
});

describe("Miro links on canvas versions", () => {
  it("attaches the link whose version id matches", () => {
    const [version] = toCanvasVersions([publishedVersion], [], true, [
      { versionId: publishedVersion.id, boardId: "uXjVKabc123=", widgetId: "345" },
    ]);
    expect(version.miro).toEqual({ boardId: "uXjVKabc123=", widgetId: "345" });
  });

  it("leaves a version without a link at null", () => {
    const [version] = toCanvasVersions([internalVersion], [], false, [
      { versionId: "another", boardId: "uXjVKabc123=", widgetId: null },
    ]);
    expect(version.miro).toBeNull();
  });
});

describe("project-level versions", () => {
  it("maps a round's board and leaves a client version without one", () => {
    const round = {
      id: "r1",
      project_id: "p",
      board_id: "b1",
      version_number: 1,
      notes: "First pass",
      status: "submitted",
      created_at: "2026-09-26T12:00:00Z",
      created_by: "d",
      request_key: null,
    };
    const [version] = toCanvasVersions([round], [], false);
    expect(version.boardId).toBe("b1");
    const [shared] = toCanvasVersions([publishedVersion], [], true);
    expect(shared.boardId).toBeNull();
  });
});

describe("latestMiroLink", () => {
  const links = [
    { versionId: "v1", boardId: "uXjVBoard01=", widgetId: "1" },
    { versionId: "v2", boardId: "uXjVBoard01=", widgetId: "2" },
  ];
  const versions = [
    { id: "v1", number: 1 },
    { id: "v2", number: 2 },
    { id: "v3", number: 3 },
  ];

  it("takes the newest version that has a link", () => {
    expect(latestMiroLink(versions, links)).toEqual({ boardId: "uXjVBoard01=", widgetId: "2" });
  });

  it("skips the version being edited", () => {
    expect(latestMiroLink(versions, links, "v2")).toEqual({
      boardId: "uXjVBoard01=",
      widgetId: "1",
    });
  });

  it("is null when no version has a link", () => {
    expect(latestMiroLink(versions, [])).toBeNull();
  });
});
