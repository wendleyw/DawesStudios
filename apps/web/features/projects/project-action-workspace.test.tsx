import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectActionDialog, projectActionKey } from "./project-action-dialog";

const writes = vi.hoisted(() => ({
  createDesignBoard: vi.fn(),
  updateDesignBoard: vi.fn(),
  sendBoardRound: vi.fn(),
  shareMiroVersion: vi.fn(),
}));
const assignments = vi.hoisted(() => ({ error: null as Error | null }));
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
  useInvalidateProject: () => vi.fn(),
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
const board = {
  id: "b1",
  projectId: "p",
  name: "Alpha",
  designerId: "d1",
  miro: { boardId: "uXjVAlpha01=", widgetId: null },
};

beforeEach(() => {
  assignments.error = null;
  latestShared.state = { data: undefined, isPending: true, fetchStatus: "fetching" };
  latestShared.useLatestSharedMiroLink.mockReset().mockImplementation(() => latestShared.state);
  Object.values(writes).forEach((write) => write.mockReset().mockResolvedValue("new-id"));
});

describe("board dialog", () => {
  it("creates a board for an assigned designer only", async () => {
    const user = userEvent.setup();
    wrap(
      <ProjectActionDialog
        action={{ kind: "board", projectId: "p" }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
        onClose={vi.fn()}
      />,
    );
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
        },
      ),
    );
  });
  it("says why it cannot add a board when the designers fail to load", () => {
    assignments.error = new Error("Designers could not load");
    wrap(
      <ProjectActionDialog
        action={{ kind: "board", projectId: "p" }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Designers could not load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add board" })).toBeDisabled();
  });
  it("refuses a link that is not a Miro board before calling the server", async () => {
    const user = userEvent.setup();
    wrap(
      <ProjectActionDialog
        action={{ kind: "board", projectId: "p" }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
        onClose={vi.fn()}
      />,
    );
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
    writes.sendBoardRound.mockRejectedValueOnce(new Error("Network down"));
    wrap(
      <ProjectActionDialog
        action={{ kind: "round", board }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Note for the studio"), "Ready");
    await user.click(screen.getByRole("button", { name: "Send to studio" }));
    expect(await screen.findByText("Network down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send to studio" }));
    await waitFor(() => expect(writes.sendBoardRound).toHaveBeenCalledTimes(2));
    const [first, second] = writes.sendBoardRound.mock.calls.map((call) => call[1]);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first).toMatchObject({ boardId: "b1", note: "Ready", frameUrl: "" });
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
          round,
          prefill: { boardId: "uXjVClient1=", widgetId: "5" },
        }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Client Miro board")).toHaveValue(
      "https://miro.com/app/board/uXjVClient1%3D/?moveToWidget=5",
    );
    await user.type(screen.getByLabelText("Note for the client"), "First look");
    await user.click(screen.getByRole("button", { name: "Share with client" }));
    await waitFor(() =>
      expect(writes.shareMiroVersion).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          projectId: "p",
          url: "https://miro.com/app/board/uXjVClient1%3D/?moveToWidget=5",
          note: "First look",
          sourceRoundId: "r1",
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
          round: { id: "r1", number: 1 } as never,
          prefill: null,
        }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
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
        action={{ kind: "share", projectId: "p", round: null, prefill: null }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
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
          round: null,
          prefill: { boardId: "uXjVClient1=", widgetId: null },
        }}
        projectId="p"
        suspended={false}
        onOpenPlayground={vi.fn()}
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
    expect(projectActionKey({ kind: "round", board })).toBe("round:b1");
    expect(projectActionKey({ kind: "share", projectId: "p", round: null, prefill: null })).toBe(
      "share:direct",
    );
  });
});
