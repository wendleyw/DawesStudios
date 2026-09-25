import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";

/** The number tiles only: panel eyebrows repeat some of their labels. */
const tiles = () => within(document.querySelector(".overview-stats") as HTMLElement);
const replace = vi.fn();
const viewer = vi.hoisted(() => ({ role: "client", display_name: "Beth Morgan" }));
const data = vi.hoisted(() => ({
  projects: [] as Project[],
  reviews: [] as unknown[],
}));
const query = (value: unknown) => ({
  data: value,
  isPending: false,
  error: null,
  refetch: vi.fn(),
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ profile: viewer }) }));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE" }]),
    useProjects: () => query(data.projects),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefings: () => query([{ status: "awaiting_review" }]),
}));
vi.mock("@/features/credits/credit-data", () => ({
  useCreditAccount: () => query({ balance: 40 }),
  useCreditLedger: () =>
    query([
      {
        id: "l1",
        client_id: "c1",
        project_id: "p1",
        amount: -1,
        balance_after: 40,
        kind: "project_debit",
        description: "",
        created_at: "2026-09-01T00:00:00Z",
      },
    ]),
}));
vi.mock("@/features/reviews/review-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reviews/review-data")>()),
  useReviews: () => query(data.reviews),
}));

import { ClientOverviewPage } from "./client-overview-page";

const project = (overrides: Partial<Project>): Project => ({
  id: "p1",
  client_id: "c1",
  campaign_id: null,
  briefing_id: null,
  title: "Campus Welcome",
  description: "",
  status: "client_review",
  service_type: "social",
  due_date: "2026-09-30",
  delivered_at: null,
  start_date: null,
  board_position: { x: 0, y: 0 },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
  viewer.role = "client";
  data.projects = [
    project({}),
    project({
      id: "p2",
      title: "Holiday Poster",
      status: "delivered",
      delivered_at: "2026-09-20T00:00:00Z",
    }),
  ];
  data.reviews = [
    {
      id: "v1",
      projectId: "p1",
      title: "Campus Welcome",
      deliverable: "Portrait Feed",
      version: 2,
      status: "pending",
      date: "2026-09-17T00:00:00Z",
      note: null,
      internal: false,
    },
    {
      id: "v2",
      projectId: "p1",
      title: "Studio-only draft",
      deliverable: "Story",
      version: 1,
      status: "pending",
      date: "2026-09-20T00:00:00Z",
      note: null,
      internal: true,
    },
  ];
});
afterEach(() => vi.useRealTimers());

describe("ClientOverviewPage", () => {
  it("greets the client and shows their numbers", () => {
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Beth");
    expect(tiles().getByText("Credits remaining").closest("div")).toHaveTextContent("40");
    expect(tiles().getByText("1 of 41 used")).toBeInTheDocument();
    expect(tiles().getByText("Active projects").closest("div")).toHaveTextContent("1");
    expect(tiles().getByText("1 delivered this month")).toBeInTheDocument();
    expect(tiles().getByText("Needs your review").closest("div")).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /New briefing/ })).toHaveAttribute(
      "href",
      "/clients/c1/briefings/new",
    );
  });

  it("lists the client's turn with its age and never an internal version", () => {
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByText("Review · last week")).toBeInTheDocument();
    expect(screen.getByText("Campus Welcome · Portrait Feed")).toBeInTheDocument();
    expect(screen.queryByText(/Studio-only draft/)).not.toBeInTheDocument();
    expect(screen.getByText("Holiday Poster")).toBeInTheDocument();
  });

  it("singularises a one-credit project's meta line", () => {
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByText("1 credit · Due Sep 30")).toBeInTheDocument();
  });

  it("gives each 'See all' link its own accessible name", () => {
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByRole("link", { name: "Your turn: see all" })).toHaveAttribute(
      "href",
      "/clients/c1/reviews",
    );
  });

  it("tells the studio whose view it is", () => {
    viewer.role = "agency";
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What SABRE sees");
  });

  it("sends a designer to the client's board", () => {
    viewer.role = "designer";
    render(<ClientOverviewPage clientId="c1" />);
    expect(replace).toHaveBeenCalledWith("/clients/c1/board");
  });
});
