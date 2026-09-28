import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion, DesignBoard } from "./project-data";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client" | "designer",
  clientAvailable: true,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { id: "viewer-1", role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useClients: () => ({ data: state.clientAvailable ? [{ id: "c" }] : [] }),
  useDateFormat: () => ({ formatDate: (date: string) => date }),
}));
vi.mock("@/features/briefings/briefing-data", () => ({
  useCampaigns: () => ({ data: [{ id: "campaign-1", title: "Fresh Start" }] }),
}));
vi.mock("@/features/shared/brand-mark", () => ({ BrandMark: () => null }));
vi.mock("@/features/workspace/app-shell", () => ({ useFoldSidebarWhile: () => {} }));
vi.mock("@/features/workspace/canvas-header", () => ({
  CanvasHeader: ({ center }: { center?: ReactNode }) => <header>{center}</header>,
}));
vi.mock("@/features/credits/project-credits-chip", () => ({ ProjectCreditsChip: () => null }));
vi.mock("@/features/playground/playground-board", () => ({ PlaygroundBoard: () => null }));
vi.mock("@/features/playground/playground-asset-strip", () => ({
  PlaygroundAssetStrip: () => null,
}));
vi.mock("./comment-panel", () => ({
  CommentPanel: ({ currentVersion }: { currentVersion?: { id: string } }) => (
    <p>{`Comments panel ${currentVersion?.id ?? "project"}`}</p>
  ),
}));
vi.mock("./project-details", () => ({ ProjectDetails: () => null }));
const dialog = vi.hoisted(() => ({ action: null as unknown }));
vi.mock("./project-action-dialog", () => ({
  ProjectActionDialog: ({ action }: { action: unknown }) => {
    dialog.action = action;
    return null;
  },
  projectActionKey: () => "closed",
}));
const sharedLink = vi.hoisted(() => ({ boardId: "uXjVClient1=", widgetId: "5" }));
const workflowState = vi.hoisted(() => ({
  versions: [] as unknown[],
  activity: "active" as "active" | "backlog",
  outcome: "submitted",
  latest: null as null | { id: string; number: number; decision: string; reviewRevision: number },
  release: false,
  submit: true,
  requestChanges: true,
  publish: true,
  review: false,
}));
vi.mock("./project-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./project-data")>()),
  useProjectDriveLinks: () => ({ data: { internal: null, client: null } }),
  useLatestSharedMiroLink: (_projectId: string, enabled: boolean) => ({
    data: enabled ? sharedLink : undefined,
  }),
  useProjectDetail: () => ({ data: { versions: workflowState.versions } }),
  useProjectWorkflow: () => ({
    data: {
      project: {
        id: "p",
        activity: workflowState.activity,
        workflowRevision: 1,
        latestPublication: workflowState.latest,
      },
      boards: [
        {
          id: "b1",
          name: "Alpha",
          activity: "active",
          designerId: "d1",
          assignmentGeneration: 1,
          workflowRevision: 1,
          briefRevision: 1,
          briefContent: null,
          currentRequest: { id: "q1", outcome: workflowState.outcome, roundId: "r1" },
          capabilities: {
            release: workflowState.release,
            submit: workflowState.submit,
            requestChanges: workflowState.requestChanges,
            close: false,
            reactivate: false,
          },
        },
      ],
      capabilities: {
        publish: workflowState.publish,
        review: workflowState.review,
        deliver: false,
        respondFeedback: false,
      },
    },
  }),
}));

import { ProjectWorkspace, type ProjectWorkspaceProps } from "./project-workspace";
import { usePanelFocusReturn } from "./use-panel-focus-return";
import { useProjectSelection, type ProjectSelectionHint } from "./use-project-selection";
import type { ProjectPanelKind } from "./project-panel";

const link = { boardId: "uXjVBoard01=", widgetId: null };
const board: DesignBoard = {
  id: "b1",
  projectId: "p",
  name: "Alpha",
  designerId: "d1",
  designerName: "Alex Morgan",
  dueDate: null,
  miro: link,
};
const round = {
  id: "r1",
  projectId: "p",
  number: 1,
  note: "",
  status: "submitted",
  date: "2026-09-20T00:00:00Z",
  miro: link,
  boardId: "b1",
} satisfies CanvasVersion;

// `project-page.tsx` owns `panels` and `selection` above its own early returns; this harness stands
// in for it so the hooks' state (like `project-page.tsx`'s) survives a rerender of the same tree.
type HarnessProps = Omit<ProjectWorkspaceProps, "panels" | "selection"> & {
  initialSelection?: ProjectSelectionHint;
};
function Harness({ initialSelection, ...props }: HarnessProps) {
  const panels = usePanelFocusReturn<ProjectPanelKind>();
  const selection = useProjectSelection(initialSelection);
  return <ProjectWorkspace {...props} panels={panels} selection={selection} />;
}

