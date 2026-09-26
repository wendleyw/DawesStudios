import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Briefing } from "./briefing-model";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client" | "designer",
  briefings: [] as Briefing[],
}));
const query = (data: unknown) => ({ data, isPending: false, error: null, refetch: vi.fn() });
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE" }]),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("./briefing-data", () => ({
  useBriefings: () => query(state.briefings),
  useCampaigns: () => query([]),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () =>
    query(
      state.role === "designer"
        ? undefined
        : {
            team: [{ user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" }],
            names: state.role === "agency" ? { ana: "Ana Lima", ben: "Ben Cole" } : {},
          },
    ),
}));

import { BriefingsPage } from "./briefings-page";

const briefing = (overrides: Partial<Briefing>): Briefing => ({
  id: "b1",
  client_id: "c1",
  campaign_id: null,
  title: "Autumn launch",
  service_type: "static-ad",
  status: "awaiting_review",
  overview: "",
  goals: "",
  direction: {},
  requested_deliverables: [],
  due_date: null,
  requested_by: "ana",
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  state.role = "agency";
  state.briefings = [
    briefing({}),
    briefing({ id: "b2", title: "Holiday poster", requested_by: "ben" }),
  ];
});

describe("BriefingsPage requester column", () => {
  it("names each requester for the studio, marking someone who left", () => {
    render(<BriefingsPage clientId="c1" />);
    expect(screen.getByText("Requested by Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Requested by Ben Cole (left)")).toBeInTheDocument();
  });

  it("shows a client a former member without their name", () => {
    state.role = "client";
    render(<BriefingsPage clientId="c1" />);
    expect(screen.getByText("Requested by Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Requested by Former member")).toBeInTheDocument();
    expect(screen.queryByText(/Ben Cole/)).not.toBeInTheDocument();
  });

  it("shows a designer no requester", () => {
    state.role = "designer";
    render(<BriefingsPage clientId="c1" />);
    expect(screen.getByText("Autumn launch")).toBeInTheDocument();
    expect(screen.queryByText(/Requested by/)).not.toBeInTheDocument();
  });

  it("gives a designer's rows no requester cell, not merely an empty one", () => {
    state.role = "designer";
    const { container } = render(<BriefingsPage clientId="c1" />);
    expect(container.querySelectorAll(".briefing-list-row").length).toBe(2);
    expect(container.querySelector(".briefing-list-requester")).toBeNull();
    expect(container.querySelector(".briefing-list.no-requester")).not.toBeNull();
  });
});
