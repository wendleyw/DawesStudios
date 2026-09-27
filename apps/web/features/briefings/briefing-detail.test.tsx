import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientPeople } from "@/features/team/client-people";
import { BriefingDetail } from "./briefing-detail";
import { creditMonthLabel, openCreditMonths, type Briefing } from "./briefing-model";

const ana = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const ben = { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" };
const fixture = vi.hoisted(() => ({
  briefing: null as Briefing | null,
  /** Available credits per open month, current month first. */
  available: [100] as number[],
  database: {},
  role: "agency" as "agency" | "client",
  people: undefined as ClientPeople | undefined,
  setRequester: vi.fn(),
  accept: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: fixture.database, profile: { id: "viewer-1", role: fixture.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useDateFormat: () => ({ formatDate: () => "" }),
  useInvalidateWorkspace: () => vi.fn(),
  useInvalidateNotifications: () => vi.fn(),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () => ({ data: fixture.people, isPending: false, error: null }),
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
  useCreditMonthSummaries: (_clientId: string, months: string[]) => ({
    data: months.map((month, index) => ({ month, available: fixture.available[index] ?? 0 })),
    isPending: false,
    error: null,
  }),
  confirmBriefingBudget: vi.fn(),
  acceptBriefing: fixture.accept,
  setBriefingRequester: fixture.setRequester,
}));

// jsdom has no native dialog/top-layer implementation; real focus isolation is covered in E2E.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  fixture.role = "agency";
  fixture.people = { team: [ana, ben], names: { ana: "Ana Lima", ben: "Ben Cole", cy: "Cy Gone" } };
  fixture.setRequester.mockResolvedValue(undefined);
  fixture.accept.mockResolvedValue("project-1");
  fixture.available = [100];
});

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
    expect(
      screen.getByText(`5 credits · one project · ${creditMonthLabel(openCreditMonths()[0])}`),
    ).toBeVisible();
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

describe("BriefingDetail credit month", () => {
  const months = openCreditMonths();
  const confirmed = (overrides: Partial<Briefing> = {}) =>
    baseBriefing({
      status: "budget_confirmed",
      confirmed_credits: 9,
      budget_note: "Scope.",
      ...overrides,
    });

  it("opens on the due-date month, like accept_briefing, and shows that month's balance", async () => {
    fixture.available = [100, 0];
    fixture.briefing = confirmed({ due_date: months[1].replace("-01", "-12") });
    mountDetail();
    const select = await screen.findByRole("combobox", { name: "Credit month" });
    expect(select).toHaveValue(months[1]);
    expect(within(select).getAllByRole("option")).toHaveLength(12);
    expect(
      within(select).getByRole("option", {
        name: `${creditMonthLabel(months[0])} · 100 available`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Available in ${creditMonthLabel(months[1])}`)).toBeVisible();
    expect(screen.getByText(/9 more are needed\. Choose another month/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept & create project" })).toBeDisabled();
  });

  it("accepts into the chosen month once it has the credits", async () => {
    const user = userEvent.setup();
    fixture.available = [100, 0];
    fixture.briefing = confirmed({ due_date: months[1].replace("-01", "-12") });
    mountDetail();
    await user.selectOptions(screen.getByRole("combobox", { name: "Credit month" }), months[0]);
    expect(screen.queryByText(/more are needed/)).not.toBeInTheDocument();
    expect(screen.getByText("91 credits")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Accept & create project" }));
    await waitFor(() =>
      expect(fixture.accept).toHaveBeenCalledWith(fixture.database, {
        briefingId: "briefing-1",
        month: months[0],
      }),
    );
  });

  it("defaults to the current month without a due date", async () => {
    fixture.briefing = confirmed({ due_date: null });
    mountDetail();
    expect(await screen.findByRole("combobox", { name: "Credit month" })).toHaveValue(months[0]);
  });
});

describe("BriefingDetail requester", () => {
  it("names the requester and lets the studio change them", async () => {
    fixture.briefing = baseBriefing({ requested_by: "ana" });
    mountDetail();
    expect(screen.getByText("Requested by Ana Lima")).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Change who requested this briefing" }));
    const dialog = screen.getByRole("dialog", { name: "Who requested this briefing?" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Requested by" }), "ben");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(fixture.setRequester).toHaveBeenCalledWith(fixture.database, {
        briefingId: "briefing-1",
        requestedBy: "ben",
      }),
    );
  });

  it("tells the studio when the requester has left", () => {
    fixture.briefing = baseBriefing({ requested_by: "cy" });
    mountDetail();
    expect(screen.getByText("Requested by Cy Gone (left)")).toBeVisible();
  });

  it("lets the studio choose a requester when none is recorded", () => {
    fixture.briefing = baseBriefing({ requested_by: null });
    mountDetail();
    expect(screen.getByText("No requester yet")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Choose who requested this briefing" }),
    ).toBeVisible();
  });

  it("shows a client the requester, a former member without a name, and no studio control", () => {
    fixture.role = "client";
    fixture.people = { team: [ana, ben], names: {} };
    fixture.briefing = baseBriefing({ requested_by: "cy" });
    mountDetail();
    expect(screen.getByText("Requested by Former member")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /who requested this briefing/ }),
    ).not.toBeInTheDocument();
  });
});