function renderWorkspace(overrides: Partial<HarnessProps> = {}) {
  workflowState.versions = overrides.channel === "client" ? [] : (overrides.data?.versions ?? []);
  const props: HarnessProps = {
    projectId: "p",
    channel: "internal",
    onChannel: vi.fn(),
    data: {
      project: {
        id: "p",
        client_id: "c",
        title: "Campaign",
        status: "in_progress",
        due_date: null,
      },
      versions: [],
      deliverables: [],
    } as unknown as ProjectWorkspaceProps["data"],
    boards: [],
    ...overrides,
  };
  return render(<Harness {...props} />);
}

beforeEach(() => {
  state.role = "agency";
  state.clientAvailable = true;
  workflowState.activity = "active";
  workflowState.outcome = "submitted";
  workflowState.latest = null;
  workflowState.release = false;
  workflowState.submit = true;
  workflowState.requestChanges = true;
  workflowState.publish = true;
  workflowState.review = false;
  dialog.action = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("ProjectWorkspace", () => {
  it.each(["agency", "designer", "client"] as const)(
    "shows the campaign, title and correct deadline by default for %s",
    (role) => {
      state.role = role;
      renderWorkspace({
        channel: role === "client" ? "client" : "internal",
        boards: [{ ...board, dueDate: "2026-09-20" }],
        data: {
          project: {
            id: "p",
            client_id: "c",
            title: "Project title",
            campaign_id: "campaign-1",
            status: "in_progress",
            due_date: "2026-09-30",
          },
          versions: [],
          deliverables: [],
        } as unknown as ProjectWorkspaceProps["data"],
      });
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { name: "Project title" })).toBeVisible();
      expect(screen.getByText("Fresh Start")).toBeVisible();
      expect(
        screen.getAllByText(role === "designer" ? "Due 2026-09-20" : "Due 2026-09-30"),
      ).toHaveLength(1);
    },
  );

  it("keeps the project title available while the client header is unavailable", () => {
    state.clientAvailable = false;
    renderWorkspace();
    expect(screen.getByRole("heading", { name: "Campaign" })).toBeVisible();
    expect(screen.getByText("No due date")).toBeVisible();
    expect(screen.queryByText("Fresh Start")).not.toBeInTheDocument();
  });

  it("gives the agency's empty Working files one Add a design board call to action", () => {
    renderWorkspace();
    expect(screen.getByText("No design board yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add (a )?design board/i })).toHaveLength(1);
  });

  it("shows the agency's channel tabs in the bar, not behind More", async () => {
    const onChannel = vi.fn();
    renderWorkspace({ onChannel });
    const tabs = screen.getByRole("group", { name: "Project channel" });
    expect(within(tabs).getByRole("button", { name: "Working files" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.setup().click(within(tabs).getByRole("button", { name: "Shared with client" }));
    expect(onChannel).toHaveBeenCalledWith("client");
  });

  it("offers no Earlier versions: the workspace is the whole project page", async () => {
    renderWorkspace();
    await userEvent.setup().click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("button", { name: "Earlier versions" })).toBeNull();
  });

  it("labels a designer's view Working files without offering a channel switch", () => {
    state.role = "designer";
    renderWorkspace();
    expect(screen.getAllByText("Working files").length).toBeGreaterThan(0);
    expect(screen.queryByRole("group", { name: "Project channel" })).toBeNull();
  });

  it("never shows a client a design board or Working files", async () => {
    state.role = "client";
    renderWorkspace({ channel: "client" });
    expect(
      screen.getByText("Nothing shared yet. Your studio will share designs here."),
    ).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("combobox", { name: "Design board" })).toBeNull();
    expect(screen.queryByText(/design board/i)).toBeNull();
    expect(screen.queryByText("Working files")).toBeNull();
    expect(screen.queryByRole("group", { name: "Project channel" })).toBeNull();
  });

  it("keeps Comments open with project scope when the round on screen is cleared", async () => {
    const user = userEvent.setup();
    renderWorkspace({
      boards: [board],
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress" },
        versions: [round],
        designs: [],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
    });
    const rounds = screen.getByRole("group", { name: "Rounds" });
    await user.click(within(rounds).getByRole("button", { name: "Round 1" }));
    await user.click(screen.getByRole("button", { name: "Comments" }));
    expect(screen.getByText("Comments panel r1")).toBeInTheDocument();
    await user.click(within(rounds).getByRole("button", { name: "Live" }));
    expect(screen.queryByText("Comments panel r1")).toBeNull();
    expect(screen.getByText("Comments panel project")).toBeInTheDocument();
  });

  it("prefills sharing a round with the latest client link, read from Working files", async () => {
    const user = userEvent.setup();
    renderWorkspace({
      boards: [board],
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress" },
        versions: [round],
        designs: [],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
    });
    await user.click(
      within(screen.getByRole("group", { name: "Rounds" })).getByRole("button", {
        name: "Round 1",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Share with client" }));
    expect(dialog.action).toMatchObject({
      kind: "share",
      round: { id: "r1" },
      prefill: sharedLink,
    });
  });

  it("keeps advances on the current submitted round and hides them on older board history", async () => {
    const user = userEvent.setup();
    renderWorkspace({
      boards: [board],
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress" },
        versions: [round, { ...round, id: "old", number: 0 }],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
    });
    await user.click(
      within(screen.getByRole("group", { name: "Rounds" })).getByRole("button", {
        name: "Round 1",
      }),
    );
    expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("group", { name: "Rounds" })).getByRole("button", {
        name: "Round 0",
      }),
    );
    expect(screen.queryByRole("button", { name: "Request changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
  });

  it("suspends every advance control while the project is in Backlog", () => {
    workflowState.activity = "backlog";
    renderWorkspace({
      boards: [board],
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress" },
        versions: [round],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
    });
    expect(screen.getByText("Project in backlog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to designer" })).toBeNull();
  });

  it("offers only the latest pending version to the client for review", () => {
    state.role = "client";
    workflowState.review = true;
    workflowState.latest = { id: "v2", number: 2, decision: "pending", reviewRevision: 0 };
    const version = { ...round, id: "v2", boardId: null, number: 2, status: "pending" };
    renderWorkspace({
      channel: "client",
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "in_review" },
        versions: [version],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
    });
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
  });

  it.each([
    ["client", "changes_requested", "in_progress", "The studio is working on your changes"],
    ["agency", "changes_requested", "in_progress", "Changes sent to designers"],
    ["client", "changes_requested", "changes_requested", "Changes requested"],
    ["client", "approved", "delivered", "Delivered"],
    ["agency", "approved", "delivered", "Delivered"],
  ] as const)(
    "tells the %s where a %s version stands once the project is %s",
    (role, decision, status, text) => {
      state.role = role;
      workflowState.publish = false;
      workflowState.latest = { id: "v1", number: 1, decision, reviewRevision: 1 };
      const version = { ...round, id: "v1", boardId: null, number: 1, status: decision };
      renderWorkspace({
        channel: "client",
        data: {
          project: { id: "p", client_id: "c", title: "Campaign", status },
          versions: [version],
          deliverables: [],
        } as unknown as ProjectWorkspaceProps["data"],
      });
      expect(screen.getByRole("group", { name: "Workflow actions" })).toHaveTextContent(text);
    },
  );

  it("prefills the first client version from the latest client link too", async () => {
    renderWorkspace({ channel: "client" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Share with client" }));
    expect(dialog.action).toMatchObject({ kind: "share", round: null, prefill: sharedLink });
  });

  it("closes a pending round dialog when the project becomes delivered", async () => {
    state.role = "designer";
    const data = {
      project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress" },
      versions: [round],
      deliverables: [],
    } as unknown as ProjectWorkspaceProps["data"];
    const props: HarnessProps = {
      projectId: "p",
      channel: "internal",
      onChannel: vi.fn(),
      data,
      boards: [{ ...board, designerId: "viewer-1" }],
    };
    const { rerender } = render(<Harness {...props} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Send to studio" }));
    expect(dialog.action).toMatchObject({ kind: "round" });
    rerender(
      <Harness {...props} data={{ ...data, project: { ...data.project, status: "delivered" } }} />,
    );
    expect(dialog.action).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
    // A designer works on the live board only; the rounds they sent are the agency's history.
    expect(screen.queryByRole("group", { name: "Rounds" })).toBeNull();
  });

  it("offers no first client version for a delivered project", () => {
    renderWorkspace({
      channel: "client",
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "delivered" },
        versions: [],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
    });
    expect(screen.getByText("No client version was shared.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New client version" })).toBeNull();
  });

  it("opens a notification's exact authorized board and round", () => {
    renderWorkspace({
      boards: [board, { ...board, id: "b2", name: "Second direction" }],
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress" },
        versions: [round, { ...round, id: "r2", boardId: "b2", number: 2 }],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
      initialSelection: { board: "b2", round: "r2", version: null },
    });
    expect(screen.getByRole("combobox", { name: "Design board" })).toHaveValue("b2");
    expect(screen.getByRole("button", { name: "Round 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores unavailable notification targets without exposing another board", () => {
    renderWorkspace({
      boards: [board],
      initialSelection: { board: "private-board", round: "private-round", version: null },
    });
    expect(screen.queryByText("private-board")).toBeNull();
    expect(screen.getByTitle("Miro board Alpha")).toHaveAttribute(
      "src",
      expect.stringContaining("uXjVBoard01"),
    );
  });

  it("falls back to the designer's empty state once their reassigned board vanishes from the list", () => {
    state.role = "designer";
    const ownBoard: DesignBoard = { ...board, designerId: "viewer-1" };
    const props: HarnessProps = {
      projectId: "p",
      channel: "internal",
      onChannel: vi.fn(),
      data: {
        project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress" },
        versions: [],
        designs: [],
        deliverables: [],
      } as unknown as ProjectWorkspaceProps["data"],
      boards: [ownBoard],
    };
    const { rerender } = render(<Harness {...props} />);
    expect(screen.getByRole("button", { name: "Send to studio" })).toBeInTheDocument();

    // The agency reassigned the board away: `useDesignBoards`' poll refetches an empty list.
    rerender(<Harness {...props} boards={[]} />);
    expect(screen.getByText("The studio has not set up your board yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
  });
});
