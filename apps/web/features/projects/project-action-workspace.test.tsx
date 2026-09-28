import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectActionDialog, projectActionKey } from "./project-action-dialog";

const writes = vi.hoisted(() => ({
  createDesignBoard: vi.fn(),
  updateDesignBoard: vi.fn(),
  sendBoardRoundForRequest: vi.fn(),
  shareWorkflowVersion: vi.fn(),
}));
const assignments = vi.hoisted(() => ({ error: null as Error | null }));
const invalidateProject = vi.hoisted(() => vi.fn());
const latestShared = vi.hoisted(() => ({
  state: { data: undefined, isPending: true, fetchStatus: "fetching" } as {
    data: { boardId: string; widgetId: string | null } | null | undefined;
    isPending: boolean;
    fetchStatus: string;
  },
  useLatestSharedMiroLink: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { id: "agency", role: "agency" } }),
}));
vi.mock("./project-data", async (original) => ({
  ...(await original<typeof import("./project-data")>()),
  ...writes,
  useProjectAssignments: () =>
    assignments.error
      ? { data: undefined, error: assignments.error, isPending: false }
      : {
          data: {
            members: [
              { id: "d1", display_name: "Alex Morgan" },
              { id: "d2", display_name: "Sam Lee" },
            ],
            assigned: ["d1"],
          },
          error: null,
          isPending: false,
        },
  useInvalidateProject: () => invalidateProject,
  useLatestSharedMiroLink: latestShared.useLatestSharedMiroLink,
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
const wrap = (node: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const workflowBoard = {
  id: "b1",
  name: "Alpha",
  activity: "active" as const,
  designerId: "d1",
  assignmentGeneration: 1,
  workflowRevision: 2,
  briefRevision: 1,
  briefContent: null,
  currentRequest: {
    id: "q1",
    sequence: 1,
    kind: "initial",
    outcome: "open",
    roundId: null,
    content: null,
  },
  capabilities: {
    release: false,
    submit: true,
    requestChanges: false,
    close: false,
    reactivate: false,
  },
};
const workflow = {
  project: {
    id: "p",
    status: "in_progress",
    activity: "active" as const,
    workflowRevision: 1,
    latestPublication: null,
  },
  boards: [workflowBoard],
  capabilities: { publish: true, review: false, deliver: false, respondFeedback: false },
};
const board = {
  id: "b1",
  projectId: "p",
  name: "Alpha",
  designerId: "d1",
  designerName: "Alex Morgan",
  dueDate: null,
  miro: { boardId: "uXjVAlpha01=", widgetId: null },
};

beforeEach(() => {
  assignments.error = null;
  invalidateProject.mockReset();
  latestShared.state = { data: undefined, isPending: true, fetchStatus: "fetching" };
  latestShared.useLatestSharedMiroLink.mockReset().mockImplementation(() => latestShared.state);
  Object.values(writes).forEach((write) => write.mockReset().mockResolvedValue("new-id"));
});

describe("board dialog", () => {
  it("creates a board for an assigned designer only", async () => {
    const user = userEvent.setup();
    wrap(<ProjectActionDialog action={{ kind: "board", projectId: "p" }} onClose={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Alex Morgan" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sam Lee" })).toBeNull();
    await user.type(screen.getByLabelText("Board name"), "  Alpha  ");
    await user.type(
      screen.getByLabelText("Miro board"),
      "https://miro.com/app/board/uXjVAlpha01=/",
    );
    await user.click(screen.getByRole("button", { name: "Add board" }));
    await waitFor(() =>
      expect(writes.createDesignBoard).toHaveBeenCalledWith(
        {},
        {
          projectId: "p",
          name: "Alpha",
          url: "https://miro.com/app/board/uXjVAlpha01=/",
          designerId: "d1",
          dueDate: null,
        },
      ),
    );
  });
  it("sends an internal due date on or before the project's", async () => {
    const user = userEvent.setup();
    wrap(
      <ProjectActionDialog
        action={{ kind: "board", projectId: "p", projectDueDate: "2026-10-10" }}
        onClose={vi.fn()}
      />,
    );
    const due = screen.getByLabelText("Board due date");
    expect(due).toHaveAttribute("max", "2026-10-10");
    await user.type(screen.getByLabelText("Board name"), "Alpha");
    await user.type(
      screen.getByLabelText("Miro board"),
      "https://miro.com/app/board/uXjVAlpha01=/",
    );
    fireEvent.change(due, { target: { value: "2026-10-06" } });
    await user.click(screen.getByRole("button", { name: "Add board" }));
    await waitFor(() =>
      expect(writes.createDesignBoard).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ dueDate: "2026-10-06" }),
      ),
    );
  });
  it("refuses a board date after the project's before calling the server", async () => {
    const user = userEvent.setup();
    const { container } = wrap(
      <ProjectActionDialog
        action={{ kind: "board", projectId: "p", projectDueDate: "2026-10-10" }}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Board name"), "Alpha");
    await user.type(
      screen.getByLabelText("Miro board"),
      "https://miro.com/app/board/uXjVAlpha01=/",
    );
    fireEvent.change(screen.getByLabelText("Board due date"), {
      target: { value: "2026-10-11" },
    });
    fireEvent.submit(container.ownerDocument.querySelector("form")!);
    expect(await screen.findByText(/on or before/)).toBeInTheDocument();
    expect(writes.createDesignBoard).not.toHaveBeenCalled();
  });
  it("says why it cannot add a board when the designers fail to load", () => {
    assignments.error = new Error("Designers could not load");
    wrap(<ProjectActionDialog action={{ kind: "board", projectId: "p" }} onClose={vi.fn()} />);
    expect(screen.getByText("Designers could not load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add board" })).toBeDisabled();
  });
  it("refuses a link that is not a Miro board before calling the server", async () => {
    const user = userEvent.setup();
    wrap(<ProjectActionDialog action={{ kind: "board", projectId: "p" }} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Board name"), "Alpha");
    await user.type(screen.getByLabelText("Miro board"), "https://example.com/x");
    await user.click(screen.getByRole("button", { name: "Add board" }));
    expect(await screen.findByText(/Paste a Miro board or frame link/)).toBeInTheDocument();
    expect(writes.createDesignBoard).not.toHaveBeenCalled();
  });
});

describe("round dialog", () => {
  it("reuses its idempotency key when a failed send is retried", async () => {
    const user = userEvent.setup();
    writes.sendBoardRoundForRequest.mockRejectedValueOnce(new Error("Network down"));
    wrap(
      <ProjectActionDialog action={{ kind: "round", board, workflowBoard }} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Note for the studio"), "Ready");
    await user.click(screen.getByRole("button", { name: "Send to studio" }));
    expect(await screen.findByText("Network down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send to studio" }));
    await waitFor(() => expect(writes.sendBoardRoundForRequest).toHaveBeenCalledTimes(2));
    const [first, second] = writes.sendBoardRoundForRequest.mock.calls.map((call) => call[1]);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first).toMatchObject({ boardId: "b1", note: "Ready", frameUrl: "" });
  });

  it("shows a plain message and refreshes the boards once the board is no longer the designer's", async () => {
    const user = userEvent.setup();
    writes.sendBoardRoundForRequest.mockRejectedValueOnce(
      new Error('Board access required (42501): "b1"'),
    );
    wrap(
      <ProjectActionDialog action={{ kind: "round", board, workflowBoard }} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Note for the studio"), "Ready");
    await user.click(screen.getByRole("button", { name: "Send to studio" }));
    expect(await screen.findByText("This board is no longer assigned to you.")).toBeInTheDocument();
    expect(screen.queryByText(/42501/)).toBeNull();
    await waitFor(() => expect(invalidateProject).toHaveBeenCalled());
  });
});

describe("share dialog", () => {
  it("prefills the latest client link and shares the round", async () => {
    const user = userEvent.setup();
    const round = { id: "r1", number: 2 } as never;
    wrap(
      <ProjectActionDialog
        action={{
          kind: "share",
          projectId: "p",
          workflow,
          availableRounds: [],
          round,
          prefill: { boardId: "uXjVClient1=", widgetId: "5" },
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Client Miro board")).toHaveValue(
      "https://miro.com/app/board/uXjVClient1%3D/?moveToWidget=5",
    );
    await user.type(screen.getByLabelText("Note for the client"), "First look");
    await user.click(screen.getByRole("button", { name: "Share with client" }));
    await waitFor(() =>
      expect(writes.shareWorkflowVersion).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          projectId: "p",
          url: "https://miro.com/app/board/uXjVClient1%3D/?moveToWidget=5",
          note: "First look",
          sourceRoundIds: ["r1"],
        }),
      ),
    );
  });
});

