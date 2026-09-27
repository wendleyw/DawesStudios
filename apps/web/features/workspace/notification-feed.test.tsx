import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationFeed } from "./notification-feed";
import { NotificationsBell } from "./notifications-bell";

const fixture = vi.hoisted(() => ({
  items: [] as {
    id: string;
    title: string;
    body: string;
    read_at: string | null;
    created_at: string;
    project_id: null;
    client_id: null;
  }[],
  unread: 0,
  actionCount: 0,
  actionItems: [] as {
    id: string;
    kind: string;
    client_id: string;
    project_id: string | null;
    entity_id: string;
    board_id: string | null;
    subject: string;
    created_at: string;
  }[],
  markRead: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, session: { user: { id: "viewer" } } }),
}));
vi.mock("./workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workspace-data")>()),
  useNotifications: () => ({ isPending: false, error: null, data: fixture.items }),
  useUnreadNotificationCount: () => ({ data: fixture.unread }),
  useActionNotifications: () => ({
    isPending: false,
    error: null,
    data: { items: fixture.actionItems, count: fixture.actionCount },
  }),
  markNotificationsRead: fixture.markRead,
  useInvalidateNotifications: () => vi.fn(),
  useDateFormat: () => ({ formatDateTime: () => "Sep 23, 2026, 11:40 AM" }),
}));

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    title: `Notification ${index}`,
    body: "",
    read_at: null,
    created_at: "2026-09-23T15:40:00Z",
    project_id: null,
    client_id: null,
  }));
}

function renderWithQueries(node: ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  fixture.items = items(100);
  fixture.unread = 271;
  fixture.actionCount = 0;
  fixture.actionItems = [];
  fixture.markRead.mockReset();
});

describe("notification counts", () => {
  it("states every unread notification, not only those in the loaded page", () => {
    renderWithQueries(<NotificationFeed />);
    expect(screen.getByText("271 notifications waiting for you.")).toBeInTheDocument();
  });

  it("says the page lists only the latest 100 when there are more", () => {
    renderWithQueries(<NotificationFeed />);
    expect(screen.getByText("Showing the latest 100.")).toBeInTheDocument();
  });

  it("says nothing about a limit the list does not reach", () => {
    fixture.items = items(3);
    fixture.unread = 3;
    renderWithQueries(<NotificationFeed />);
    expect(screen.getByText("3 notifications waiting for you.")).toBeInTheDocument();
    expect(screen.queryByText("Showing the latest 100.")).not.toBeInTheDocument();
  });

  it("gives the bell the same exact count", () => {
    renderWithQueries(<NotificationsBell />);
    expect(screen.getByRole("link", { name: "Notifications, 271 unread" })).toBeInTheDocument();
  });

  it("keeps pending actions visible when activity has no unread entries", () => {
    fixture.items = [];
    fixture.unread = 0;
    fixture.actionCount = 1;
    fixture.actionItems = [
      {
        id: "action-1",
        kind: "review_briefing",
        client_id: "client-1",
        project_id: null,
        entity_id: "briefing-1",
        board_id: null,
        subject: "Autumn campaign",
        created_at: "2026-09-23T15:40:00Z",
      },
    ];

    renderWithQueries(<NotificationFeed />);

    expect(screen.getByText("1 action waiting for you.")).toBeInTheDocument();
    expect(screen.queryByText("You’re up to date.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Autumn campaign/i })).toHaveAttribute(
      "href",
      "/clients/client-1/briefings/briefing-1",
    );
  });

  it("marks only activity read while leaving the action queue present", async () => {
    fixture.items = items(1);
    fixture.unread = 1;
    fixture.actionCount = 1;
    fixture.actionItems = [
      {
        id: "action-1",
        kind: "review_credit_request",
        client_id: "client-1",
        project_id: null,
        entity_id: "request-1",
        board_id: null,
        subject: "Extra credits",
        created_at: "2026-09-23T15:40:00Z",
      },
    ];

    renderWithQueries(<NotificationFeed />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark all read" }));

    expect(fixture.markRead).toHaveBeenCalledWith({}, { userId: "viewer", id: undefined });
    expect(screen.getByRole("link", { name: /Extra credits/i })).toBeInTheDocument();
  });

  it("lights the bell for pending actions with zero unread activity", () => {
    fixture.unread = 0;
    fixture.actionCount = 125;

    renderWithQueries(<NotificationsBell />);

    expect(screen.getByRole("link", { name: "Notifications, 125 actions needed" })).toHaveClass(
      "has-unread",
    );
  });

  it("announces unread and action counts separately", () => {
    fixture.unread = 3;
    fixture.actionCount = 125;

    renderWithQueries(<NotificationsBell />);

    expect(
      screen.getByRole("link", { name: "Notifications, 3 unread, 125 actions needed" }),
    ).toBeInTheDocument();
  });
});
