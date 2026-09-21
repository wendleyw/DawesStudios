import { describe, expect, it, vi } from "vitest";
import { openLabel, projectHref, selectOrOpen } from "./project-open";

describe("opening a project from the board", () => {
  it("sends every surface to the same place", () => {
    expect(projectHref("abc")).toBe("/projects/abc");
    expect(openLabel("Blog Design")).toBe("Open Blog Design");
  });

  it("selects on one click without opening", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    selectOrOpen({ onSelect, onOpen }).onClick();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("opens on two, and keeps the opened project selected", () => {
    // The browser fires click before dblclick, so the surface that opens is also the one left
    // selected when the viewer comes back to the board.
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const handlers = selectOrOpen({ onSelect, onOpen });
    handlers.onClick();
    handlers.onClick();
    handlers.onDoubleClick({ stopPropagation: () => {} });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps the canvas from also acting on the double click", () => {
    // A lane sits inside the Planning frame; without this the pane would receive the gesture too.
    const stopPropagation = vi.fn();
    selectOrOpen({ onSelect: () => {}, onOpen: () => {} }).onDoubleClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
