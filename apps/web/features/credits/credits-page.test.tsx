import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creditMonthOf, creditMonthRange, writableCreditMonths } from "./credit-model";

const state = vi.hoisted(() => ({ role: "agency" as "agency" | "client" | "designer" }));
const query = (data: unknown, extra: Record<string, unknown> = {}) => ({
  data,
  isPending: false,
  isFetching: false,
  isPlaceholderData: false,
  error: null,
  refetch: vi.fn(),
  ...extra,
});
const summaryFor = (month: string) => ({
  month,
  status: "open",
  available: 100,
  allowance: 100,
  extras: 0,
  used: 0,
  transferred: 0,
  expiring: 0,
  expired: 0,
  expires_on: "2026-09-30",
});

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE", slug: "sabre" }]),
    useProjects: () => query([]),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefings: () => query([]),
  useCampaigns: () => query([]),
}));
vi.mock("./credit-data", () => ({
  useCreditLedger: () => query([]),
  useCreditMonthSummary: (_clientId: string, month: string) => query(summaryFor(month)),
  useCreditPlans: () => query([]),
  useCreditRequests: () => query([]),
}));

import { CreditsPage } from "./credits-page";

const currentMonth = creditMonthOf(new Date());
const months = creditMonthRange(currentMonth, 11, 11);

beforeEach(() => {
  state.role = "agency";
});

describe("CreditsPage month actions", () => {
  it("gives the agency Set plan, Add extra and Transfer on the current (writable) month", () => {
    render(<CreditsPage clientId="c1" />);
    expect(screen.getByRole("button", { name: "Set plan" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add extra" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeVisible();
  });

  it("gives a client viewer none of the agency's month actions", () => {
    state.role = "client";
    render(<CreditsPage clientId="c1" />);
    expect(screen.queryByRole("button", { name: "Set plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add extra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transfer" })).not.toBeInTheDocument();
  });

  it("keeps Set plan but hides Add extra and Transfer for a month outside the writable window", async () => {
    const user = userEvent.setup();
    render(<CreditsPage clientId="c1" />);
    const select = screen.getByRole("combobox", { name: "Credit month" });
    const pastMonth = months[0];
    expect(writableCreditMonths(currentMonth)).not.toContain(pastMonth);
    await user.selectOptions(select, pastMonth);
    expect(screen.getByRole("button", { name: "Set plan" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add extra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transfer" })).not.toBeInTheDocument();
  });
});

describe("CreditsPage month switcher", () => {
  it("disables Previous month and Next month at the window's edges", async () => {
    const user = userEvent.setup();
    render(<CreditsPage clientId="c1" />);
    const select = screen.getByRole("combobox", { name: "Credit month" });
    expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();

    await user.selectOptions(select, months[0]);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();

    await user.selectOptions(select, months.at(-1)!);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });
});
