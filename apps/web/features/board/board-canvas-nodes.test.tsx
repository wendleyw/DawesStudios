import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBoardCanvasNodes } from "./board-canvas-nodes";

function nodesFor(
  competitorWidget?: Parameters<typeof useBoardCanvasNodes>[0]["competitorWidget"],
) {
  return renderHook(() =>
    useBoardCanvasNodes({
      filteredProjects: [],
      campaigns: [{ id: "c1", title: "First", start_date: null, end_date: null }],
      canCreate: true,
      canMove: true,
      filtered: false,
      hasSearch: false,
      positions: {},
      clearFilters: vi.fn(),
      clientId: "client-1",
      setCreatingCampaign: vi.fn(),
      openProject: vi.fn(),
      selectedProjectId: null,
      artwork: undefined,
      competitorWidget,
    }),
  ).result.current;
}

describe("useBoardCanvasNodes competitor widget", () => {
  it("builds the widget node first, with what the widget needs", () => {
    const onRemove = vi.fn();
    const { nodes } = nodesFor({ count: 2, canEdit: true, removing: false, onRemove });
    expect(nodes[0]).toMatchObject({
      id: "widget:competitor-ads",
      type: "competitorAds",
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: { clientId: "client-1", canEdit: true, removing: false, onRemove },
    });
  });

  it("builds no widget node without the widget", () => {
    expect(nodesFor().nodes.some((node) => node.type === "competitorAds")).toBe(false);
  });
});
