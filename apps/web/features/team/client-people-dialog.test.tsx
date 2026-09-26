import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  team: [] as { user_id: string; display_name: string; email: string }[],
  pending: [] as { id: string; display_name: string }[],
  remove: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ session: { access_token: "token-1" }, profile: { role: "agency" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return { ...actual, useDateFormat: () => actual.createDateFormatters("UTC") };
});
vi.mock("./team-page", () => ({
  InvitePerson: ({ clientId, onSent }: { clientId?: string; onSent: () => void }) => (
    <button onClick={onSent}>Send the {clientId} invitation</button>
  ),
}));
vi.mock("./team-data", () => ({
  clientPeopleQueryKeys: { people: "client-people", notifications: "client-notification-choices" },
  useClientPeople: () => ({
    data: { team: state.team, names: {} },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePendingClientRemovals: () => ({
    data: state.pending,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useInvitations: () => ({
    data: [
      {
        id: "i1",
        email: "new@sabre.test",
        role: "client",
        client_id: "sabre",
        status: "pending",
        expires_at: "2999-01-02T00:00:00Z",
        created_at: "2026-09-24T00:00:00Z",
      },
      {
        id: "i2",
        email: "late@sabre.test",
        role: "client",
        client_id: "sabre",
        status: "pending",
        expires_at: "2026-01-01T00:00:00Z",
        created_at: "2025-12-25T00:00:00Z",
      },
      {
        id: "i3",
        email: "other@acme.test",
        role: "client",
        client_id: "acme",
        status: "pending",
        expires_at: "2999-01-02T00:00:00Z",
        created_at: "2026-09-24T00:00:00Z",
      },
      {
        id: "i4",
        email: "done@sabre.test",
        role: "client",
        client_id: "sabre",
        status: "accepted",
        expires_at: "2999-01-02T00:00:00Z",
        created_at: "2026-09-20T00:00:00Z",
      },
    ],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  removeClientMember: state.remove,
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

import { ClientPeopleDialog } from "./client-people-dialog";

const ana = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const ben = { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" };

function renderDialog() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClientPeopleDialog clientId="sabre" clientName="SABRE" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return within(screen.getByRole("dialog", { name: "SABRE people" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.team = [ana, ben];
  state.pending = [];
  state.remove.mockResolvedValue(undefined);
});

describe("ClientPeopleDialog", () => {
  it("lists the client's people with their emails and only this client's pending invitations", () => {
    const dialog = renderDialog();
    expect(dialog.getByText("Ana Lima")).toBeInTheDocument();
    expect(dialog.getByText("ben@sabre.test")).toBeInTheDocument();
    expect(dialog.getByText("new@sabre.test")).toBeInTheDocument();
    expect(dialog.getByText("Invitation expires Jan 2")).toBeInTheDocument();
    for (const hidden of ["late@sabre.test", "other@acme.test", "done@sabre.test"])
      expect(dialog.queryByText(hidden)).not.toBeInTheDocument();
  });

  it("asks before removing someone and says what they lose", async () => {
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Remove Ben Cole" }));
    const confirm = screen.getByRole("dialog", { name: "Remove Ben Cole?" });
    expect(confirm).toHaveTextContent("Ben Cole loses access to SABRE.");
    expect(confirm).not.toHaveTextContent("will have nobody");
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(state.remove).toHaveBeenCalledWith(
        { access_token: "token-1" },
        { clientId: "sabre", profileId: "ben" },
      ),
    );
    expect(await dialog.findByText("Ben Cole no longer has access to SABRE.")).toBeInTheDocument();
  });

  it("warns that removing the last person leaves the client with nobody", async () => {
    state.team = [ana];
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Remove Ana Lima" }));
    expect(screen.getByRole("dialog", { name: "Remove Ana Lima?" })).toHaveTextContent(
      "SABRE will have nobody who can sign in until someone is invited.",
    );
  });

  it("keeps a failed removal open with the reason, ready to try again", async () => {
    state.remove.mockRejectedValue(
      new Error(
        "Access to this client was removed, but the account could not be blocked from signing in. Try again.",
      ),
    );
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Remove Ben Cole" }));
    const confirm = screen.getByRole("dialog", { name: "Remove Ben Cole?" });
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "could not be blocked from signing in",
    );
    expect(within(confirm).getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it("lists a removal still waiting for its sign-in block, with Finish removal", async () => {
    state.pending = [{ id: "cy", display_name: "Cy Gone" }];
    const user = userEvent.setup();
    const dialog = renderDialog();
    expect(dialog.getByText("Access removed · Account block pending")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Finish removal for Cy Gone" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Remove Cy Gone?" })).getByRole("button", {
        name: "Remove",
      }),
    );
    await waitFor(() =>
      expect(state.remove).toHaveBeenCalledWith(
        { access_token: "token-1" },
        { clientId: "sabre", profileId: "cy" },
      ),
    );
  });

  it("opens the existing invite form and confirms the sent invitation", async () => {
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Invite person" }));
    await user.click(screen.getByRole("button", { name: "Send the sabre invitation" }));
    expect(await dialog.findByText("Invitation email sent.")).toBeInTheDocument();
  });
});
