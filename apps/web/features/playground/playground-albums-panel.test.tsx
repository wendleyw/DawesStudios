import { fireEvent, render, screen } from "@testing-library/react";
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

const projectBackend = vi.hoisted(() => ({
  useProjectDetail: vi.fn(),
  useDesignAssetUrl: vi.fn(),
}));
vi.mock("@/features/projects/project-data", () => projectBackend);

const auth = vi.hoisted(() => ({ profile: { role: "agency" } }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

function projectDetail(
  overrides: Partial<{ deliverables: unknown[]; versions: unknown[]; designs: unknown[] }> = {},
) {
  return {
    data: {
      deliverables: [{ id: "d-square", name: "Campaign square", sort_order: 0 }],
      versions: [
        {
          id: "v1",
          projectId: "project-1",
          deliverableId: "d-square",
          number: 1,
          note: "",
          status: "draft",
          date: "",
        },
      ],
      designs: [
        {
          id: "design-1",
          versionId: "v1",
          title: "Square A",
          content: {},
          assetPath: "p/design-1.png",
          order: 0,
        },
        {
          id: "design-2",
          versionId: "v1",
          title: "Square B",
          content: {},
          assetPath: "p/design-2.png",
          order: 1,
        },
      ],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.profile = { role: "agency" };
  backend.useBrandAssetFolders.mockReturnValue({ data: [] });
  backend.useBrandAssets.mockReturnValue({ data: [] });
  backend.useBrandAssetPreviewUrl.mockReturnValue({ data: undefined });
  projectBackend.useDesignAssetUrl.mockReturnValue({ data: undefined });
  projectBackend.useProjectDetail.mockReturnValue(projectDetail());
});

function panel(overrides: BoardOverrides = {}) {
  const onAdd = vi.fn();
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();
  const viewCenter = vi.fn(() => ({ x: 10, y: 20 }));
  render(
    <PlaygroundAlbumsPanel
      clientId="client-1"
      projectId="project-1"
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
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    expect(screen.getByTitle("Square A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    expect(screen.queryByTitle("Square A")).not.toBeInTheDocument();
  });

  it("shows no chip for an album with no storable files, but a disabled file still appears dimmed inside an open one", () => {
    projectBackend.useProjectDetail.mockReturnValue(
      projectDetail({
        designs: [
          {
            id: "design-1",
            versionId: "v1",
            title: "Square A",
            content: {},
            assetPath: "p/design-1.png",
            order: 0,
          },
          {
            id: "design-2",
            versionId: "v1",
            title: "Square video",
            content: {},
            assetPath: "p/design-2.mp4",
            order: 1,
          },
        ],
      }),
    );
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    const disabled = screen.getByRole("button", { name: "Square video" });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled).toHaveAttribute("draggable", "false");
  });
});
describe("PlaygroundAlbumsPanel selection and keyboard", () => {
  it("switching to another album clears the selection", () => {
    projectBackend.useProjectDetail.mockReturnValue(
      projectDetail({
        deliverables: [
          { id: "d-square", name: "Campaign square", sort_order: 0 },
          { id: "d-story", name: "Campaign story", sort_order: 1 },
        ],
        versions: [
          {
            id: "v1",
            projectId: "project-1",
            deliverableId: "d-square",
            number: 1,
            note: "",
            status: "draft",
            date: "",
          },
          {
            id: "v2",
            projectId: "project-1",
            deliverableId: "d-story",
            number: 1,
            note: "",
            status: "draft",
            date: "",
          },
        ],
        designs: [
          {
            id: "design-1",
            versionId: "v1",
            title: "Square A",
            content: {},
            assetPath: "p/design-1.png",
            order: 0,
          },
          {
            id: "design-3",
            versionId: "v2",
            title: "Story A",
            content: {},
            assetPath: "p/design-3.png",
            order: 0,
          },
        ],
      }),
    );
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square A"));
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Campaign story · V1" }));
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "false");
  });

  it("Shift+click selects a range", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square A"));
    fireEvent.click(screen.getByTitle("Square B"), { shiftKey: true });
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Square B")).toHaveAttribute("aria-pressed", "true");
  });

  it("Enter on a focused thumbnail adds only that file, at the view center", () => {
    const { onAdd, viewCenter } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square B")); // select a different file first
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(screen.getByTitle("Square A"), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith([expect.objectContaining({ id: "design-1" })]);
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Square B")).toHaveAttribute("aria-pressed", "false");
  });

  it("dragging a thumbnail that is part of the current selection drags the whole selection", () => {
    const { onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
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
    projectBackend.useProjectDetail.mockReturnValue(
      projectDetail({
        designs: [
          {
            id: "design-1",
            versionId: "v1",
            title: "Square video",
            content: {},
            assetPath: "p/design-1.mp4",
            order: 0,
          },
        ],
      }),
    );
    const { onAdd, onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    const thumb = screen.getByRole("button", { name: "Square video" });
    fireEvent.keyDown(thumb, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.dragStart(thumb, { dataTransfer: { effectAllowed: "", setData: vi.fn() } });
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("canAdd=false leaves Enter a no-op", () => {
    const { onAdd } = panel({ canAdd: false });
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.keyDown(screen.getByTitle("Square A"), { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("PlaygroundAlbumsPanel role-to-channel mapping", () => {
  // This is the mechanism the spec's "a client never sees, and never requests, an internal
  // design" success criterion rests on: `useProjectDetail` itself coerces to the published
  // projection whenever the signed-in profile is a client (`project-data.ts:105`), but only if
  // this panel ever calls it with a channel a client viewer could plausibly need. Mirrors the same
  // role-to-channel mapping `project-page.tsx:47-52` already uses (minus its agency toggle, which
  // the Playground has none of).
  it("reads the client's published projection for a client viewer", () => {
    auth.profile = { role: "client" };
    panel();
    expect(projectBackend.useProjectDetail).toHaveBeenCalledWith("project-1", "client");
  });

  it("reads working versions for a designer viewer, same as for the agency", () => {
    auth.profile = { role: "designer" };
    panel();
    expect(projectBackend.useProjectDetail).toHaveBeenCalledWith("project-1", "internal");
  });
});

describe("PlaygroundAlbumsPanel reasons a person can read", () => {
  it("describes a disabled thumbnail's reason to keyboard and screen-reader users, not only on hover", () => {
    projectBackend.useProjectDetail.mockReturnValue(
      projectDetail({
        designs: [
          {
            id: "design-1",
            versionId: "v1",
            title: "Square video",
            content: {},
            assetPath: "p/design-1.mp4",
            order: 0,
          },
        ],
      }),
    );
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
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
      projectId="p"
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
    expect(await screen.findByText("Copied — paste in Miro with ⌘V / Ctrl+V")).toBeInTheDocument();
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
