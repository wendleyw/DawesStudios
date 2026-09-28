import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaygroundAlbumsPanel } from "./playground-albums-panel";
import type { Album, AlbumFile } from "./playground-albums";

/** Only the board-mode fields `panel()` below ever overrides — the props union itself resists a
 * plain `Partial<PlaygroundAlbumsPanelProps>`, since that would also allow a clipboard-mode field
 * that leaves `mode` inconsistent with the rest of the props. */
type BoardOverrides = Partial<{
  canAdd: boolean;
  blockedReason: string;
  viewCenter: () => { x: number; y: number };
  onAdd: (files: AlbumFile[], point: { x: number; y: number }) => void;
  onDragStart: (files: AlbumFile[]) => void;
  onDragEnd: () => void;
}>;

const backend = vi.hoisted(() => ({
  useBrandAssetFolders: vi.fn(),
  useBrandAssets: vi.fn(),
  useBrandAssetPreviewUrl: vi.fn(),
}));
vi.mock("@/features/brand/brand-data", () => backend);

type BrandFile = { id: string; name: string; mime?: string; folder?: string };

const squareFolder = { id: "f-square", name: "Campaign square" };
const storyFolder = { id: "f-story", name: "Campaign story" };

/** Brand Hub files for the panel to build its albums from, each in the "Campaign square" folder
 * unless told otherwise. */
