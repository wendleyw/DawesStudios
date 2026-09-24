import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefingDetail } from "./briefing-detail";
import type { Briefing } from "./briefing-model";

const fixture = vi.hoisted(() => ({
  briefing: null as Briefing | null,
  balance: 100,
  database: {},
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: fixture.database, profile: { id: "agency-1", role: "agency" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useDateFormat: () => ({ formatDate: () => "" }),
  useInvalidateWorkspace: () => vi.fn(),
  useInvalidateNotifications: () => vi.fn(),
}));
vi.mock("./briefing-attachments", () => ({ BriefingAttachments: () => null }));
vi.mock("./briefing-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./briefing-data")>()),
  useBriefings: () => ({
    data: fixture.briefing ? [fixture.briefing] : [],
    isPending: false,
    error: null,
  }),
  useCampaigns: () => ({ data: [], isPending: false, error: null }),
  useBriefingProject: () => ({ data: null, isPending: false, error: null }),
  useBriefingCreditBalance: () => ({
    data: { balance: fixture.balance },
    isPending: false,
    error: null,
  }),
  confirmBriefingBudget: vi.fn(),
  acceptBriefing: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function baseBriefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    id: "briefing-1",
    client_id: "client-1",
    campaign_id: null,
    title: "Fixture briefing",
    service_type: "social",
    status: "awaiting_review",
    overview: "Overview",
    goals: "Goals",
    direction: {},
    requested_deliverables: [],
    due_date: null,
    estimated_credits: 3,
    confirmed_credits: null,
    budget_note: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function mountDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BriefingDetail clientId="client-1" briefingId="briefing-1" />
    </QueryClientProvider>,
  );
}

describe("BriefingDetail agency budget review — one primary action at a time", () => {
  it("shows only Confirm budget while the briefing has not been budget confirmed", async () => {
    fixture.briefing = baseBriefing({ status: "awaiting_review" });
    mountDetail();
    expect(await screen.findByRole("button", { name: "Confirm budget" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Accept & create project" }),
    ).not.toBeInTheDocument();
  });

  it("shows only Accept & create project once budget confirmed and unedited, with balance messaging and the credits link", async () => {
    fixture.briefing = baseBriefing({
      status: "budget_confirmed",
      confirmed_credits: 5,
      budget_note: "Approved scope.",
    });
    mountDetail();
    expect(await screen.findByRole("button", { name: "Accept & create project" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm budget" })).not.toBeInTheDocument();
    expect(screen.getByText("5 credits · one project")).toBeVisible();
    expect(screen.getByRole("link", { name: "View credits" })).toBeVisible();
  });

  it("brings back only Confirm budget once a confirmed budget is edited, keeping the unsaved-changes note", async () => {
    const user = userEvent.setup();
    fixture.briefing = baseBriefing({
      status: "budget_confirmed",
      confirmed_credits: 5,
      budget_note: "Approved scope.",
    });
    mountDetail();
    const creditsField = await screen.findByRole("spinbutton", {
      name: "Approved project credits",
    });
    await user.clear(creditsField);
    await user.type(creditsField, "6");

    expect(screen.getByRole("button", { name: "Confirm budget" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Accept & create project" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeVisible();
  });
});
