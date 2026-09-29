import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";
import { useBoardCanvasNodes } from "./board-canvas-nodes";

const onToggleCampaign = vi.fn();

function nodesFor(
  competitorWidget?: Parameters<typeof useBoardCanvasNodes>[0]["competitorWidget"],
  collapsedCampaigns: ReadonlySet<string> = new Set(),
  filteredProjects: Parameters<typeof useBoardCanvasNodes>[0]["filteredProjects"] = [],
) {
  return renderHook(() =>
    useBoardCanvasNodes({
      filteredProjects,
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
      collapsedCampaigns,
      onToggleCampaign,
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

describe("useBoardCanvasNodes folded campaigns", () => {
  const poster = {
    id: "p1",
    campaign_id: "c1",
    title: "Poster",
    board_position: { x: 0, y: 0 },
  } as Project;

  it("hands each campaign frame its fold state and toggle", () => {
    const { nodes } = nodesFor(undefined, new Set(), [poster]);
    expect(nodes.find((node) => node.id === "campaign:c1")?.data).toMatchObject({
      collapsed: false,
      onToggle: onToggleCampaign,
    });
    expect(nodes.some((node) => node.id === "p1")).toBe(true);
  });

  it("leaves a folded campaign's cards and briefing slot out", () => {
    const { nodes } = nodesFor(undefined, new Set(["c1"]), [poster]);
    expect(nodes.find((node) => node.id === "campaign:c1")?.data).toMatchObject({
      collapsed: true,
    });
    expect(nodes.some((node) => node.parentId === "campaign:c1")).toBe(false);
  });
});
