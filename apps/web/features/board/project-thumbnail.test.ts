import { describe, expect, it } from "vitest";
import {
  artworkFor,
  formatTypeLabel,
  fromInternalRows,
  fromPublishedRows,
  selectProjectArtwork,
  type DeliverableArtwork,
} from "./project-thumbnail";

function deliverable(extra: Partial<DeliverableArtwork> = {}): DeliverableArtwork {
  return {
    deliverableId: "deliverable-a",
    projectId: "project-1",
    format: "feed",
    sortOrder: 0,
    versions: [],
    ...extra,
  };
}

describe("formatTypeLabel", () => {
  it("resolves a catalog id to its human name", () => {
    expect(formatTypeLabel("feed")).toBe("Portrait Feed");
    expect(formatTypeLabel("custom-mm")).toBe("Custom Print Size");
  });

  it("shows an unknown id as itself rather than dropping the label", () => {
    expect(formatTypeLabel("not-in-the-bundled-catalog")).toBe("not-in-the-bundled-catalog");
  });
});

describe("selectProjectArtwork", () => {
  it("labels the artwork with the version it actually belongs to", () => {
    const chosen = selectProjectArtwork([
      deliverable({
        versions: [
          { versionNumber: 1, designs: [{ id: "d1", sortOrder: 0, path: "project-1/one.png" }] },
          { versionNumber: 2, designs: [] },
        ],
      }),
    ]);
    // V2 exists but carries nothing, so the card shows V1's image and says V1.
    expect(chosen["project-1"]).toEqual({
      path: "project-1/one.png",
      version: 1,
      typeLabel: "Portrait Feed",
    });
  });

  it("prefers the newest version that has artwork", () => {
    const chosen = selectProjectArtwork([
      deliverable({
        versions: [
          { versionNumber: 1, designs: [{ id: "d1", sortOrder: 0, path: "project-1/one.png" }] },
          { versionNumber: 3, designs: [{ id: "d3", sortOrder: 0, path: "project-1/three.png" }] },
          { versionNumber: 2, designs: [{ id: "d2", sortOrder: 0, path: "project-1/two.png" }] },
        ],
      }),
    ]);
    expect(chosen["project-1"]).toEqual({
      path: "project-1/three.png",
      version: 3,
      typeLabel: "Portrait Feed",
    });
  });

  it("keeps the type label and drops the version when nothing has been drawn", () => {
    const chosen = selectProjectArtwork([
      deliverable({ format: "guidelines", versions: [{ versionNumber: 2, designs: [] }] }),
    ]);
    expect(chosen["project-1"]).toEqual({
      path: null,
      version: null,
      typeLabel: "Brand Guidelines",
    });
  });

  it("reads the leading deliverable by sort order, whatever order the rows arrive in", () => {
    const chosen = selectProjectArtwork([
      deliverable({
        deliverableId: "adaptation",
        format: "square",
        sortOrder: 1,
        versions: [
          { versionNumber: 5, designs: [{ id: "d5", sortOrder: 0, path: "project-1/five.png" }] },
        ],
      }),
      deliverable({
        deliverableId: "original",
        format: "feed",
        sortOrder: 0,
        versions: [
          { versionNumber: 1, designs: [{ id: "d1", sortOrder: 0, path: "project-1/one.png" }] },
        ],
      }),
    ]);
    // The adaptation's V5 is a higher number, but it counts versions of a different deliverable.
    expect(chosen["project-1"]).toEqual({
      path: "project-1/one.png",
      version: 1,
      typeLabel: "Portrait Feed",
    });
  });

  it("breaks a sort order tie by deliverable id so the card does not change its mind", () => {
    const rows = [
      deliverable({ deliverableId: "bbb", format: "square", sortOrder: 0 }),
      deliverable({ deliverableId: "aaa", format: "feed", sortOrder: 0 }),
    ];
    expect(selectProjectArtwork(rows)["project-1"].typeLabel).toBe("Portrait Feed");
    expect(selectProjectArtwork([...rows].reverse())["project-1"].typeLabel).toBe("Portrait Feed");
  });

  it("takes the first artwork of the chosen version, by sort order then id", () => {
    const chosen = selectProjectArtwork([
      deliverable({
        versions: [
          {
            versionNumber: 1,
            designs: [
              { id: "d9", sortOrder: 2, path: "project-1/third.png" },
              { id: "d2", sortOrder: 1, path: "project-1/second-b.png" },
              { id: "d1", sortOrder: 1, path: "project-1/second-a.png" },
            ],
          },
        ],
      }),
    ]);
    expect(chosen["project-1"].path).toBe("project-1/second-a.png");
  });

  it("keeps projects apart", () => {
    const chosen = selectProjectArtwork([
      deliverable({
        projectId: "project-1",
        versions: [
          { versionNumber: 2, designs: [{ id: "d2", sortOrder: 0, path: "project-1/two.png" }] },
        ],
      }),
      deliverable({ projectId: "project-2", format: "a4", versions: [] }),
    ]);
    expect(chosen["project-1"].version).toBe(2);
    expect(chosen["project-2"]).toEqual({ path: null, version: null, typeLabel: "A4" });
  });
});

describe("channel mapping", () => {
  it("reads the internal channel and leaves rows without a stored file out", () => {
    const mapped = fromInternalRows([
      {
        id: "deliverable-a",
        project_id: "project-1",
        format: "feed",
        sort_order: 0,
        design_versions: [
          {
            version_number: 2,
            designs: [
              { id: "d1", sort_order: 0, internal_asset_path: null },
              { id: "d2", sort_order: 1, internal_asset_path: "project-1/two.png" },
            ],
          },
        ],
      },
    ]);
    expect(mapped[0].versions[0].designs).toEqual([
      { id: "d2", sortOrder: 1, path: "project-1/two.png" },
    ]);
    expect(selectProjectArtwork(mapped)["project-1"]).toEqual({
      path: "project-1/two.png",
      version: 2,
      typeLabel: "Portrait Feed",
    });
  });

  it("reads the client channel from the published mirror only", () => {
    const mapped = fromPublishedRows([
      {
        id: "deliverable-a",
        project_id: "project-1",
        format: "feed",
        sort_order: 0,
        published_versions: [
          {
            version_number: 1,
            published_designs: [
              { id: "p1", sort_order: 0, asset_path: "project-1/published.png" },
              { id: "p2", sort_order: 1, asset_path: null },
            ],
          },
        ],
      },
    ]);
    expect(selectProjectArtwork(mapped)["project-1"]).toEqual({
      path: "project-1/published.png",
      version: 1,
      typeLabel: "Portrait Feed",
    });
  });

  it("returns nothing for a project whose channel is empty for this viewer", () => {
    expect(fromPublishedRows([])).toEqual([]);
    expect(selectProjectArtwork([])).toEqual({});
  });
});

describe("artworkFor", () => {
  it("reads a card that has artwork", () => {
    const map = { "project-1": { url: "https://signed", version: 3, typeLabel: "Square" } };
    expect(artworkFor(map, "project-1").version).toBe(3);
  });

  it("answers for a project the board has no entry for", () => {
    expect(artworkFor(undefined, "project-1")).toEqual({
      url: null,
      version: null,
      typeLabel: null,
    });
    expect(artworkFor({}, "project-1").typeLabel).toBeNull();
  });
});
