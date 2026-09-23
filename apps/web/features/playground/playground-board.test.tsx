import { useState, type ReactNode } from "react";
import Link from "next/link";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaygroundItem, PlaygroundItemInput } from "./playground-types";
import { PlaygroundBoard } from "./playground-board";

const backend = vi.hoisted(() => ({
  usePlayground: vi.fn(),
  useInvalidatePlayground: vi.fn(),
  savePlaygroundItem: vi.fn(),
  deletePlaygroundItem: vi.fn(),
  uploadPlaygroundFile: vi.fn(),
  discardPlaygroundFile: vi.fn(),
  getPlaygroundDownload: vi.fn(),
}));
vi.mock("./playground-data", () => backend);
vi.mock("@/features/shared/canvas-background", () => ({ CanvasBackground: () => null }));
vi.mock("@/features/shared/canvas-controls", () => ({ CanvasControls: () => null }));
vi.mock("./playground-viewport", () => ({ PlaygroundViewport: () => null }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { role: "agency" } }),
}));
// These tests exercise the board's recovery workflow; real xyflow geometry is verified in E2E.
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    onNodeClick,
    children,
  }: {
    nodes: { id: string; data: { draft: { item: PlaygroundItemInput } } }[];
    onNodeClick: (event: unknown, node: unknown) => void;
    children: ReactNode;
  }) => (
    <div>
      {nodes.map((node) => (
        <button key={node.id} onClick={(event) => onNodeClick(event, node)}>
          {node.data.draft.item.title}
        </button>
      ))}
      {children}
    </div>
  ),
  PanOnScrollMode: { Free: "free" },
  Controls: () => null,
  NodeResizer: () => null,
}));

let remoteItems: PlaygroundItem[];
let queryUpdatedAt: number;
let refetch: ReturnType<typeof vi.fn>;
let reducedMotion = true;
const savedNote: PlaygroundItem = {
  id: "saved",
  board_id: "board",
  kind: "note",
  title: "Saved note",
  body: "Original",
  asset_path: null,
  mime_type: null,
  x: 0,
  y: 0,
  width: 280,
  height: 220,
  revision: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  remoteItems = [];
  queryUpdatedAt = 1;
  reducedMotion = true;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reducedMotion })),
  );
  refetch = vi.fn(async () => ({
    data: { boardId: "board", items: remoteItems },
    dataUpdatedAt: ++queryUpdatedAt,
    error: null,
  }));
  backend.usePlayground.mockImplementation(() => ({
    data: { boardId: "board", items: remoteItems },
    dataUpdatedAt: queryUpdatedAt,
    refetch,
    isPending: false,
    isFetching: false,
    error: null,
  }));
  backend.useInvalidatePlayground.mockReturnValue(vi.fn(async () => undefined));
  backend.uploadPlaygroundFile.mockResolvedValue(undefined);
  backend.discardPlaygroundFile.mockResolvedValue(undefined);
  backend.deletePlaygroundItem.mockResolvedValue(undefined);
  backend.savePlaygroundItem.mockImplementation(async (_database, { item, expectedRevision }) => {
    const saved = { ...item, board_id: "board", revision: (expectedRevision ?? 0) + 1 };
    remoteItems = [...remoteItems.filter((row) => row.id !== item.id), saved];
    return saved;
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }),
  );
});

function finishAnimation(element: Element, animationName: string) {
  // jsdom exposes WebkitAnimation styles without AnimationEvent, so React may register
  // its vendor event fallback. Dispatch the standard event and that fallback.
  for (const name of ["animationend", "webkitAnimationEnd"]) {
    const event = new Event(name, { bubbles: true });
    Object.defineProperty(event, "animationName", { value: animationName });
    fireEvent(element, event);
  }
}

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

