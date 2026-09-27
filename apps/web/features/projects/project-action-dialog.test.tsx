import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import type { ProjectAction } from "./project-action-dialog";

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => auth);

const projectData = vi.hoisted(() => ({
  clearMiroLink: vi.fn(),
  reviewPublication: vi.fn(),
  setMiroLink: vi.fn(),
  useInvalidateProject: () => vi.fn(),
}));
vi.mock("./project-data", () => projectData);

const { ProjectActionDialog } = await import("./project-action-dialog");

const version = {
  id: "version-1",
  number: 1,
  status: "draft",
  boardId: "board-1",
  miro: null,
} as unknown as CanvasVersion;

const publishedVersion = {
  ...version,
  id: "pub-1",
  boardId: null,
  number: 3,
} as CanvasVersion;

function renderDialog(action: ProjectAction) {
  const client = new QueryClient();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectActionDialog action={action} suspended={false} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
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

beforeEach(() => {
  vi.clearAllMocks();
  auth.useAuth.mockReturnValue({ database: {}, mediaUrl: "http://media.test" });
  projectData.setMiroLink.mockResolvedValue(undefined);
  projectData.clearMiroLink.mockResolvedValue(undefined);
});

describe("closing", () => {
  it("closes the dialog immediately when nothing is saving", async () => {
    const { onClose } = renderDialog({ kind: "miro", version, channel: "internal" });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps Cancel disabled while a save is running", async () => {
    projectData.setMiroLink.mockReturnValue(new Promise(() => {}));
    const { onClose } = renderDialog({ kind: "miro", version, channel: "internal" });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://miro.com/app/board/uXjVStudio1=/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(projectData.setMiroLink).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    // Escape reaches the Modal as the dialog's own `cancel` event.
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Miro links", () => {
  it("prefills the version's own link", () => {
    renderDialog({
      kind: "miro",
      version: { ...publishedVersion, miro: { boardId: "uXjVKabc123=", widgetId: "7" } },
      channel: "client",
    });
    expect(screen.getByLabelText(/Miro frame/)).toHaveValue(
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=7",
    );
  });

  it("refuses an invalid link before saving", async () => {
    renderDialog({ kind: "miro", version, channel: "internal" });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    expect(await screen.findByText(/Paste a Miro board or frame link/)).toBeInTheDocument();
    expect(projectData.setMiroLink).not.toHaveBeenCalled();
  });

  it("removes the link when the field is saved empty", async () => {
    const { onClose } = renderDialog({
      kind: "miro",
      version: { ...version, miro: { boardId: "uXjVKabc123=", widgetId: null } },
      channel: "internal",
    });
    fireEvent.change(screen.getByLabelText(/Miro frame/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.clearMiroLink).toHaveBeenCalledWith(expect.anything(), {
      channel: "internal",
      versionId: "version-1",
    });
  });

  it("never removes a shared version's link: a project-level client version needs one", async () => {
    const { onClose } = renderDialog({
      kind: "miro",
      version: { ...publishedVersion, miro: { boardId: "uXjVKabc123=", widgetId: null } },
      channel: "client",
    });
    const field = screen.getByLabelText(/Miro frame/);
    expect(field).toBeRequired();
    expect(screen.queryByText(/Leave empty/)).toBeNull();
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.submit(field.closest("form")!);
    expect(await screen.findByText(/needs its Miro link/)).toBeInTheDocument();
    expect(projectData.clearMiroLink).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("titles the miro dialog by whether the version already has a link", () => {
    renderDialog({ kind: "miro", version, channel: "internal" });
    expect(screen.getByRole("heading", { name: "Add a Miro link." })).toBeInTheDocument();
  });

  it("titles the miro dialog as a change when the version already has a link", () => {
    renderDialog({
      kind: "miro",
      version: { ...publishedVersion, miro: { boardId: "uXjVKabc123=", widgetId: null } },
      channel: "client",
    });
    expect(screen.getByRole("heading", { name: "Change the Miro link." })).toBeInTheDocument();
  });

  it("sets an internal link on the internal channel", async () => {
    const { onClose } = renderDialog({ kind: "miro", version, channel: "internal" });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://miro.com/app/board/uXjVStudio1=/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.setMiroLink).toHaveBeenCalledWith(expect.anything(), {
      channel: "internal",
      versionId: "version-1",
      url: "https://miro.com/app/board/uXjVStudio1=/",
    });
  });
});

describe("reviewing a publication", () => {
  it("approves by default and preselects the decision a button started from", () => {
    renderDialog({ kind: "review", version });
    expect(screen.getByLabelText("Your decision")).toHaveValue("approved");
    cleanup();
    renderDialog({ kind: "review", version, decision: "changes_requested" });
    expect(screen.getByLabelText("Your decision")).toHaveValue("changes_requested");
  });
});
