import { describe, expect, it } from "vitest";
import {
  artworkFor,
  formatTypeLabel,
  fromDeliverableRows,
  resolveProjectArtwork,
  type DeliverableType,
} from "./project-thumbnail";

function deliverable(extra: Partial<DeliverableType> = {}): DeliverableType {
  return {
    deliverableId: "deliverable-a",
    projectId: "project-1",
    format: "feed",
    sortOrder: 0,
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

describe("resolveProjectArtwork", () => {
  const coverPath = "project-1/cover.png";

  it("shows the signed cover with the leading deliverable's type", () => {
    const artwork = resolveProjectArtwork(
      [deliverable()],
      { "project-1": coverPath },
      new Map([[coverPath, "https://signed/cover"]]),
    );
    expect(artwork["project-1"]).toEqual({
      url: "https://signed/cover",
      typeLabel: "Portrait Feed",
    });
  });

  it("falls back to the placeholder when the cover did not sign", () => {
    const artwork = resolveProjectArtwork([deliverable()], { "project-1": coverPath }, new Map());
    expect(artwork["project-1"]).toEqual({ url: null, typeLabel: "Portrait Feed" });
  });

  it("shows the placeholder for a project without a cover", () => {
    expect(resolveProjectArtwork([deliverable()], {}, new Map())["project-1"]).toEqual({
      url: null,
      typeLabel: "Portrait Feed",
    });
  });

  it("labels the lowest sort order, ties broken by id, whatever the row order", () => {
    const rows = [
      deliverable({ deliverableId: "b", format: "square", sortOrder: 0 }),
      deliverable({ deliverableId: "a", format: "feed", sortOrder: 0 }),
      deliverable({ deliverableId: "c", format: "a4", sortOrder: 1 }),
    ];
    expect(resolveProjectArtwork(rows, {}, new Map())["project-1"].typeLabel).toBe("Portrait Feed");
    expect(resolveProjectArtwork([...rows].reverse(), {}, new Map())["project-1"].typeLabel).toBe(
      "Portrait Feed",
    );
  });

  it("keeps a cover-only entry for a project without a deliverable row", () => {
    const artwork = resolveProjectArtwork(
      [],
      { "project-1": coverPath },
      new Map([[coverPath, "https://signed/cover"]]),
    );
    expect(artwork["project-1"]).toEqual({ url: "https://signed/cover", typeLabel: null });
  });

  it("returns nothing when there is nothing to show", () => {
    expect(resolveProjectArtwork([], {}, new Map())).toEqual({});
  });
});

describe("fromDeliverableRows", () => {
  it("maps the scope columns", () => {
    expect(
      fromDeliverableRows([{ id: "d1", project_id: "project-1", format: "feed", sort_order: 2 }]),
    ).toEqual([{ deliverableId: "d1", projectId: "project-1", format: "feed", sortOrder: 2 }]);
  });
});

describe("artworkFor", () => {
  it("reads a card that has a cover", () => {
    const map = { "project-1": { url: "https://signed", typeLabel: "Square" } };
    expect(artworkFor(map, "project-1").url).toBe("https://signed");
  });

  it("answers for a project the board has no entry for", () => {
    expect(artworkFor(undefined, "project-1")).toEqual({ url: null, typeLabel: null });
    expect(artworkFor({}, "project-1").typeLabel).toBeNull();
  });
});