describe("share dialog prefill", () => {
  it("fills the link once the latest client link arrives after the dialog opened", async () => {
    const dialog = (
      <ProjectActionDialog
        action={{
          kind: "share",
          projectId: "p",
          workflow,
          availableRounds: [],
          round: { id: "r1", number: 1 } as never,
          prefill: null,
        }}
        onClose={vi.fn()}
      />
    );
    const { rerender } = wrap(dialog);
    expect(latestShared.useLatestSharedMiroLink).toHaveBeenCalledWith("p", true);
    expect(screen.getByLabelText("Client Miro board")).toBeDisabled();
    latestShared.state = {
      data: { boardId: "uXjVClient1=", widgetId: "5" },
      isPending: false,
      fetchStatus: "idle",
    };
    rerender(<QueryClientProvider client={new QueryClient()}>{dialog}</QueryClientProvider>);
    expect(screen.getByLabelText("Client Miro board")).toBeEnabled();
    expect(screen.getByLabelText("Client Miro board")).toHaveValue(
      "https://miro.com/app/board/uXjVClient1%3D/?moveToWidget=5",
    );
  });

  it("leaves the link empty when nothing has been shared yet", () => {
    latestShared.state = { data: null, isPending: false, fetchStatus: "idle" };
    wrap(
      <ProjectActionDialog
        action={{
          kind: "share",
          projectId: "p",
          round: null,
          prefill: null,
          workflow,
          availableRounds: [],
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Client Miro board")).toBeEnabled();
    expect(screen.getByLabelText("Client Miro board")).toHaveValue("");
  });

  it("does not read the latest link when the action already carries one", () => {
    wrap(
      <ProjectActionDialog
        action={{
          kind: "share",
          projectId: "p",
          workflow,
          availableRounds: [],
          round: null,
          prefill: { boardId: "uXjVClient1=", widgetId: null },
        }}
        onClose={vi.fn()}
      />,
    );
    expect(latestShared.useLatestSharedMiroLink).toHaveBeenCalledWith("p", false);
  });
});

describe("projectActionKey", () => {
  it("keys every kind", () => {
    expect(projectActionKey(null)).toBe("closed");
    expect(projectActionKey({ kind: "board", projectId: "p" })).toBe("board:new");
    expect(projectActionKey({ kind: "round", board, workflowBoard })).toBe("round:b1");
    expect(
      projectActionKey({
        kind: "share",
        projectId: "p",
        round: null,
        prefill: null,
        workflow,
        availableRounds: [],
      }),
    ).toBe("share:direct");
  });
});
