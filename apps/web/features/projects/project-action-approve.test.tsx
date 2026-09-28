import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApproveRoundButton } from "./project-action-approve";
import type { WorkflowBoard } from "./project-data";

const calls = vi.hoisted(() => ({ approve: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ database: {} }) }));
vi.mock("./project-data", () => ({
  approveBoardRound: calls.approve,
  useInvalidateProject: () => calls.invalidate,
}));

const board = { id: "b1", workflowRevision: 4 } as WorkflowBoard;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  calls.approve.mockReset();
  calls.invalidate.mockReset().mockResolvedValue(undefined);
});

describe("ApproveRoundButton", () => {
  it("approves the round on screen with the board revision it was shown at", async () => {
    calls.approve.mockResolvedValue({ outcome: "approved" });
    render(<ApproveRoundButton board={board} roundId="r2" roundNumber={2} />, { wrapper });
    await userEvent.setup().click(screen.getByRole("button", { name: "Approve round 2" }));
    await waitFor(() => expect(calls.invalidate).toHaveBeenCalled());
    expect(calls.approve).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ boardId: "b1", roundId: "r2", boardRevision: 4 }),
    );
  });

  it("retries a failed approval with the same request key and shows why it failed", async () => {
    calls.approve.mockRejectedValueOnce(new Error("Network lost")).mockResolvedValue({});
    const user = userEvent.setup();
    render(<ApproveRoundButton board={board} roundId="r2" roundNumber={2} />, { wrapper });
    await user.click(screen.getByRole("button", { name: "Approve round 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network lost");
    await user.click(screen.getByRole("button", { name: "Approve round 2" }));
    await waitFor(() => expect(calls.approve).toHaveBeenCalledTimes(2));
    const [first, second] = calls.approve.mock.calls.map(([, input]) => input.requestId);
    expect(second).toBe(first);
  });
});
