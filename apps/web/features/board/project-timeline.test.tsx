import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectTimeline } from "./project-timeline";
import { mondayOf } from "./timeline-model";
import type { Project } from "@/features/workspace/workspace-data";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    client_id: "client-1",
    campaign_id: null,
    briefing_id: null,
    title: "Holiday Retail Window",
    description: "",
    status: "planned",
    service_type: "design",
    due_date: null,
    delivered_at: null,
    start_date: null,
    board_position: { x: 0, y: 0 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// The window this suite renders every lane against: the same Monday `timeline-model.test.ts` uses.
const WINDOW_START = mondayOf("2026-09-14");

function renderTimeline(props: Partial<Parameters<typeof ProjectTimeline>[0]> = {}) {
  const onStart = vi.fn();
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  const view = render(
    <ProjectTimeline
      projects={[project()]}
      campaignName={() => "General"}
      campaignOrder={[]}
      start={WINDOW_START}
      onStart={onStart}
      scale="fortnight"
      selectedId={null}
      onSelect={onSelect}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { onStart, onSelect, onOpen, ...view };
}

describe("ProjectTimeline out-of-window pointer", () => {
  it("points before the window at the due date, named for a screen reader and jumping on click", async () => {
    const user = userEvent.setup();
    const { onStart } = renderTimeline({ projects: [project({ due_date: "2026-08-03" })] });
    const button = screen.getByRole("button", { name: "Show Holiday Retail Window: due Aug 3" });
    expect(button).toHaveTextContent("Due Aug 3");
    await user.click(button);
    expect(onStart).toHaveBeenCalledWith(mondayOf("2026-08-03"));
  });

  it("points after the window at the start date, named for a screen reader and jumping on click", async () => {
    const user = userEvent.setup();
    const { onStart, onSelect } = renderTimeline({
      projects: [project({ start_date: "2026-12-04" })],
    });
    const button = screen.getByRole("button", {
      name: "Show Holiday Retail Window: starts Dec 4",
    });
    expect(button).toHaveTextContent("Starts Dec 4");
    await user.click(button);
    expect(onStart).toHaveBeenCalledWith(mondayOf("2026-12-04"));
    // The lane's own single-click selection is allowed to fire too — only opening is guarded.
    expect(onSelect).toHaveBeenCalledWith("project-1");
  });

  it("never opens the project on a double click, even though it may select it", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderTimeline({ projects: [project({ start_date: "2026-12-04" })] });
    const button = screen.getByRole("button", { name: /Show Holiday Retail Window/ });
    await user.dblClick(button);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("is keyboard operable", async () => {
    const user = userEvent.setup();
    const { onStart } = renderTimeline({ projects: [project({ start_date: "2026-12-04" })] });
    const button = screen.getByRole("button", { name: /Show Holiday Retail Window/ });
    button.focus();
    await user.keyboard("{Enter}");
    expect(onStart).toHaveBeenCalledWith(mondayOf("2026-12-04"));
  });

  it("keeps plain text, not a button, for work with no dates", () => {
    renderTimeline({ projects: [project()] });
    expect(screen.getByText("No dates set")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show Holiday Retail Window/ })).toBeNull();
  });

  it("draws a bar instead of a pointer for work that overlaps the window", () => {
    renderTimeline({
      projects: [project({ start_date: "2026-09-16", due_date: "2026-09-18" })],
    });
    expect(screen.queryByRole("button", { name: /Show Holiday Retail Window/ })).toBeNull();
    expect(screen.queryByText("No dates set")).toBeNull();
  });
});
