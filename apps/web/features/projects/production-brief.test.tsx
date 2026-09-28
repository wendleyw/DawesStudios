import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductionBrief } from "./production-brief";
import { emptyProductionBrief } from "./production-brief-model";
import type { DesignBoard, TableRow } from "./project-data";
const state = vi.hoisted(() => ({
  role: "designer",
  data: null as unknown,
  pending: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDate: (value: string) => value }),
}));
vi.mock("./project-data", () => ({
  useProjectWorkflow: () => ({ data: { project: { activity: "active" }, boards: [] } }),
  useProductionBrief: () => ({
    data: state.data,
    isPending: state.pending,
    error: state.error,
    refetch: state.refetch,
  }),
}));
vi.mock("./production-brief-editor", () => ({
  ProductionBriefEditor: () => <div role="dialog">Production editor</div>,
}));
const board = { id: "board", name: "Concept board", dueDate: "2026-10-01" } as DesignBoard;
const project = { id: "project", status: "in_progress" } as TableRow<"projects">;
const published = {
  board_id: "board",
  revision: 1,
  updated_at: "2026-09-28",
  content: {
    ...emptyProductionBrief("Released production", "social", null),
    overview: "Create three concepts",
  },
};
beforeEach(() => {
  state.role = "designer";
  state.pending = false;
  state.error = null;
  state.data = {
    published,
    draft: {
      ...published,
      revision: 2,
      content: { ...published.content, title: "Unsent studio changes", dueDate: "2026-09-30" },
    },
  };
});
describe("ProductionBrief", () => {
  it("shows the designer only released instructions even when draft data is present", () => {
    render(<ProductionBrief board={board} project={project} />);
    expect(screen.getByText("Released production")).toBeVisible();
    expect(screen.queryByText("Unsent studio changes")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit production/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "View full briefing" })).toBeNull();
    expect(screen.getByText("2026-10-01")).toBeVisible();
    expect(screen.queryByText("2026-09-30")).toBeNull();
  });
  it("gives the agency the draft and editor", async () => {
    state.role = "agency";
    render(<ProductionBrief board={board} project={project} />);
    expect(screen.getByText("Unsent studio changes")).toBeVisible();
    expect(screen.getByText("Draft · not sent to the designer")).toBeVisible();
    expect(screen.getByText("2026-09-30")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Edit production brief" }));
    expect(screen.getByRole("dialog")).toBeVisible();
  });
  it("has an explicit waiting state rather than falling back to the client's request", () => {
    state.data = { published: null, draft: null };
    render(<ProductionBrief board={board} project={project} />);
    expect(screen.getByText("No production brief sent yet.")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("lets a failed read be retried without showing stale instructions", async () => {
    state.error = new Error("Offline");
    render(<ProductionBrief board={board} project={project} />);
    expect(screen.queryByText("Released production")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalled();
  });
});
