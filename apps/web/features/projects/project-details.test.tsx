import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  creditMonthLabel,
  creditMonthOf,
  writableCreditMonths,
} from "@/features/credits/credit-model";
import { MonthShortfallError, type CanvasVersion, type TableRow } from "./project-data";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client" | "designer",
  requester: "ana" as string | null,
  credits: null as null | {
    charged: number;
    settlement: null | {
      final_credits: number;
      difference: number;
      charged_month: string | null;
      reason: string;
    };
  },
  move: vi.fn(),
  settle: vi.fn(),
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
  useInvalidateProjectCredits: () => vi.fn(),
  useProjectCredits: () => ({ data: state.role === "designer" ? undefined : state.credits }),
  moveProjectMonth: state.move,
  settleProjectCredits: state.settle,
}));
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefingRequester: () => ({ data: state.role === "designer" ? undefined : state.requester }),
}));
vi.mock("@/features/credits/credit-data", () => ({
  useCreditMonthSummaries: (_clientId: string, months: string[]) => ({
    data: months.map((month, index) => ({ month, available: index === 0 ? 2 : 50 })),
    isPending: false,
  }),
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
  credit_month: null,
} as unknown as TableRow<"projects">;
const deliverables = [{ id: "d1", name: "Portrait Feed" }] as unknown as TableRow<"deliverables">[];

function renderDetails(
  versions: CanvasVersion[] = [],
  overrides: Partial<TableRow<"projects">> = {},
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProjectDetails
        project={{ ...project, ...overrides }}
        deliverables={deliverables}
        versions={versions}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.role = "agency";
  state.requester = "ana";
  state.credits = null;
  state.move.mockResolvedValue("entry-1");
  state.settle.mockResolvedValue({});
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

  it("labels rounds and client versions without a deliverable name", () => {
    renderDetails([
      version({ id: "r3", boardId: "board-1", number: 3 }),
      version({ id: "s1", number: 1, date: "2026-09-19T00:00:00Z" }),
    ]);
    expect(screen.getByText("Round 3")).toBeInTheDocument();
    expect(screen.getByText("V1")).toBeInTheDocument();
    expect(screen.queryByText(/Portrait Feed/)).not.toBeInTheDocument();
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

describe("ProjectDetails credits", () => {
  const months = writableCreditMonths(creditMonthOf(new Date()));
  const [current, next] = months;
  const previous = "2020-01-01";

  it("shows the studio and the client the charge and its month", () => {
    state.credits = { charged: 9, settlement: null };
    renderDetails([], { credit_month: next });
    expect(screen.getByText("Credits", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getByText(`9 · ${creditMonthLabel(next)}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to another month" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settle final credits" })).not.toBeInTheDocument();
  });

  it("gives the client the figures and none of the studio's actions", () => {
    state.role = "client";
    state.credits = { charged: 9, settlement: null };
    renderDetails([], { credit_month: next, status: "delivered" });
    expect(screen.getByText(`9 · ${creditMonthLabel(next)}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /month|Settle/ })).not.toBeInTheDocument();
  });

  it("shows a designer no credits", () => {
    state.role = "designer";
    state.credits = { charged: 9, settlement: null };
    renderDetails([], { credit_month: next });
    expect(screen.queryByText("Credits")).not.toBeInTheDocument();
  });

  it("moves the charge after the studio confirms the month", async () => {
    const user = userEvent.setup();
    state.credits = { charged: 9, settlement: null };
    renderDetails([], { credit_month: current });
    await user.click(screen.getByRole("button", { name: "Move to another month" }));
    const dialog = screen.getByRole("dialog", { name: "Move to another month" });
    expect(
      within(dialog).getByText(
        `9 credits return to ${creditMonthLabel(current)} and are charged to ${creditMonthLabel(next)}.`,
      ),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: `Move to ${creditMonthLabel(next)}` }),
    );
    await waitFor(() =>
      expect(state.move).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ projectId: "p1", toMonth: next, chargeFull: false }),
      ),
    );
    // One key per dialog opening, not one per chosen target — see the retry test below.
    expect(state.move.mock.calls[0][1].idempotencyKey).toMatch(/^move:p1:[^:]+$/);
  });

  it("retries a failed move with the same idempotency key", async () => {
    const user = userEvent.setup();
    state.credits = { charged: 9, settlement: null };
    state.move.mockRejectedValueOnce(
      new Error("The connection failed and your changes were not saved — try again."),
    );
    renderDetails([], { credit_month: current });
    await user.click(screen.getByRole("button", { name: "Move to another month" }));
    const dialog = screen.getByRole("dialog", { name: "Move to another month" });
    await user.click(
      within(dialog).getByRole("button", { name: `Move to ${creditMonthLabel(next)}` }),
    );
    await waitFor(() => expect(state.move).toHaveBeenCalledTimes(1));
    await user.click(
      within(dialog).getByRole("button", { name: `Move to ${creditMonthLabel(next)}` }),
    );
    await waitFor(() => expect(state.move).toHaveBeenCalledTimes(2));
    const [first, second] = state.move.mock.calls.map((call) => call[1].idempotencyKey);
    expect(first).toBe(second);
  });

  it("asks for the full charge when the project's month has expired", async () => {
    const user = userEvent.setup();
    state.credits = { charged: 9, settlement: null };
    renderDetails([], { credit_month: previous });
    await user.click(screen.getByRole("button", { name: "Move to another month" }));
    const dialog = screen.getByRole("dialog", { name: "Move to another month" });
    // The current month has 2 credits in this fixture; pick a month with enough.
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "New month" }), next);
    expect(within(dialog).getByText(/its credits expired/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: `Move to ${creditMonthLabel(next)}` }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /Charge the full 9 credits/ }));
    await user.click(
      within(dialog).getByRole("button", { name: `Move to ${creditMonthLabel(next)}` }),
    );
    await waitFor(() =>
      expect(state.move).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ toMonth: next, chargeFull: true }),
      ),
    );
  });

  it("warns when the chosen month cannot take the charge", async () => {
    const user = userEvent.setup();
    state.credits = { charged: 9, settlement: null };
    renderDetails([], { credit_month: next });
    await user.click(screen.getByRole("button", { name: "Move to another month" }));
    const dialog = screen.getByRole("dialog", { name: "Move to another month" });
    expect(within(dialog).getByText(/has 2 credits available; 7 more are needed/)).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: `Move to ${creditMonthLabel(current)}` }),
    ).toBeDisabled();
  });

  it("settles at delivery and offers another charge month on a shortfall", async () => {
    const user = userEvent.setup();
    state.credits = { charged: 9, settlement: null };
    state.settle.mockRejectedValueOnce(new MonthShortfallError(current, 2, 1));
    renderDetails([], { credit_month: current, status: "delivered" });
    await user.click(screen.getByRole("button", { name: "Settle final credits" }));
    const dialog = screen.getByRole("dialog", { name: "Settle final credits" });
    const total = within(dialog).getByRole("spinbutton", { name: "Final total" });
    await user.clear(total);
    await user.type(total, "12");
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Two extra sizes");
    expect(
      within(dialog).getByText(`3 more credits will be charged to ${creditMonthLabel(current)}.`),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Settle credits" }));
    expect(await within(dialog).findByText(/has 2 credits available, 1 short/)).toBeVisible();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Charge month" }), next);
    await user.click(within(dialog).getByRole("button", { name: "Settle credits" }));
    await waitFor(() => expect(state.settle).toHaveBeenCalledTimes(2));
    const [first, second] = state.settle.mock.calls.map((call) => call[1]);
    expect(first).toMatchObject({ finalCredits: 12, reason: "Two extra sizes", chargeMonth: null });
    expect(second).toMatchObject({ chargeMonth: next, idempotencyKey: first.idempotencyKey });
  });

  it("shows the settlement and its reason to the client, and stops further changes", () => {
    state.role = "client";
    state.credits = {
      charged: 7,
      settlement: {
        final_credits: 7,
        difference: -2,
        charged_month: current,
        reason: "One size dropped",
      },
    };
    renderDetails([], { credit_month: current, status: "delivered" });
    expect(screen.getByText(`2 refunded to ${creditMonthLabel(current)}`)).toBeInTheDocument();
    expect(screen.getByText("One size dropped")).toBeInTheDocument();
  });

  it("offers the studio no move or settle once settled", () => {
    state.credits = {
      charged: 7,
      settlement: { final_credits: 7, difference: 0, charged_month: null, reason: "As quoted" },
    };
    renderDetails([], { credit_month: current, status: "delivered" });
    expect(screen.getByText("No change")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move to another month|Settle/ })).toBeNull();
  });
});

