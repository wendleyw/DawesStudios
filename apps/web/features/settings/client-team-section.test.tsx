import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "client" as "agency" | "client" | "designer",
  choices: [] as { client_id: string; notify_all: boolean }[],
  setNotifications: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    database: { name: "database" },
    session: { user: { id: "ana" } },
    profile: { id: "ana", role: state.role },
  }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useClients: () => ({
    data: [
      { id: "sabre", name: "SABRE" },
      { id: "acme", name: "Acme" },
    ],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/features/team/team-data", () => ({
  clientPeopleQueryKeys: { people: "client-people", notifications: "client-notification-choices" },
  useClientNotificationChoices: () => ({
    data: state.choices,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useClientPeople: (clientId: string) => ({
    data: {
      team:
        clientId === "sabre"
          ? [
              { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" },
              { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" },
            ]
          : [{ user_id: "ana", display_name: "Ana Lima", email: "ana@acme.test" }],
      names: {},
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  setClientNotifications: state.setNotifications,
}));

import { ClientTeamSections } from "./client-team-section";

function renderSections() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ClientTeamSections />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.role = "client";
  state.choices = [
    { client_id: "sabre", notify_all: false },
    { client_id: "acme", notify_all: true },
  ];
  state.setNotifications.mockResolvedValue(undefined);
});

describe("ClientTeamSections", () => {
  it("shows one Team section per client, with each teammate and the viewer marked You", () => {
    renderSections();
    const sabre = within(screen.getByRole("region", { name: "SABRE team" }));
    expect(sabre.getByText("Ben Cole")).toBeInTheDocument();
    expect(sabre.getByText("ben@sabre.test")).toBeInTheDocument();
    expect(sabre.getByText("You")).toBeInTheDocument();
    expect(sabre.getByText(/To add or remove someone, contact the studio\./)).toBeInTheDocument();
    const acme = within(screen.getByRole("region", { name: "Acme team" }));
    expect(acme.getByText("ana@acme.test")).toBeInTheDocument();
    expect(acme.queryByText("Ben Cole")).not.toBeInTheDocument();
  });

  it("keeps each client's notification choice separate", async () => {
    renderSections();
    const sabre = within(screen.getByRole("region", { name: "SABRE team" }));
    const acme = within(screen.getByRole("region", { name: "Acme team" }));
    expect(sabre.getByRole("button", { name: "My requests" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(acme.getByRole("button", { name: "All Acme activity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.setup().click(sabre.getByRole("button", { name: "All SABRE activity" }));
    await waitFor(() =>
      expect(state.setNotifications).toHaveBeenCalledWith(
        { name: "database" },
        { clientId: "sabre", all: true },
      ),
    );
  });

  it("does not resend the choice already in place", async () => {
    renderSections();
    const sabre = within(screen.getByRole("region", { name: "SABRE team" }));
    await userEvent.setup().click(sabre.getByRole("button", { name: "My requests" }));
    expect(state.setNotifications).not.toHaveBeenCalled();
  });

  it.each(["agency", "designer"] as const)("renders nothing for a %s", (role) => {
    state.role = role;
    const { container } = renderSections();
    expect(container).toBeEmptyDOMElement();
  });
});
