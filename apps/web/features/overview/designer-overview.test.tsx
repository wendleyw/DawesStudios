import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";

const tiles = () => within(document.querySelector(".overview-stats") as HTMLElement);
const query = (value: unknown) => ({
  data: value,
  isPending: false,
  error: null,
  refetch: vi.fn(),
});
const project = (overrides: Partial<Project>): Project => ({
  id: "p1",
  client_id: "c1",
  campaign_id: null,
  briefing_id: null,
  title: "Launch",
  description: "",
  status: "changes_requested",
  service_type: "social",
  due_date: "2026-10-02",
  delivered_at: null,
  start_date: null,
  board_position: { x: 0, y: 0 },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

const defaultRounds = {
  rounds: [
    {
      id: "r1",
      project_id: "p1",
      board_id: "b1",
      version_number: 2,
      status: "reviewed",
      created_at: "2026-09-23T00:00:00Z",
    },
  ],
  boards: [{ id: "b1", name: "Hero banner" }],
};
const data = vi.hoisted(() => ({
  projects: [] as Project[],
  projectsError: null as Error | null,
}));
const mocks = vi.hoisted(() => ({ useDesignerRounds: vi.fn() }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: "designer", display_name: "Alex Morgan" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE" }]),
    useProjects: () => ({
      data: data.projectsError ? undefined : data.projects,
      isPending: false,
      error: data.projectsError,
      refetch: vi.fn(),
    }),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("./overview-data", () => ({ useDesignerRounds: mocks.useDesignerRounds }));

import { DesignerOverview } from "./designer-overview";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
  data.projects = [project({})];
  data.projectsError = null;
  mocks.useDesignerRounds.mockReturnValue(query(defaultRounds));
});
afterEach(() => vi.useRealTimers());

describe("DesignerOverview", () => {
  it("greets the designer and lists their turn without credits", () => {
    render(<DesignerOverview />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Alex");
    expect(screen.getByText("My work")).toHaveClass("eyebrow");
    expect(tiles().getByText("Your turn").closest("div")).toHaveTextContent("1");
    expect(screen.getByText("Changes requested · submitted 2 days ago")).toBeInTheDocument();
    expect(screen.getByText("Launch · Hero banner · Round 2")).toBeInTheDocument();
    expect(screen.queryByText(/credit/i)).not.toBeInTheDocument();
  });

  it("asks for rounds on active projects only, never a delivered one", () => {
    data.projects = [
      project({ id: "p1", status: "changes_requested" }),
      project({ id: "p2", status: "delivered", delivered_at: "2026-09-10T00:00:00Z" }),
    ];
    render(<DesignerOverview />);
    expect(mocks.useDesignerRounds).toHaveBeenCalledWith(["p1"]);
  });

  it("shows each column's empty text when it has no rows", () => {
    data.projects = [];
    mocks.useDesignerRounds.mockReturnValue(query({ rounds: [], boards: [] }));
    render(<DesignerOverview />);
    expect(screen.getByText("No active assignments.")).toBeInTheDocument();
    expect(screen.getByText("Nothing sent back to you.")).toBeInTheDocument();
    expect(screen.getByText("Delivered work will appear here.")).toBeInTheDocument();
  });

  it("shows the error state rather than a forever-pending read when projects fails", () => {
    data.projectsError = new Error("boom");
    mocks.useDesignerRounds.mockReturnValue({
      data: undefined,
      isPending: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<DesignerOverview />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "We couldn’t load your work.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
