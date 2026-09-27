import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion, DesignBoard } from "./project-data";

const state = vi.hoisted(() => ({ role: "agency" as "agency" | "client" | "designer" }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { id: "viewer-1", role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useClients: () => ({ data: [] }),
  useDateFormat: () => ({ formatDate: () => "Sep 30" }),
}));
vi.mock("@/features/shared/brand-mark", () => ({ BrandMark: () => null }));
vi.mock("@/features/workspace/app-shell", () => ({ useFoldSidebarWhile: () => {} }));
vi.mock("@/features/workspace/canvas-header", () => ({ CanvasHeader: () => null }));
vi.mock("@/features/credits/project-credits-chip", () => ({ ProjectCreditsChip: () => null }));
vi.mock("@/features/playground/playground-board", () => ({ PlaygroundBoard: () => null }));
vi.mock("@/features/playground/playground-asset-strip", () => ({
  PlaygroundAssetStrip: () => null,
}));
vi.mock("./comment-panel", () => ({
  CommentPanel: ({ heading, versionId }: { heading?: string; versionId?: string }) => (
    <p>{`${heading ?? "Conversation"} panel ${versionId ?? ""}`}</p>
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
vi.mock("./project-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./project-data")>()),
  useLatestSharedMiroLink: (_projectId: string, enabled: boolean) => ({
    data: enabled ? sharedLink : undefined,
  }),
}));

import { ProjectWorkspace, type ProjectWorkspaceProps } from "./project-workspace";
import { usePanelFocusReturn } from "./use-panel-focus-return";
import type { ProjectPanelKind } from "./project-panel";

const link = { boardId: "uXjVBoard01=", widgetId: null };
const board: DesignBoard = {
  id: "b1",
  projectId: "p",
  name: "Alpha",
  designerId: "d1",
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
  deliverableId: null,
} satisfies CanvasVersion;

// `project-page.tsx` owns `panels` above its own early returns; this harness stands in for it so
// the hook's state (like `project-page.tsx`'s) survives a rerender of the same tree.
function Harness(props: Omit<ProjectWorkspaceProps, "panels">) {
  const panels = usePanelFocusReturn<ProjectPanelKind>();
  return <ProjectWorkspace {...props} panels={panels} />;
}

function renderWorkspace(overrides: Partial<ProjectWorkspaceProps> = {}) {
  const props: Omit<ProjectWorkspaceProps, "panels"> = {
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
      designs: [],
      deliverables: [],
    } as unknown as ProjectWorkspaceProps["data"],
    boards: [],
    viewControl: null,
    ...overrides,
  };
  return render(<Harness {...props} />);
}

beforeEach(() => {
  state.role = "agency";
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
  it("gives the agency's empty Working files one Add a design board call to action", () => {
    renderWorkspace();
    expect(screen.getByText("No design board yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add (a )?design board/i })).toHaveLength(1);
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

  it("closes Feedback when the round on screen is cleared", async () => {
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
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    expect(screen.getByText("Feedback panel r1")).toBeInTheDocument();
    await user.click(within(rounds).getByRole("button", { name: "Board" }));
    expect(screen.queryByText("Feedback panel r1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Feedback" })).toBeNull();
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

  it("prefills the first client version from the latest client link too", async () => {
    renderWorkspace({ channel: "client" });
    await userEvent.setup().click(screen.getByRole("button", { name: "New client version" }));
    expect(dialog.action).toMatchObject({ kind: "share", round: null, prefill: sharedLink });
  });

  it("falls back to the designer's empty state once their reassigned board vanishes from the list", () => {
    state.role = "designer";
    const ownBoard: DesignBoard = { ...board, designerId: "viewer-1" };
    const props: Omit<ProjectWorkspaceProps, "panels"> = {
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
      viewControl: null,
    };
    const { rerender } = render(<Harness {...props} />);
    expect(screen.getByRole("button", { name: "Send to studio" })).toBeInTheDocument();

    // The agency reassigned the board away: `useDesignBoards`' poll refetches an empty list.
    rerender(<Harness {...props} boards={[]} />);
    expect(screen.getByText("The studio has not set up your board yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
  });
});
