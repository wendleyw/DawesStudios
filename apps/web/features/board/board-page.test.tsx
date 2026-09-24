import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";
import type { BoardCampaign } from "./board-layout";
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
  projects: [] as Project[],
  campaigns: [] as BoardCampaign[],
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
  useProjects: () => ({ data: fixture.projects, isPending: false, refetch: vi.fn() }),
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
    data: fixture.campaigns,
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
  fixture.projects = [];
  fixture.campaigns = [];
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

function project(overrides: Partial<Project> & { id: string; title: string }): Project {
  return {
    client_id: "client",
    campaign_id: null,
    briefing_id: null,
    description: "",
    status: "planned",
    service_type: "",
    due_date: null,
    start_date: null,
    board_position: { x: 0, y: 0 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
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

  it("offers five named icons and uses List as the unsaved default", async () => {
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

  it("opens an unsaved desktop board as a list rather than the canvas", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mountBoard();
    expect(await screen.findByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Canvas view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
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

describe("BoardPage list sort", () => {
  const titles = ["Banana launch", "Apple launch", "Cherry launch"];
  // Every link's accessible text starts with its project's title, so mapping the full link list
  // down to the ones that match a known title both finds the rows among the header nav links and
  // preserves their on-screen order.
  function visibleTitleOrder() {
    return screen
      .getAllByRole("link")
      .map((link) => titles.find((title) => (link.textContent ?? "").startsWith(title)))
      .filter((title): title is string => Boolean(title));
  }

  it("sorts by Project on the first click and reverses it on the second", async () => {
    const user = userEvent.setup();
    fixture.view = "list";
    fixture.projects = [
      project({ id: "p1", title: "Banana launch" }),
      project({ id: "p2", title: "Apple launch" }),
      project({ id: "p3", title: "Cherry launch" }),
    ];
    mountBoard();
    await screen.findByRole("button", { name: "Project" });
    expect(visibleTitleOrder()).toEqual(["Banana launch", "Apple launch", "Cherry launch"]);

    await user.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByRole("button", { name: "Project, A to Z" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Apple launch", "Banana launch", "Cherry launch"]);

    await user.click(screen.getByRole("button", { name: "Project, A to Z" }));
    expect(screen.getByRole("button", { name: "Project, Z to A" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Cherry launch", "Banana launch", "Apple launch"]);
  });

  it("sorts Due with undated projects always last, and a new column restarts ascending", async () => {
    const user = userEvent.setup();
    fixture.view = "list";
    fixture.projects = [
      project({ id: "p1", title: "Banana launch", due_date: "2026-03-01" }),
      project({ id: "p2", title: "Apple launch", due_date: null }),
      project({ id: "p3", title: "Cherry launch", due_date: "2026-01-01" }),
    ];
    mountBoard();
    await user.click(await screen.findByRole("button", { name: "Due" }));
    expect(screen.getByRole("button", { name: "Due, earliest first" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Cherry launch", "Banana launch", "Apple launch"]);

    await user.click(screen.getByRole("button", { name: "Due, earliest first" }));
    expect(screen.getByRole("button", { name: "Due, latest first" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Banana launch", "Cherry launch", "Apple launch"]);

    await user.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByRole("button", { name: "Project, A to Z" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Apple launch", "Banana launch", "Cherry launch"]);
  });

  it("keeps the sort when switching views", async () => {
    const user = userEvent.setup();
    fixture.view = "list";
    fixture.projects = [
      project({ id: "p1", title: "Banana launch" }),
      project({ id: "p2", title: "Apple launch" }),
    ];
    mountBoard();
    await user.click(await screen.findByRole("button", { name: "Project" }));
    expect(visibleTitleOrder()).toEqual(["Apple launch", "Banana launch"]);

    await user.click(screen.getByRole("button", { name: "Canvas view" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "List view" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "Project, A to Z" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Apple launch", "Banana launch"]);
  });

  it("is not reset by Clear filters", async () => {
    const user = userEvent.setup();
    fixture.view = "list";
    fixture.projects = [
      project({ id: "p1", title: "Banana launch", status: "approved" }),
      project({ id: "p2", title: "Apple launch", status: "approved" }),
    ];
    mountBoard();
    await user.click(await screen.findByRole("button", { name: "Filters" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "approved");
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    await user.click(screen.getByRole("button", { name: "Project" }));
    expect(visibleTitleOrder()).toEqual(["Apple launch", "Banana launch"]);

    await user.click(screen.getByRole("button", { name: "Search projects" }));
    await user.click(
      within(screen.getByRole("region", { name: "Project search" })).getByRole("button", {
        name: "Clear filters",
      }),
    );
    expect(screen.getByRole("button", { name: "Project, A to Z" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Apple launch", "Banana launch"]);
  });

  it("offers a phone 'Sort by' select that reads and writes the same state", async () => {
    const user = userEvent.setup();
    fixture.view = "list";
    fixture.projects = [
      project({ id: "p1", title: "Banana launch" }),
      project({ id: "p2", title: "Apple launch" }),
    ];
    mountBoard();
    const select = await screen.findByRole("combobox", { name: "Sort by" });
    expect(select).toHaveValue("default");

    await user.selectOptions(select, "project-asc");
    expect(screen.getByRole("button", { name: "Project, A to Z" })).toBeInTheDocument();
    expect(visibleTitleOrder()).toEqual(["Apple launch", "Banana launch"]);

    await user.click(screen.getByRole("button", { name: "Project, A to Z" }));
    expect(select).toHaveValue("project-desc");
  });
});
