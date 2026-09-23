import { describe, expect, it } from "vitest";
import {
  batchPosition,
  itemInput,
  mergePlaygroundDrafts,
  playgroundFormats,
  playgroundStorageName,
  preparePlaygroundFile,
  validatePlaygroundItem,
  type PlaygroundDraft,
} from "./playground-model";
import {
  PLAYGROUND_FILE_MIMES,
  PLAYGROUND_MAX_FILE_BYTES,
  type PlaygroundItem,
} from "./playground-types";

const saved: PlaygroundItem = {
  id: "item",
  board_id: "board",
  kind: "note",
  title: "Saved note",
  body: "Original",
  asset_path: null,
  mime_type: null,
  x: 20,
  y: 40,
  width: 280,
  height: 220,
  revision: 1,
};

describe("Playground file validation", () => {
  it("covers the complete backend MIME contract", () => {
    expect(Object.keys(playgroundFormats).sort()).toEqual([...PLAYGROUND_FILE_MIMES].sort());
  });
  it("infers an Office type only when the picker supplied no useful MIME", () => {
    const file = new File(["office"], "Brief.DOCX", { type: "application/octet-stream" });
    expect(preparePlaygroundFile(file).type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(() =>
      preparePlaygroundFile(new File(["code"], "brief.docx", { type: "text/html" })),
    ).toThrow("Choose a PNG");
  });
  it("rejects empty, oversized, and mismatched files before transfer", () => {
    expect(() => preparePlaygroundFile(new File([], "empty.txt", { type: "text/plain" }))).toThrow(
      "empty",
    );
    const file = new File(["large"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: PLAYGROUND_MAX_FILE_BYTES + 1 });
    expect(() => preparePlaygroundFile(file)).toThrow("25 MB");
    expect(() =>
      preparePlaygroundFile(new File(["svg"], "icon.svg", { type: "image/png" })),
    ).toThrow("Choose a PNG");
  });
  it.each([
    " leading file.png",
    "_draft.png",
    "-draft.png",
    "...file.pdf",
    "💡.txt",
    "çá.png",
    `${"_".repeat(150)}draft.pdf`,
    "",
  ])('makes a bounded safe storage name from "%s"', (name) => {
    const result = playgroundStorageName(name);
    expect(result).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result).not.toContain("/");
  });
});

describe("Playground placement and drafts", () => {
  it("retires a committed overlay only after a newer successful canonical read", () => {
    const committed: PlaygroundDraft = {
      item: itemInput(saved),
      revision: 1,
      status: "saved",
      savedAfterRead: 10,
    };
    expect(mergePlaygroundDrafts([], { item: committed }, 10)).toEqual([committed]);
    expect(mergePlaygroundDrafts([], { item: committed }, 11)).toEqual([]);
    const unsaved: PlaygroundDraft = { ...committed, status: "error", error: "Save failed" };
    expect(mergePlaygroundDrafts([], { item: unsaved }, 11)).toEqual([unsaved]);
  });
  it("lays out a drop in separate rows near its canvas coordinates", () => {
    expect(batchPosition(0, { x: 13, y: 27 })).toEqual({ x: 13, y: 27 });
    expect(batchPosition(3, { x: 13, y: 27 })).toEqual({ x: 13, y: 277 });
    expect(
      new Set(
        Array.from({ length: 9 }, (_, index) =>
          JSON.stringify(batchPosition(index, { x: 0, y: 0 })),
        ),
      ).size,
    ).toBe(9);
    expect(batchPosition(2, { x: 100_000, y: -100_001 })).toEqual({ x: 100_000, y: -100_000 });
  });
  it("rejects invalid keyboard geometry and trims saved copy", () => {
    const item = itemInput(saved);
    expect(validatePlaygroundItem({ ...item, title: "  Title  ", body: "  Text  " })).toMatchObject(
      { title: "Title", body: "Text" },
    );
    expect(() => validatePlaygroundItem({ ...item, width: Number.NaN })).toThrow(
      "Width and height",
    );
    expect(() => validatePlaygroundItem({ ...item, x: Infinity })).toThrow("Positions");
    expect(() => validatePlaygroundItem({ ...item, title: " " })).toThrow("Add a title");
  });
  it("accepts a newer saved revision without replacing an unsaved local edit", () => {
    const remote = { ...saved, title: "A collaborator's change", revision: 2 };
    const draft: PlaygroundDraft = { item: itemInput(saved), revision: 1, status: "saved" };
    expect(mergePlaygroundDrafts([remote], { item: draft })[0].item.title).toBe(remote.title);
    expect(
      mergePlaygroundDrafts([remote], {
        item: {
          ...draft,
          item: { ...draft.item, title: "My unsaved change" },
          status: "error",
          error: "Conflict",
        },
      })[0].item.title,
    ).toBe("My unsaved change");
  });
  it("keeps a failed deletion visible even when the server has already hidden its row", () => {
    const pending: PlaygroundDraft = {
      item: itemInput(saved),
      revision: 1,
      status: "error",
      failedAction: "delete",
      error: "Cleanup failed",
    };
    expect(mergePlaygroundDrafts([], { item: pending })).toEqual([pending]);
  });
});
