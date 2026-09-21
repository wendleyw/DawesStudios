import { describe, expect, it } from "vitest";
import { selectionFromChanges } from "./planning-view";

describe("selectionFromChanges", () => {
  it("keeps the current card when nothing selects", () => {
    expect(
      selectionFromChanges(
        [
          { type: "dimensions", id: "a" },
          { type: "position", id: "a" },
        ],
        "a",
      ),
    ).toBe("a");
  });

  it("selects the card xyflow reports", () => {
    expect(selectionFromChanges([{ type: "select", id: "b", selected: true }], null)).toBe("b");
  });

  it("moves the selection when one card replaces another in the same batch", () => {
    expect(
      selectionFromChanges(
        [
          { type: "select", id: "a", selected: false },
          { type: "select", id: "b", selected: true },
        ],
        "a",
      ),
    ).toBe("b");
  });

  it("clears the selection when the selected card is unselected", () => {
    expect(selectionFromChanges([{ type: "select", id: "a", selected: false }], "a")).toBe(null);
  });

  it("ignores an unselect for a card that was not selected", () => {
    expect(selectionFromChanges([{ type: "select", id: "b", selected: false }], "a")).toBe("a");
  });

  it("ignores changes that carry no id", () => {
    expect(selectionFromChanges([{ type: "add" }], "a")).toBe("a");
  });
});
