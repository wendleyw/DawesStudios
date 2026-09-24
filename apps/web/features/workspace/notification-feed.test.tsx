import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, session: { user: { id: "viewer" } } }),
}));
vi.mock("./workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workspace-data")>()),
  useNotifications: () => ({ isPending: false, error: null, data: fixture.items }),
  useUnreadNotificationCount: () => ({ data: fixture.unread }),
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
});
