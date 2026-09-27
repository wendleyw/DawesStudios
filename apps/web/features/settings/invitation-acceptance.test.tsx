import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvitationAcceptance } from "./invitation-acceptance";

const state = vi.hoisted(() => ({
  passwordRequired: false,
  forgedExistingHint: false,
  setupError: null as Error | null,
  signedIn: true,
  accept: vi.fn(),
  updateUser: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () =>
    new URLSearchParams(`token=${"a".repeat(64)}${state.forgedExistingHint ? "&existing=1" : ""}`),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    database: { auth: { updateUser: state.updateUser, signOut: vi.fn() } },
    session: state.signedIn ? { user: { email: "person@fixture.local" } } : null,
    loading: false,
  }),
}));
vi.mock("./settings-data", () => ({
  acceptInvitation: state.accept,
  useInvitationPasswordRequirement: () => ({
    data: state.setupError ? undefined : state.passwordRequired,
    isPending: false,
    isError: !!state.setupError,
    refetch: vi.fn(async () =>
      state.setupError
        ? { isSuccess: false, error: state.setupError }
        : { isSuccess: true, data: state.passwordRequired },
    ),
  }),
}));

function renderInvitation() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <InvitationAcceptance />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.passwordRequired = false;
  state.forgedExistingHint = false;
  state.setupError = null;
  state.signedIn = true;
  window.history.replaceState(null, "", "/auth/invite");
  state.accept.mockResolvedValue(undefined);
  state.updateUser.mockResolvedValue({ error: null });
});

describe("InvitationAcceptance", () => {
  it.each([true, false])(
    "explains failed email verification without asking for a password (signed in: %s)",
    (signedIn) => {
      state.signedIn = signedIn;
      window.history.replaceState(
        null,
        "",
        "/auth/invite#error=access_denied&error_code=otp_expired&error_description=Untrusted+message",
      );
      renderInvitation();

      expect(
        screen.getByRole("heading", { name: "This invitation link is unavailable." }),
      ).toBeVisible();
      expect(screen.queryByLabelText("Password", { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByText("Untrusted message")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
        "href",
        "/login",
      );
      expect(state.accept).not.toHaveBeenCalled();
      expect(state.updateUser).not.toHaveBeenCalled();
    },
  );

  it("keeps sign-in available for an existing account with an unverified application link", () => {
    state.signedIn = false;
    renderInvitation();

    expect(screen.getByRole("button", { name: "Sign in to accept" })).toBeVisible();
  });

  it("accepts an existing account without updating its password", async () => {
    renderInvitation();

    expect(screen.queryByLabelText("Password", { exact: true })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() =>
      expect(state.accept).toHaveBeenCalledWith(expect.anything(), { token: "a".repeat(64) }),
    );
    expect(state.updateUser).not.toHaveBeenCalled();
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/home"));
  });

  it("asks a new account to set a password before acceptance", async () => {
    state.passwordRequired = true;
    state.forgedExistingHint = true;
    renderInvitation();

    await userEvent
      .setup()
      .type(screen.getByLabelText("Password", { exact: true }), "a-strong-password-123");
    await userEvent
      .setup()
      .type(screen.getByLabelText("Confirm password"), "a-strong-password-123");
    await userEvent.setup().click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() =>
      expect(state.updateUser).toHaveBeenCalledWith({ password: "a-strong-password-123" }),
    );
    await waitFor(() => expect(state.accept).toHaveBeenCalledTimes(1));
  });

  it("rejects the wrong signed-in email before touching its password", () => {
    state.passwordRequired = true;
    state.setupError = new Error("Invitation is invalid, expired or belongs to another email");
    renderInvitation();

    expect(screen.getByRole("heading", { name: "Invitation unavailable." })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
    expect(state.updateUser).not.toHaveBeenCalled();
  });
});
