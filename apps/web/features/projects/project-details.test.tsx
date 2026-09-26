import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion, TableRow } from "./project-data";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client" | "designer",
  requester: "ana" as string | null,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { id: "viewer-1", role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return { ...actual, useDateFormat: () => actual.createDateFormatters("UTC") };
});
vi.mock("./project-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./project-data")>()),
  useProjectAssignments: () => ({
    data: { members: [], assigned: [] },
    error: null,
    refetch: vi.fn(),
  }),
  useInvalidateProject: () => vi.fn(),
}));
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefingRequester: () => ({ data: state.role === "designer" ? undefined : state.requester }),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () => ({
    data:
      state.role === "designer"
        ? undefined
        : {
            team: [{ user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" }],
            names: state.role === "agency" ? { ana: "Ana Lima", ben: "Ben Cole" } : {},
          },
  }),
}));

import { ProjectDetails } from "./project-details";

const project = {
  id: "p1",
  client_id: "c1",
  briefing_id: "b1",
  campaign_id: null,
  title: "Campus Welcome",
  description: "",
  status: "client_review",
  service_type: "static-ad",
  start_date: null,
  due_date: null,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
} as unknown as TableRow<"projects">;
const deliverables = [{ id: "d1", name: "Portrait Feed" }] as unknown as TableRow<"deliverables">[];

function renderDetails(versions: CanvasVersion[] = []) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProjectDetails project={project} deliverables={deliverables} versions={versions} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.role = "agency";
  state.requester = "ana";
});

describe("ProjectDetails requester", () => {
  it("names who asked for the project", () => {
    renderDetails();
    expect(screen.getByText("Requested by")).toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
  });

  it("marks a requester who left: by name for the studio, as a former member for the client", () => {
    state.requester = "ben";
    renderDetails();
    expect(screen.getByText("Ben Cole (left)")).toBeInTheDocument();
  });

  it("never names a former requester to the client", () => {
    state.role = "client";
    state.requester = "ben";
    renderDetails();
    expect(screen.getByText("Former member")).toBeInTheDocument();
    expect(screen.queryByText(/Ben Cole/)).not.toBeInTheDocument();
  });

  it("shows a designer no requester", () => {
    state.role = "designer";
    renderDetails();
    expect(screen.queryByText("Requested by")).not.toBeInTheDocument();
  });
});

describe("ProjectDetails version history", () => {
  const version = (overrides: Partial<CanvasVersion>): CanvasVersion => ({
    id: "v2",
    projectId: "p1",
    deliverableId: "d1",
    boardId: null,
    number: 2,
    note: "",
    status: "approved",
    date: "2026-09-20T00:00:00Z",
    ...overrides,
  });

  it("names who decided on a version and when", () => {
    renderDetails([version({ reviewedBy: "ana", reviewedAt: "2026-09-24T10:00:00Z" })]);
    expect(screen.getByText("Approved by Ana Lima · Sep 24")).toBeInTheDocument();
  });

  it("keeps today's wording for a decision recorded before reviewers were", () => {
    renderDetails([
      version({
        status: "changes_requested",
        date: "2026-09-18T00:00:00Z",
        reviewedBy: null,
        reviewedAt: "2026-09-19T00:00:00Z",
      }),
    ]);
    expect(screen.getByText("Sep 18 · Changes requested")).toBeInTheDocument();
  });

  it("tells the client a former member decided", () => {
    state.role = "client";
    renderDetails([
      version({
        status: "changes_requested",
        reviewedBy: "ben",
        reviewedAt: "2026-09-23T10:00:00Z",
      }),
    ]);
    expect(screen.getByText("Changes requested by Former member · Sep 23")).toBeInTheDocument();
  });
});
