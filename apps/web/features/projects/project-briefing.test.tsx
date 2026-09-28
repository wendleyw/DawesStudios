import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Briefing } from "@/features/briefings/briefing-model";
import { ProjectBriefing } from "./project-briefing";

const state = vi.hoisted(() => ({
  pending: false,
  error: null as Error | null,
  data: [] as Briefing[],
  refetch: vi.fn(),
}));
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefings: () => ({
    data: state.data,
    error: state.error,
    isPending: state.pending,
    refetch: state.refetch,
  }),
  useCampaigns: () => ({ data: [{ id: "campaign", title: "Fresh Start" }] }),
}));
vi.mock("@/features/briefings/briefing-attachments", () => ({
  BriefingAttachments: ({ briefingId }: { briefingId: string }) => (
    <p>Attachments for {briefingId}</p>
  ),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDate: () => "Sep 27" }),
}));

beforeEach(() => {
  state.pending = false;
  state.error = null;
  state.refetch.mockClear();
  state.data = [
    {
      id: "brief",
      client_id: "client",
      campaign_id: "campaign",
      title: "Retail launch",
      service_type: "blog",
      status: "accepted",
      overview: "Introduce the new retail partners.",
      goals: "Build awareness.",
      direction: { audience: "Retail teams" },
      requested_deliverables: [],
      due_date: null,
      created_at: "2026-09-27",
      updated_at: "2026-09-27",
    },
  ];
});

describe("ProjectBriefing", () => {
  it("shows the selected accepted scope and attachment context inside the project", () => {
    state.data.push({ ...state.data[0], id: "another", overview: "Other project scope" });
    render(<ProjectBriefing clientId="client" briefingId="brief" />);
    expect(screen.getByText("Introduce the new retail partners.")).toBeVisible();
    expect(screen.getByText("Retail teams")).toBeVisible();
    expect(screen.getByText("Attachments for brief")).toBeVisible();
    expect(screen.queryByText("Other project scope")).toBeNull();
    expect(screen.getByRole("link", { name: "View full briefing" })).toHaveAttribute(
      "href",
      "/clients/client/briefings/brief",
    );
  });

  it("announces loading without exposing stale scope", () => {
    state.pending = true;
    render(<ProjectBriefing clientId="client" briefingId="brief" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading briefing");
    expect(screen.queryByText("Introduce the new retail partners.")).toBeNull();
  });

  it("lets a failed read retry", async () => {
    state.error = new Error("Unavailable");
    render(<ProjectBriefing clientId="client" briefingId="brief" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Attachments for brief")).toBeNull();
  });

  it("does not load attachments for an unavailable briefing", () => {
    render(<ProjectBriefing clientId="client" briefingId="missing" />);
    expect(screen.getByText("This briefing is no longer available.")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
