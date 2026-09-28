import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionNotifications } from "./action-notifications";
import { useActionNotifications, type ActionNotification } from "./workspace-data";

const auth = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: auth.database, session: { user: { id: "viewer" } } }),
}));

function action(kind: string): ActionNotification {
  return {
    id: `action-${kind}`,
    kind,
    client_id: "client-1",
    project_id: "project-1",
    entity_id: "entity-1",
    board_id: "board-1",
    subject: `Subject for ${kind}`,
    created_at: "2026-09-27T12:00:00Z",
  };
}

function databaseResult(result: {
  data: ActionNotification[] | null;
  count: number | null;
  error: unknown;
}) {
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
  };
  const database = { from: vi.fn().mockReturnValue(query) };
  auth.database = database;
  return { database, query };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  databaseResult({ data: [], count: 0, error: null });
});

describe("ActionNotifications", () => {
  it.each([
    ["review_briefing", "/clients/client-1/briefings/entity-1", "Review briefing"],
    ["start_project", "/clients/client-1/briefings/entity-1", "Start project"],
    ["prepare_project", "/projects/project-1?channel=internal&panel=details", "Prepare project"],
    [
      "review_round",
      "/projects/project-1?channel=internal&board=board-1&round=entity-1",
      "Review round",
    ],
    [
      "prepare_board",
      "/projects/project-1?channel=internal&board=board-1&panel=details",
      "Prepare production brief",
    ],
    ["revise_board", "/projects/project-1?channel=internal&board=board-1", "Make changes"],
    ["submit_round", "/projects/project-1?channel=internal&board=board-1", "Submit round"],
    [
      "respond_feedback",
      "/projects/project-1?channel=client&version=entity-1&panel=comments",
      "Respond to feedback",
    ],
    ["deliver_project", "/clients/client-1/brand/files?project=project-1", "Deliver project"],
    ["review_version", "/projects/project-1?channel=client&version=entity-1", "Review version"],
    ["review_credit_request", "/clients/client-1/credits#credit-requests", "Review credit request"],
  ])("opens %s at its workflow destination", async (kind, destination, label) => {
    databaseResult({ data: [action(kind)], count: 1, error: null });

    render(<ActionNotifications />, { wrapper });

    const link = await screen.findByRole("link", { name: new RegExp(`Subject for ${kind}`) });
    expect(link).toHaveAttribute("href", destination);
    expect(link).toHaveTextContent(label);
  });

  it("requests the exact total while loading only the latest 100 actions", async () => {
    const { database, query } = databaseResult({
      data: [action("review_briefing")],
      count: 143,
      error: null,
    });

    render(<ActionNotifications />, { wrapper });

    expect(await screen.findByText("Showing 1–100 of 143 actions.")).toBeInTheDocument();
    expect(database.from).toHaveBeenCalledWith("action_notifications");
    expect(query.select).toHaveBeenCalledWith("*", { count: "exact" });
    expect(query.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(query.range).toHaveBeenCalledWith(0, 99);
  });

  it("keeps older unresolved actions reachable and allows returning to the first page", async () => {
    const { query } = databaseResult({
      data: [action("review_briefing")],
      count: 143,
      error: null,
    });
    render(<ActionNotifications />, { wrapper });
    await screen.findByText("Showing 1–100 of 143 actions.");
    query.range.mockResolvedValue({ data: [action("start_project")], count: 143, error: null });
    await userEvent.setup().click(screen.getByRole("button", { name: "Next actions" }));
    expect(await screen.findByText("Showing 101–143 of 143 actions.")).toBeInTheDocument();
    expect(query.range).toHaveBeenLastCalledWith(100, 199);
    expect(screen.getByRole("button", { name: "Next actions" })).toBeDisabled();
    expect(screen.getByRole("link")).toHaveTextContent("Start project");
    await userEvent.setup().click(screen.getByRole("button", { name: "Previous actions" }));
    expect(await screen.findByText("Showing 1–100 of 143 actions.")).toBeInTheDocument();
  });

  it("states when no actions are needed", async () => {
    render(<ActionNotifications />, { wrapper });

    expect(await screen.findByText("No actions needed.")).toBeInTheDocument();
  });

  it("shows loading until the query resolves", () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    auth.database = { from: vi.fn().mockReturnValue(query) };

    render(<ActionNotifications />, { wrapper });

    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Loading actions…");
  });

  it("offers a retry after a failed action read", async () => {
    const { query } = databaseResult({ data: null, count: null, error: { message: "offline" } });
    render(<ActionNotifications />, { wrapper });

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load actions.");
    query.range.mockResolvedValueOnce({ data: [], count: 0, error: null });
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No actions needed.")).toBeInTheDocument();
  });
});

describe("useActionNotifications", () => {
  it("keeps the exact count and loaded page together", async () => {
    databaseResult({ data: [action("review_briefing")], count: 143, error: null });

    const { result } = renderHook(() => useActionNotifications(), { wrapper });

    await waitFor(() =>
      expect(result.current.data).toEqual({ items: [action("review_briefing")], count: 143 }),
    );
  });
});