describe("Playground fullscreen layer", () => {
  it("opens a named dialog, focuses its heading and restores page scroll on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />,
    );

    expect(screen.getByRole("dialog", { name: "Playground" })).toHaveAttribute("open");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("heading", { name: "Playground" })).toHaveFocus();
    unmount();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("keeps native cancellation open until unsaved work is explicitly discarded", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.type(screen.getByLabelText("Note text"), "Keep this fullscreen idea");
    const board = screen.getByRole("dialog", { name: "Playground" });
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(board, cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(board).toHaveAttribute("open");
    expect(screen.getByLabelText("Note text")).toHaveValue("Keep this fullscreen idea");
    expect(screen.getByRole("button", { name: "Keep working" })).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("waits for its upward exit before closing and ignores descendant animations", async () => {
    reducedMotion = false;
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />);
    const board = screen.getByRole("dialog", { name: "Playground" });
    expect(board).toHaveAttribute("data-phase", "entering");
    finishAnimation(board, "playground-layer-enter");
    expect(board).toHaveAttribute("data-phase", "active");

    await user.click(screen.getByRole("button", { name: "Back to project" }));
    expect(board).toHaveAttribute("data-phase", "exiting");
    expect(board).toHaveAttribute("inert");
    expect(onClose).not.toHaveBeenCalled();
    finishAnimation(screen.getByRole("heading", { name: "Playground" }), "playground-layer-exit");
    expect(onClose).not.toHaveBeenCalled();
    finishAnimation(board, "playground-layer-exit");
    finishAnimation(board, "playground-layer-exit");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes without waiting for animation when reduced motion is requested", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Back to project" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("finishes closing when an animation completion event never arrives", async () => {
    reducedMotion = false;
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Back to project" }));
    expect(onClose).not.toHaveBeenCalled();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("handles Escape only from inside the layer and preserves unsaved work", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <button>Project navigation</button>
        <PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Project navigation" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.type(screen.getByLabelText("Note text"), "Keep this idea");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Keep working" })).toBeInTheDocument();
    expect(screen.getByLabelText("Note text")).toHaveValue("Keep this idea");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles Escape when saving disables the focused button and focus falls to body", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Add note" }));
    const save = screen.getByRole("button", { name: "Save note" });
    await user.click(save);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All changes saved"));
    // Match Chromium's focus loss on a newly disabled action; jsdom keeps that focus.
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
    document.body.removeAttribute("tabindex");
    expect(document.body).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("lets clean navigation proceed but guards local drafts until saved or discarded", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const { unmount } = render(
      <>
        <Link
          href="/another-project"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Another project
        </Link>
        <PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />
      </>,
    );
    const link = screen.getByRole("link", { name: "Another project" });
    await user.click(link);
    expect(navigate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.type(screen.getByLabelText("Note text"), "Keep this draft");
    await user.click(link);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Save or discard your Playground changes before leaving this project.",
    );
    expect(screen.getByLabelText("Note text")).toHaveValue("Keep this draft");

    await user.click(screen.getByRole("button", { name: "Save note" }));
    await user.click(link);
    expect(navigate).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Add note" }));
    unmount();
    const externalLink = document.createElement("a");
    externalLink.href = "/another-project";
    let intercepted: boolean | undefined;
    externalLink.addEventListener("click", (event) => {
      intercepted = event.defaultPrevented;
      event.preventDefault();
    });
    document.body.appendChild(externalLink);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    externalLink.dispatchEvent(event);
    externalLink.remove();
    expect(intercepted).toBe(false);
  });

  it("explains an in-flight save when app navigation is attempted", async () => {
    const user = userEvent.setup();
    let finishSave!: () => void;
    backend.savePlaygroundItem.mockImplementationOnce(
      (_database, { item }) =>
        new Promise((resolve) => {
          finishSave = () => resolve({ ...item, board_id: "board", revision: 1 });
        }),
    );
    const navigate = vi.fn();
    render(
      <>
        <Link
          href="/another-project"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Another project
        </Link>
        <PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await user.click(screen.getByRole("link", { name: "Another project" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("A transfer or save is still in progress");
    expect(
      screen.getByRole("button", { name: "Discard unsaved changes and close" }),
    ).toBeDisabled();
    await act(async () => finishSave());
  });

  it("restores the opener after a local close without stealing external navigation focus", async () => {
    const user = userEvent.setup();
    function Project() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button disabled={open} onClick={() => setOpen(true)}>
            Open Playground
          </button>
          <button onClick={() => setOpen(false)}>Project navigation</button>
          {open && (
            <PlaygroundBoard clientId="client" projectId="project" onClose={() => setOpen(false)} />
          )}
        </>
      );
    }
    render(<Project />);
    const opener = screen.getByRole("button", { name: "Open Playground" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Back to project" }));
    await waitFor(() => expect(opener).toHaveFocus());

    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Project navigation" }));
    expect(screen.getByRole("button", { name: "Project navigation" })).toHaveFocus();
  });
});

describe("Playground save and cleanup recovery", () => {
  it("accepts an automatic remote deletion after conflict reload without manual refresh", async () => {
    const user = userEvent.setup();
    remoteItems = [savedNote];
    backend.savePlaygroundItem.mockImplementationOnce(async () => {
      remoteItems = [{ ...savedNote, body: "A newer canonical note", revision: 2 }];
      throw Object.assign(new Error("Changed elsewhere"), { code: "PT409" });
    });
    const { rerender } = render(
      <PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Saved note" }));
    await user.type(screen.getByLabelText("Note text"), " unsaved");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await user.click(
      await screen.findByRole("button", { name: "Discard my edits and load saved item" }),
    );
    expect(screen.getByLabelText("Note text")).toHaveValue("A newer canonical note");

    remoteItems = [];
    queryUpdatedAt += 1;
    rerender(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Saved note" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Note text")).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps an unsaved edit when automatic refetch no longer includes its item", async () => {
    const user = userEvent.setup();
    remoteItems = [savedNote];
    const { rerender } = render(
      <PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Saved note" }));
    await user.type(screen.getByLabelText("Note text"), " keep my idea");

    remoteItems = [];
    queryUpdatedAt += 1;
    rerender(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);

    expect(screen.getByLabelText("Note text")).toHaveValue("Original keep my idea");
    expect(screen.getByRole("status")).toHaveTextContent("unsaved changes");
  });

  it("keeps a failed note and retries the same item, without silently closing", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    backend.savePlaygroundItem.mockRejectedValueOnce(new Error("Offline. Try again."));
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.clear(screen.getByLabelText("Note title"));
    await user.type(screen.getByLabelText("Note title"), "An idea");
    await user.type(screen.getByLabelText("Note text"), "Keep my draft");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    await user.click(screen.getByRole("button", { name: "Back to project" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note text")).toHaveValue("Keep my draft");
    await user.click(screen.getByRole("button", { name: "Keep working" }));
    await user.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All changes saved"));
    const attempts = backend.savePlaygroundItem.mock.calls;
    expect(attempts[1][1]).toEqual(attempts[0][1]);
    expect(remoteItems).toHaveLength(1);
    // Exact label lookup must remain stable when React restores a textarea's saved value.
    const noteText = screen.getByRole("textbox", {
      name: "Note text",
    }) as HTMLTextAreaElement;
    expect(noteText.labels?.[0].textContent).toBe("Note text");
  });

  it("blocks closing only while a save is in flight", async () => {
    const user = userEvent.setup();
    let rejectSave!: (error: Error) => void;
    backend.savePlaygroundItem.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    render(
      <PlaygroundBoard
        clientId="client"
        projectId="project"
        onClose={vi.fn()}
        returnLabel="Back to upload"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("button", { name: "Back to upload" })).toBeDisabled();
    await act(async () => rejectSave(new Error("Save failed")));
    expect(screen.getByRole("button", { name: "Back to upload" })).toBeEnabled();
  });

  it("retries a staged file save without uploading its bytes again", async () => {
    const user = userEvent.setup();
    backend.savePlaygroundItem.mockRejectedValueOnce(new Error("Save failed after upload"));
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.upload(
      screen.getByLabelText("Add files to Playground"),
      new File(["document"], "brief.pdf", { type: "application/pdf" }),
    );
    await screen.findByText("Save failed after upload");
    await user.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(remoteItems).toHaveLength(1));
    expect(backend.uploadPlaygroundFile).toHaveBeenCalledTimes(1);
    expect(backend.savePlaygroundItem.mock.calls[1][1].item.asset_path).toBe(
      backend.savePlaygroundItem.mock.calls[0][1].item.asset_path,
    );
  });

  it("keeps every valid batch file and explains rejected files individually", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Add files to Playground"), [
      new File(["image"], "reference.png", { type: "image/png" }),
      new File(["text"], "ideas.txt", { type: "text/plain" }),
      new File(["document"], "brief.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      new File(["script"], "unsafe.html", { type: "text/html" }),
    ]);

    await waitFor(() => expect(remoteItems).toHaveLength(3));
    expect(new Set(remoteItems.map((item) => item.id)).size).toBe(3);
    expect(new Set(remoteItems.map((item) => `${item.x}/${item.y}`)).size).toBe(3);
    expect(screen.getByRole("alert")).toHaveTextContent("unsafe.html");
    expect(backend.uploadPlaygroundFile).toHaveBeenCalledTimes(3);
  });

  it("retries an uncertain upload with the original File and path", async () => {
    const user = userEvent.setup();
    backend.uploadPlaygroundFile.mockRejectedValueOnce(new Error("Upload response lost"));
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    const file = new File(["document"], "brief.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Add files to Playground"), file);
    await screen.findByText("Upload response lost");
    await user.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(remoteItems).toHaveLength(1));
    expect(backend.uploadPlaygroundFile.mock.calls[1][1]).toEqual(
      backend.uploadPlaygroundFile.mock.calls[0][1],
    );
    expect(backend.uploadPlaygroundFile.mock.calls[1][1].file).toBe(file);
  });

  it("restages the retained file when its unfinished upload expired", async () => {
    const user = userEvent.setup();
    backend.savePlaygroundItem.mockRejectedValueOnce(
      Object.assign(new Error("Upload your file before saving this item"), { code: "42501" }),
    );
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.upload(
      screen.getByLabelText("Add files to Playground"),
      new File(["document"], "brief.pdf", { type: "application/pdf" }),
    );
    await screen.findByText("The unfinished upload expired. Retry to upload your file again.");
    await user.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(remoteItems).toHaveLength(1));
    expect(backend.uploadPlaygroundFile).toHaveBeenCalledTimes(2);
    expect(backend.uploadPlaygroundFile.mock.calls[1][1]).toEqual(
      backend.uploadPlaygroundFile.mock.calls[0][1],
    );
  });

  it("preserves a conflicting local note until the user explicitly loads the saved item", async () => {
    const user = userEvent.setup();
    remoteItems = [savedNote];
    backend.savePlaygroundItem.mockImplementationOnce(async () => {
      remoteItems = [{ ...savedNote, body: "Other person's edit", revision: 2 }];
      throw Object.assign(new Error("This item changed. Reload it before saving."), {
        code: "PT409",
      });
    });
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Saved note" }));
    await user.type(screen.getByLabelText("Note text"), " my edit");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(
      await screen.findByText("This item changed. Reload it before saving."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Note text")).toHaveValue("Original my edit");
    await user.click(screen.getByRole("button", { name: "Discard my edits and load saved item" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Note text")).toHaveValue("Other person's edit"),
    );
  });

  it("keeps a failed deletion available after its server row disappears", async () => {
    const user = userEvent.setup();
    remoteItems = [savedNote];
    backend.deletePlaygroundItem.mockImplementationOnce(async () => {
      remoteItems = [];
      throw new Error("File cleanup failed");
    });
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Saved note" }));
    await user.click(screen.getByRole("button", { name: "Remove item" }));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByText("File cleanup failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry removal" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Saved note" })).not.toBeInTheDocument(),
    );
    expect(backend.deletePlaygroundItem.mock.calls[1][1]).toEqual(
      backend.deletePlaygroundItem.mock.calls[0][1],
    );
  });

  it("recovers a stale removal by explicitly loading the newer saved revision", async () => {
    const user = userEvent.setup();
    remoteItems = [savedNote];
    backend.deletePlaygroundItem.mockImplementationOnce(async () => {
      remoteItems = [{ ...savedNote, body: "Keep the newer work", revision: 2 }];
      throw Object.assign(new Error("This item changed elsewhere. Reload before removing it."), {
        code: "PT409",
      });
    });
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Saved note" }));
    await user.click(screen.getByRole("button", { name: "Remove item" }));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));

    await screen.findByText("This item changed elsewhere. Reload before removing it.");
    await user.click(screen.getByRole("button", { name: "Discard my edits and load saved item" }));
    expect(screen.getByLabelText("Note text")).toBeEnabled();
    expect(screen.getByLabelText("Note text")).toHaveValue("Keep the newer work");
    await user.type(screen.getByLabelText("Note text"), " and continue");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(backend.savePlaygroundItem).toHaveBeenCalled());
    expect(backend.savePlaygroundItem.mock.calls[0][1].expectedRevision).toBe(2);
    expect(backend.deletePlaygroundItem).toHaveBeenCalledTimes(1);
  });

  it("can abandon a conflicting removal and close without sending another delete", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    remoteItems = [savedNote];
    backend.deletePlaygroundItem.mockRejectedValue(
      Object.assign(new Error("This item changed elsewhere."), { code: "PT409" }),
    );
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Saved note" }));
    await user.click(screen.getByRole("button", { name: "Remove item" }));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText("This item changed elsewhere.");
    await user.click(screen.getByRole("button", { name: "Back to project" }));
    await user.click(screen.getByRole("button", { name: "Discard unsaved changes and close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(backend.deletePlaygroundItem).toHaveBeenCalledTimes(1);
    expect(remoteItems).toEqual([savedNote]);
  });

  it("uses a refreshed saved revision for the next edit and never resurrects a confirmed deletion", async () => {
    const user = userEvent.setup();
    remoteItems = [savedNote];
    const { rerender } = render(
      <PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Saved note" }));
    await user.type(screen.getByLabelText("Note text"), " updated");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All changes saved"));
    remoteItems = [{ ...remoteItems[0], revision: 3, body: "Collaborator update" }];
    rerender(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Note text"), " and mine");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(backend.savePlaygroundItem).toHaveBeenCalledTimes(2));
    expect(backend.savePlaygroundItem.mock.calls[1][1].expectedRevision).toBe(3);
    remoteItems = [];
    await user.click(screen.getByRole("button", { name: "Refresh Playground" }));
    rerender(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Saved note" })).not.toBeInTheDocument();
  });
});
