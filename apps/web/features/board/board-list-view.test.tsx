import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";
import { BoardListView } from "./board-list-view";

vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useDateFormat: () => ({ formatDate: () => "No due date", formatDayKey: () => "2026-09-28" }),
}));

const project: Project = {
  id: "p1",
  client_id: "client",
  campaign_id: null,
  briefing_id: "b1",
  title: "Spring Poster",
  description: "",
  status: "in_progress",
  service_type: "",
  due_date: null,
  delivered_at: null,
  start_date: null,
  board_position: { x: 0, y: 0 },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderList(requesterOf?: (project: Project) => string | null) {
  render(
    <BoardListView
      projects={[project]}
      listSort={null}
      onHeaderSort={() => {}}
      onSelectSort={() => {}}
      filtered={false}
      hasSearch={false}
      onClearFilters={() => {}}
      campaignName={() => "Spring"}
      collapsedGroups={new Set(["delivered"])}
      onToggleGroup={() => {}}
      requesterOf={requesterOf}
    />,
  );
}

describe("BoardListView requester column", () => {
  it("shows Requested by with the requester's name to viewers who see requesters", () => {
    renderList(() => "Maya Chen");
    expect(screen.getByRole("button", { name: "Requested by" })).toBeInTheDocument();
    expect(screen.getByText("Maya Chen")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Requested by A–Z" })).toBeInTheDocument();
  });

  it("drops the column and its sort options for viewers who do not see requesters", () => {
    renderList();
    expect(screen.queryByRole("button", { name: "Requested by" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Requested by A–Z" })).not.toBeInTheDocument();
  });
});
