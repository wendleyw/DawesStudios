import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectHeader } from "./project-header";

vi.mock("@/features/workspace/canvas-header", () => ({
  CanvasHeader: () => null,
}));
vi.mock("@/features/workspace/workspace-data", async () => {
  const actual = await vi.importActual<object>("@/features/workspace/workspace-data");
  return {
    ...actual,
    useDateFormat: () => ({ formatDate: () => "" }),
  };
});
vi.mock("@/features/credits/project-credits-chip", () => ({
  ProjectCreditsChip: () => null,
}));

const base = {
  viewer: { role: "client" } as never,
  project: {
    id: "p",
    client_id: "c",
    title: "Launch",
    status: "in_progress",
    due_date: null,
  } as never,
  deliverables: [],
  channel: "client" as const,
  format: "",
  onChannel: () => {},
  onFormat: () => {},
  playgroundOpen: false,
  reviewing: false,
  chromeRef: null,
};

describe("ProjectHeader", () => {
  it("hides the view control without a Miro link", () => {
    render(<ProjectHeader {...base} view="versions" miroAvailable={false} onView={() => {}} />);
    expect(screen.queryByRole("group", { name: "Project view" })).toBeNull();
  });

  it("switches between Versions and Miro", () => {
    const onView = vi.fn();
    render(<ProjectHeader {...base} view="versions" miroAvailable onView={onView} />);
    const group = screen.getByRole("group", { name: "Project view" });
    expect(within(group).getByRole("button", { name: "Versions" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(group).getByRole("button", { name: "Miro" }));
    expect(onView).toHaveBeenCalledWith("miro");
  });

  it("clicking the already-pressed option does nothing", () => {
    const onView = vi.fn();
    render(<ProjectHeader {...base} view="versions" miroAvailable onView={onView} />);
    const group = screen.getByRole("group", { name: "Project view" });
    fireEvent.click(within(group).getByRole("button", { name: "Versions" }));
    expect(onView).not.toHaveBeenCalled();
  });

  it("offers the agency its first design board instead of a Miro workspace button", () => {
    const onAddBoard = vi.fn();
    render(
      <ProjectHeader
        {...base}
        viewer={{ role: "agency" } as never}
        channel="internal"
        view="versions"
        miroAvailable={false}
        onView={() => {}}
        onAddBoard={onAddBoard}
      />,
    );
    expect(screen.queryByRole("button", { name: "Miro workspace" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add design board" }));
    expect(onAddBoard).toHaveBeenCalled();
  });
});
