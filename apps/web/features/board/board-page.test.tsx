import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardView } from "./board-views";
import { BoardPage } from "./board-page";

const fixture = vi.hoisted(() => ({
  view: null as BoardView | null,
  save: vi.fn(),
  database: {},
  campaignError: null as Error | null,
  refetchCampaigns: vi.fn(),
  role: "agency" as "agency" | "designer" | "client",
  widgets: [] as string[],
  widgetsEnabled: [] as boolean[],
  addWidget: vi.fn(),
  removeWidget: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/clients/client/board",
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: fixture.database, profile: { id: "viewer", role: fixture.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useClients: () => ({
    data: [{ id: "client", name: "Test client" }],
    isPending: false,
    refetch: vi.fn(),
  }),
  useProjects: () => ({ data: [], isPending: false, refetch: vi.fn() }),
  useDateFormat: () => ({ formatDate: () => "" }),
  useInvalidateWorkspace: () => vi.fn(),
}));
vi.mock("./board-data", () => ({
  useBoardPreferences: () =>
    useQuery({
      queryKey: ["preferences", "viewer", "client"],
      queryFn: async () => fixture.view,
    }),
  saveBoardView: fixture.save,
  useBoardCampaigns: () => ({
    data: [],
    error: fixture.campaignError,
    refetch: fixture.refetchCampaigns,
  }),
  useProjectArtwork: () => ({ data: {} }),
  moveProjectPosition: vi.fn(),
  useBoardWidgets: (_clientId: string, enabled: boolean) => {
    fixture.widgetsEnabled.push(enabled);
    return { data: enabled ? fixture.widgets : undefined, isPending: false, refetch: vi.fn() };
  },
  addBoardWidget: fixture.addWidget,
  removeBoardWidget: fixture.removeWidget,
}));
vi.mock("@/features/competitors/competitors-data", () => ({
  useCompetitors: () => ({ data: [], isPending: false }),
}));
vi.mock("./board-canvas-nodes", () => ({
  useBoardCanvasNodes: () => ({ nodes: [], content: { width: 0, height: 0 } }),
}));
vi.mock("./board-nodes", () => ({ boardNodeTypes: {} }));
vi.mock("./board-canvas-controls", () => ({ BoardCanvasControls: () => null }));
vi.mock("@xyflow/react", () => ({
  ReactFlow: () => null,
  Background: () => null,
  BackgroundVariant: { Lines: "lines" },
  PanOnScrollMode: { Free: "free" },
}));
vi.mock("@/features/workspace/client-mark", () => ({ ClientMark: () => null }));
vi.mock("@/features/workspace/notifications-bell", () => ({ NotificationsBell: () => null }));

beforeEach(() => {
  fixture.view = null;
  fixture.role = "agency";
  fixture.widgets = [];
  fixture.widgetsEnabled = [];
  fixture.addWidget.mockReset().mockResolvedValue(undefined);
  fixture.removeWidget.mockReset().mockResolvedValue(undefined);
  fixture.campaignError = null;
  fixture.refetchCampaigns.mockReset();
  fixture.save.mockReset().mockImplementation(async (_database, input) => {
    fixture.view = input.view;
    return input.view;
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mountBoard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BoardPage clientId="client" />
    </QueryClientProvider>,
  );
}

function pendingSave() {
  let resolve!: (view: BoardView) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<BoardView>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("BoardPage views", () => {
  it("offers recovery instead of rendering fabricated groups after a campaign read fails", async () => {
    fixture.campaignError = new Error("Campaigns unavailable");
    const user = userEvent.setup();
    mountBoard();

    expect(await screen.findByRole("heading", { name: "Board unavailable." })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Board view" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(fixture.refetchCampaigns).toHaveBeenCalledOnce();
  });

  it("offers five named icons and uses List as the unsaved mobile default", async () => {
    mountBoard();
    const picker = await screen.findByRole("group", { name: "Board view" });
    const buttons = within(picker).getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Canvas view",
      "List view",
      "Timeline view",
      "Kanban view",
      "Calendar view",
    ]);
    expect(buttons.every((button) => button.textContent === "")).toBe(true);
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Widgets" })).not.toBeInTheDocument();
  });

  it("keeps the saved choice on mobile and renders only its surface", async () => {
    fixture.view = "timeline";
    mountBoard();
    expect(await screen.findByRole("region", { name: "Project timeline" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Projects by status" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timeline view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the pending view and retains it after confirmation", async () => {
    const user = userEvent.setup();
    const saving = pendingSave();
    fixture.save.mockReturnValueOnce(saving.promise);
    mountBoard();
    await user.click(await screen.findByRole("button", { name: "Calendar view" }));
    const calendar = screen.getByRole("button", { name: "Calendar view" });
    expect(calendar).toHaveAttribute("aria-pressed", "true");
    expect(calendar).toBeDisabled();
    expect(screen.getByRole("region", { name: "Project calendar" })).toBeInTheDocument();
    expect(screen.getByText("Saving board view…")).toBeInTheDocument();
    fixture.view = "calendar";
    await act(async () => saving.resolve("calendar"));
    await waitFor(() => expect(calendar).toBeEnabled());
    expect(calendar).toHaveAttribute("aria-pressed", "true");
  });

  it("restores the confirmed view after failure and retries the intended view", async () => {
    const user = userEvent.setup();
    fixture.view = "timeline";
    const saving = pendingSave();
    fixture.save.mockReturnValueOnce(saving.promise);
    mountBoard();
    await user.click(await screen.findByRole("button", { name: "Kanban view" }));
    await act(async () => saving.reject(new Error("Connection interrupted")));
    await screen.findByText("Your board view could not be saved.");
    expect(screen.getByRole("button", { name: "Timeline view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Kanban view" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Kanban view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(fixture.save).toHaveBeenNthCalledWith(2, fixture.database, {
      clientId: "client",
      view: "kanban",
    });
  });

  it("keeps search and the calendar month when switching views", async () => {
    const user = userEvent.setup();
    fixture.view = "calendar";
    mountBoard();
    await screen.findByRole("region", { name: "Project calendar" });
    const initial = screen.getByRole("heading", { level: 2 }).textContent;
    await user.click(screen.getByRole("button", { name: "Next month" }));
    const next = screen.getByRole("heading", { level: 2 }).textContent;
    expect(next).not.toBe(initial);
    await user.click(screen.getByRole("button", { name: "Search projects" }));
    await user.type(screen.getByRole("textbox", { name: "Search projects" }), "Campaign");
    await user.click(screen.getByRole("button", { name: "Kanban view" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Calendar view" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Calendar view" }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(next!);
    await user.click(screen.getByRole("button", { name: "Search projects" }));
    expect(screen.getByRole("textbox", { name: "Search projects" })).toHaveValue("Campaign");
  });
  it("opens one tool panel at a time and returns keyboard focus on Escape", async () => {
    const user = userEvent.setup();
    mountBoard();
    const search = await screen.findByRole("button", { name: "Search projects" });
    expect(screen.queryByRole("textbox", { name: "Search projects" })).not.toBeInTheDocument();
    await user.click(search);
    expect(screen.getByRole("textbox", { name: "Search projects" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("combobox", { name: "Campaign" })).toHaveFocus();
    await user.click(search);
    expect(screen.queryByRole("combobox", { name: "Campaign" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search projects" })).toHaveFocus();
  });

  it("keeps filters when their panel closes and clears them from the search panel", async () => {
    const user = userEvent.setup();
    mountBoard();
    await user.click(await screen.findByRole("button", { name: "Filters" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "approved");
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("approved");
    await user.click(screen.getByRole("button", { name: "Search projects" }));
    await user.click(
      within(screen.getByRole("region", { name: "Project search" })).getByRole("button", {
        name: "Clear filters",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("");
  });
});

describe("BoardPage widgets", () => {
  it("lets the agency place the competitor ads widget from the Widgets panel", async () => {
    fixture.view = "canvas";
    mountBoard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Board widgets" }));
    const panel = screen.getByRole("region", { name: "Board widgets" });
    expect(panel).toHaveTextContent("Follow competitors' ads from the official ad libraries.");
    await user.click(within(panel).getByRole("button", { name: "Add to board" }));
    await waitFor(() =>
      expect(fixture.addWidget).toHaveBeenCalledWith(fixture.database, {
        clientId: "client",
        kind: "competitor_ads",
      }),
    );
  });

  it("offers removal once the widget is on the board", async () => {
    fixture.view = "canvas";
    fixture.widgets = ["competitor_ads"];
    mountBoard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Board widgets" }));
    await user.click(
      within(screen.getByRole("region", { name: "Board widgets" })).getByRole("button", {
        name: "Remove from board",
      }),
    );
    await waitFor(() =>
      expect(fixture.removeWidget).toHaveBeenCalledWith(fixture.database, {
        clientId: "client",
        kind: "competitor_ads",
      }),
    );
  });

  it("shows a failed placement in the panel", async () => {
    fixture.view = "canvas";
    fixture.addWidget.mockRejectedValue(new Error("Access removed"));
    mountBoard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Board widgets" }));
    await user.click(
      within(screen.getByRole("region", { name: "Board widgets" })).getByRole("button", {
        name: "Add to board",
      }),
    );
    expect(
      await within(screen.getByRole("region", { name: "Board widgets" })).findByRole("alert"),
    ).toHaveTextContent("Access removed");
  });

  it.each(["designer", "client"] as const)("gives a %s no Widgets button", async (role) => {
    fixture.view = "canvas";
    fixture.role = role;
    mountBoard();
    await screen.findByRole("group", { name: "Board tools" });
    expect(screen.queryByRole("button", { name: "Board widgets" })).not.toBeInTheDocument();
  });

  it("never asks for a client's widgets", async () => {
    fixture.view = "canvas";
    fixture.role = "client";
    mountBoard();
    await screen.findByRole("group", { name: "Board tools" });
    expect(fixture.widgetsEnabled.length).toBeGreaterThan(0);
    expect(fixture.widgetsEnabled).not.toContain(true);
  });
});