function brandFiles(files: BrandFile[], folders = [squareFolder]) {
  backend.useBrandAssetFolders.mockReturnValue({ data: folders });
  backend.useBrandAssets.mockReturnValue({
    data: files.map((file) => ({
      id: file.id,
      name: file.name,
      folder_id: file.folder ?? squareFolder.id,
      mime_type: file.mime ?? "image/png",
      storage_path: `c/${file.id}`,
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.useBrandAssetPreviewUrl.mockReturnValue({ data: undefined });
  brandFiles([
    { id: "design-1", name: "Square A" },
    { id: "design-2", name: "Square B" },
  ]);
});

function panel(overrides: BoardOverrides = {}) {
  const onAdd = vi.fn();
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();
  const viewCenter = vi.fn(() => ({ x: 10, y: 20 }));
  render(
    <PlaygroundAlbumsPanel
      clientId="client-1"
      canAdd
      viewCenter={viewCenter}
      onAdd={onAdd}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...overrides}
    />,
  );
  return { onAdd, onDragStart, onDragEnd, viewCenter };
}

describe("PlaygroundAlbumsPanel", () => {
  it("opens an album's thumbnail row on click and closes it on a second click", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    expect(screen.getByTitle("Square A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    expect(screen.queryByTitle("Square A")).not.toBeInTheDocument();
  });

  it("shows no chip for an album with no storable files, but a disabled file still appears dimmed inside an open one", () => {
    brandFiles([
      { id: "design-1", name: "Square A" },
      { id: "design-2", name: "Square video", mime: "video/mp4" },
    ]);
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    const disabled = screen.getByRole("button", { name: "Square video" });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled).toHaveAttribute("draggable", "false");
  });
});
describe("PlaygroundAlbumsPanel selection and keyboard", () => {
  it("switching to another album clears the selection", () => {
    brandFiles(
      [
        { id: "design-1", name: "Square A" },
        { id: "design-3", name: "Story A", folder: storyFolder.id },
      ],
      [squareFolder, storyFolder],
    );
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    fireEvent.click(screen.getByTitle("Square A"));
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Campaign story" }));
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "false");
  });

  it("Shift+click selects a range", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    fireEvent.click(screen.getByTitle("Square A"));
    fireEvent.click(screen.getByTitle("Square B"), { shiftKey: true });
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Square B")).toHaveAttribute("aria-pressed", "true");
  });

  it("Enter on a focused thumbnail adds only that file, at the view center", () => {
    const { onAdd, viewCenter } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    fireEvent.click(screen.getByTitle("Square B")); // select a different file first
    fireEvent.keyDown(screen.getByTitle("Square A"), { key: "Enter" });
    expect(viewCenter).toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "design-1", title: "Square A" })],
      { x: 10, y: 20 },
    );
  });

  it("dragging an unselected thumbnail drags only that file and resets the selection to it", () => {
    const { onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    fireEvent.click(screen.getByTitle("Square B")); // select a different file first
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(screen.getByTitle("Square A"), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith([expect.objectContaining({ id: "design-1" })]);
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Square B")).toHaveAttribute("aria-pressed", "false");
  });

  it("dragging a thumbnail that is part of the current selection drags the whole selection", () => {
    const { onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    fireEvent.click(screen.getByTitle("Square A"));
    fireEvent.click(screen.getByTitle("Square B"), { shiftKey: true });
    onDragStart.mockClear();
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(screen.getByTitle("Square A"), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith([
      expect.objectContaining({ id: "design-1" }),
      expect.objectContaining({ id: "design-2" }),
    ]);
  });

  it("a disabled thumbnail ignores Enter and never starts a drag", () => {
    brandFiles([{ id: "design-1", name: "Square video", mime: "video/mp4" }]);
    const { onAdd, onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    const thumb = screen.getByRole("button", { name: "Square video" });
    fireEvent.keyDown(thumb, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.dragStart(thumb, { dataTransfer: { effectAllowed: "", setData: vi.fn() } });
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("canAdd=false leaves Enter a no-op", () => {
    const { onAdd } = panel({ canAdd: false });
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    fireEvent.keyDown(screen.getByTitle("Square A"), { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("PlaygroundAlbumsPanel reasons a person can read", () => {
  it("describes a disabled thumbnail's reason to keyboard and screen-reader users, not only on hover", () => {
    brandFiles([{ id: "design-1", name: "Square video", mime: "video/mp4" }]);
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    const thumb = screen.getByRole("button", { name: "Square video" });
    expect(thumb).toHaveAttribute("aria-disabled", "true");
    // A `title` tooltip never appears on keyboard focus, so the reason is rendered text that the
    // thumbnail points at, shown on hover and focus.
    const reason = screen.getByText("Stays in the project.");
    expect(thumb).toHaveAttribute("aria-describedby", reason.id);
    expect(thumb).toHaveAccessibleDescription("Stays in the project.");
  });

  it("explains why nothing can be added while the board is full, instead of ignoring the attempt", () => {
    const { onAdd, onDragStart } = panel({
      canAdd: false,
      blockedReason: "This Playground holds 500 items. Remove an item before adding more.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Campaign square" }));
    const thumb = screen.getByRole("button", { name: "Square A" });
    expect(thumb).toHaveAttribute("aria-disabled", "true");
    expect(thumb).toHaveAttribute("draggable", "false");
    expect(thumb).toHaveAccessibleDescription(
      "This Playground holds 500 items. Remove an item before adding more.",
    );
    fireEvent.keyDown(thumb, { key: "Enter" });
    fireEvent.dragStart(thumb, { dataTransfer: { effectAllowed: "", setData: vi.fn() } });
    expect(onAdd).not.toHaveBeenCalled();
    expect(onDragStart).not.toHaveBeenCalled();
  });
});

const clipboardAlbum: Album = {
  id: "playground",
  group: "playground",
  label: "Playground",
  files: [
    {
      id: "pg-1",
      title: "Moodboard",
      mimeType: "image/png",
      sizeBytes: null,
      source: { kind: "playground", assetPath: "b/1/m.png", previewUrl: "https://signed/1" },
    },
    {
      id: "pg-2",
      title: "Brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: null,
      source: { kind: "playground", assetPath: "b/2/b.pdf" },
    },
  ],
};

function renderClipboardPanel({
  onCopy = vi.fn().mockResolvedValue(undefined),
  onDownload = vi.fn().mockResolvedValue(undefined),
}: {
  onCopy?: (file: AlbumFile) => Promise<void>;
  onDownload?: (file: AlbumFile) => Promise<void>;
}) {
  render(
    <PlaygroundAlbumsPanel
      mode="clipboard"
      clientId="c"
      extraAlbums={[clipboardAlbum]}
      onCopy={onCopy}
      onDownload={onDownload}
    />,
  );
  return { onCopy, onDownload };
}

describe("clipboard mode", () => {
  it("copies an image on click and announces it", async () => {
    const onCopy = vi.fn().mockResolvedValue(undefined);
    renderClipboardPanel({ onCopy });
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ id: "pg-1" }));
    expect(await screen.findByText("Image copied")).toBeInTheDocument();
  });

  it("keeps copy feedback separate from thumbnails and preserves keyboard focus", async () => {
    renderClipboardPanel({});
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    const image = screen.getByRole("button", { name: "Copy Moodboard" });
    image.focus();
    fireEvent.click(image);
    const status = await screen.findByRole("status");
    expect(await screen.findByText("Image copied")).toBeVisible();
    expect(status).toHaveTextContent("Click inside the Miro board, then paste");
    expect(status.querySelector("img")).toBeNull();
    expect(image).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss copy message" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ignores an older result from repeated clicks on the same image", async () => {
    let rejectFirst!: (error: Error) => void;
    const onCopy = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValue(undefined);
    renderClipboardPanel({ onCopy });
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    await screen.findByText("Image copied");
    await act(async () => {
      rejectFirst(new Error("Old request failed"));
    });
    expect(screen.getByText("Image copied")).toBeVisible();
    expect(screen.queryByText("Couldn't copy this image.")).toBeNull();
  });

  it("does not reopen dismissed feedback when a pending copy completes", async () => {
    let complete!: () => void;
    renderClipboardPanel({
      onCopy: () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    });
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss copy message" }));
    await act(async () => {
      complete();
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers Download when copying fails", async () => {
    const onCopy = vi.fn().mockRejectedValue(new Error("unsupported"));
    const onDownload = vi.fn().mockResolvedValue(undefined);
    renderClipboardPanel({ onCopy, onDownload });
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    expect(await screen.findByText("Couldn't copy this image.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download Moodboard" }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "pg-1" }));
  });

  it("announces a polite failure when Download itself fails", async () => {
    const onCopy = vi.fn().mockRejectedValue(new Error("unsupported"));
    const onDownload = vi.fn().mockRejectedValue(new Error("network"));
    renderClipboardPanel({ onCopy, onDownload });
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    await screen.findByText("Couldn't copy this image.");
    fireEvent.click(screen.getByRole("button", { name: "Download Moodboard" }));
    expect(await screen.findByText("Couldn't download this file.")).toBeInTheDocument();
  });

  it("ignores a stale copy result once a later click on another file has already announced its own", async () => {
    const twoImageAlbum: Album = {
      id: "playground",
      group: "playground",
      label: "Playground",
      files: [
        {
          id: "pg-1",
          title: "Moodboard",
          mimeType: "image/png",
          sizeBytes: null,
          source: { kind: "playground", assetPath: "b/1/m.png", previewUrl: "https://signed/1" },
        },
        {
          id: "pg-2",
          title: "Sketch",
          mimeType: "image/png",
          sizeBytes: null,
          source: { kind: "playground", assetPath: "b/2/s.png", previewUrl: "https://signed/2" },
        },
      ],
    };
    let rejectFirst: ((error: Error) => void) | undefined;
    const onCopy = vi.fn().mockImplementation((file: AlbumFile) =>
      file.id === "pg-1"
        ? new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          })
        : Promise.resolve(undefined),
    );
    render(
      <PlaygroundAlbumsPanel
        mode="clipboard"
        clientId="c"
        extraAlbums={[twoImageAlbum]}
        onCopy={onCopy}
        onDownload={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Sketch" }));
    expect(await screen.findByText("Image copied")).toBeInTheDocument();
    // Moodboard's earlier, slower click now fails; that stale result must not override the
    // status Sketch's later, already-resolved click announced.
    rejectFirst?.(new Error("slow failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByText("Image copied")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't copy this image.")).not.toBeInTheDocument();
  });

  it("disables files that are not images and never makes them draggable", () => {
    renderClipboardPanel({});
    fireEvent.click(screen.getByRole("button", { name: /Playground/ }));
    const pdf = screen.getByRole("button", { name: /Brief\.pdf/ });
    expect(pdf).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Only images can be copied.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Moodboard" })).toHaveAttribute(
      "draggable",
      "false",
    );
  });
});
