import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ session: { access_token: "agency-token" } }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useClients: () => ({ data: [], isPending: false }),
}));
vi.mock("./team-data", () => ({ useInvalidateTeam: () => state.invalidate }));

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

import { InvitePerson } from "./team-page";

function renderInvite() {
  const onSent = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InvitePerson onClose={vi.fn()} onSent={onSent} />
    </QueryClientProvider>,
  );
  return onSent;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ delivered: true }) }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("InvitePerson", () => {
  it("sends the trimmed full name with a designer invitation", async () => {
    const user = userEvent.setup();
    const onSent = renderInvite();

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "ana@example.test");
    await user.type(screen.getByRole("textbox", { name: "Full name (optional)" }), "  Ana Lima  ");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/invitations",
      expect.objectContaining({
        body: JSON.stringify({
          email: "ana@example.test",
          displayName: "Ana Lima",
          role: "designer",
        }),
      }),
    );
  });

  it("omits a blank full name from the invitation request", async () => {
    const user = userEvent.setup();
    const onSent = renderInvite();

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "ana@example.test");
    await user.type(screen.getByRole("textbox", { name: "Full name (optional)" }), "   ");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/invitations",
      expect.objectContaining({
        body: JSON.stringify({ email: "ana@example.test", role: "designer" }),
      }),
    );
  });
});
