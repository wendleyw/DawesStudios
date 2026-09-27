import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  setCreditPlan: vi.fn(),
  addMonthExtra: vi.fn(),
  transferMonthCredits: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { name: "database" } }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatMonth: (month: string) => `month:${month}` }),
}));
vi.mock("@/features/shared/modal", () => ({
  Modal: ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}));
vi.mock("./credit-data", () => ({
  setCreditPlan: data.setCreditPlan,
  addMonthExtra: data.addMonthExtra,
  transferMonthCredits: data.transferMonthCredits,
  adjustCredits: vi.fn(),
  requestCredits: vi.fn(),
  reviewCreditRequest: vi.fn(),
  useInvalidateCredits: () => data.invalidate,
}));

import { CreditMonthDialog, type CreditMonthAction } from "./credit-actions";

function renderDialog(mode: CreditMonthAction, month = "2026-10-01", onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CreditMonthDialog
        clientId="client-1"
        mode={mode}
        currentMonth="2026-09-01"
        month={month}
        monthlyCredits={100}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  data.setCreditPlan.mockReset().mockResolvedValue(undefined);
  data.addMonthExtra.mockReset().mockResolvedValue(undefined);
  data.transferMonthCredits.mockReset().mockResolvedValue(undefined);
  data.invalidate.mockReset().mockResolvedValue(undefined);
});

describe("CreditMonthDialog", () => {
  it("offers only the current month and the next 11", () => {
    renderDialog("extra");
    const options = screen.getAllByRole("option").map((option) => option.getAttribute("value"));
    expect(options).toHaveLength(12);
    expect(options[0]).toBe("2026-09-01");
    expect(options.at(-1)).toBe("2027-08-01");
    expect(screen.getByLabelText("Month")).toHaveValue("2026-10-01");
  });

  it("falls back to the current month when the page shows a past one", () => {
    renderDialog("extra", "2026-05-01");
    expect(screen.getByLabelText("Month")).toHaveValue("2026-09-01");
  });

  it("sets a plan from a start month, prefilled with the plan in force", async () => {
    const onClose = renderDialog("plan");
    expect(screen.getByLabelText("Credits per month")).toHaveValue(100);
    await userEvent.clear(screen.getByLabelText("Credits per month"));
    await userEvent.type(screen.getByLabelText("Credits per month"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(data.setCreditPlan).toHaveBeenCalledWith(
      { name: "database" },
      { clientId: "client-1", monthlyCredits: 150, startsOn: "2026-10-01" },
    );
  });

  it("adds an extra with a trimmed reason and keeps its key across a retry", async () => {
    data.addMonthExtra.mockRejectedValueOnce(
      new Error("Choose the current month or one of the next 11 months."),
    );
    renderDialog("extra");
    await userEvent.type(screen.getByLabelText("Credits"), "20");
    await userEvent.type(screen.getByLabelText("Reason"), "  Launch push  ");
    await userEvent.click(screen.getByRole("button", { name: "Add credits" }));
    expect(
      await screen.findByText("Choose the current month or one of the next 11 months."),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add credits" }));
    await waitFor(() => expect(data.addMonthExtra).toHaveBeenCalledTimes(2));
    const [first, second] = data.addMonthExtra.mock.calls.map((call) => call[1]);
    expect(first).toMatchObject({ month: "2026-10-01", amount: 20, reason: "Launch push" });
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toMatch(/^extra:/);
  });

  it("asks for a reason before adding an extra", async () => {
    renderDialog("extra");
    await userEvent.type(screen.getByLabelText("Credits"), "5");
    await userEvent.type(screen.getByLabelText("Reason"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Add credits" }));
    expect(await screen.findByText("Add a reason the client will see.")).toBeTruthy();
    expect(data.addMonthExtra).not.toHaveBeenCalled();
  });

  it("transfers between two different months and refuses the same month", async () => {
    const onClose = renderDialog("transfer");
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-09-01");
    await userEvent.type(screen.getByLabelText("Credits"), "10");
    await userEvent.type(screen.getByLabelText("Reason"), "Bring forward");
    await userEvent.selectOptions(screen.getByLabelText("To"), "2026-10-01");
    await userEvent.click(screen.getByRole("button", { name: "Transfer credits" }));
    expect(await screen.findByText("Choose two different months.")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("To"), "2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Transfer credits" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(data.transferMonthCredits).toHaveBeenCalledWith(
      { name: "database" },
      expect.objectContaining({
        clientId: "client-1",
        fromMonth: "2026-10-01",
        toMonth: "2026-12-01",
        amount: 10,
        reason: "Bring forward",
      }),
    );
    expect(data.invalidate).toHaveBeenCalled();
  });
});
