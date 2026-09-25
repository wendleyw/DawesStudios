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

const defaultVersions = {
  versions: [
    {
      id: "v1",
      project_id: "p1",
      deliverable_id: "d1",
      version_number: 2,
      status: "reviewed",
      created_at: "2026-09-23T00:00:00Z",
    },
  ],
  deliverables: [{ id: "d1", name: "Portrait Feed" }],
};
const data = vi.hoisted(() => ({ projects: [] as Project[] }));
const mocks = vi.hoisted(() => ({ useDesignerVersions: vi.fn() }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: "designer", display_name: "Alex Morgan" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE" }]),
    useProjects: () => query(data.projects),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("./overview-data", () => ({ useDesignerVersions: mocks.useDesignerVersions }));

import { DesignerOverview } from "./designer-overview";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
  data.projects = [project({})];
  mocks.useDesignerVersions.mockReturnValue(query(defaultVersions));
});
afterEach(() => vi.useRealTimers());

describe("DesignerOverview", () => {
  it("greets the designer and lists their turn without credits", () => {
    render(<DesignerOverview />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Alex");
    expect(screen.getByText("My work")).toHaveClass("eyebrow");
    expect(tiles().getByText("Your turn").closest("div")).toHaveTextContent("1");
    expect(screen.getByText("Changes requested · 2 days ago")).toBeInTheDocument();
    expect(screen.getByText("Launch · Portrait Feed")).toBeInTheDocument();
    expect(screen.queryByText(/credit/i)).not.toBeInTheDocument();
  });

  it("asks for versions on active projects only, never a delivered one", () => {
    data.projects = [
      project({ id: "p1", status: "changes_requested" }),
      project({ id: "p2", status: "delivered", delivered_at: "2026-09-10T00:00:00Z" }),
    ];
    render(<DesignerOverview />);
    expect(mocks.useDesignerVersions).toHaveBeenCalledWith(["p1"]);
  });
});