describe("ProjectDetails Drive link", () => {
  it("offers Add Drive link to the agency when none is set", () => {
    renderDetails();
    expect(screen.getByText("Google Drive backup")).toBeInTheDocument();
    expect(screen.getByText("No backup link yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Drive link" })).toBeInTheDocument();
  });

  it("offers Edit Drive link, and the open link, once one is set", () => {
    renderDetails([], { drive_url: "https://drive.google.com/drive/folders/1" });
    expect(screen.getByRole("button", { name: "Edit Drive link" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open Google Drive backup" });
    expect(link).toHaveAttribute("href", "https://drive.google.com/drive/folders/1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("hides the control from a client and a designer", () => {
    state.role = "client";
    renderDetails([], { drive_url: "https://drive.google.com/drive/folders/1" });
    expect(screen.queryByText("Google Drive backup")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open Google Drive backup" }),
    ).not.toBeInTheDocument();
    state.role = "designer";
    renderDetails([], { drive_url: "https://drive.google.com/drive/folders/1" });
    expect(screen.queryByText("Google Drive backup")).not.toBeInTheDocument();
  });

  it("refuses an invalid link before it is ever sent", async () => {
    const user = userEvent.setup();
    renderDetails();
    await user.click(screen.getByRole("button", { name: "Add Drive link" }));
    const input = screen.getByLabelText("Drive link");
    await user.type(input, "http://drive.google.com/drive/folders/1");
    await user.click(screen.getByRole("button", { name: "Save link" }));
    expect(
      await screen.findByText("Paste a Google Drive link (https://drive.google.com/…)."),
    ).toBeInTheDocument();
  });
});
