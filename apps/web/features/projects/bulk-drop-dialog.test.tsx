import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkDropDialog } from "./bulk-drop-dialog";
import type { BulkDropDeliverable } from "./bulk-drop-model";
import type { BulkDropOptions, DeliverableRun } from "./bulk-drop-upload";

const data = vi.hoisted(() => ({
  useInvalidateProject: vi.fn(() => vi.fn()),
  createDesignVersion: vi.fn(),
  addDesign: vi.fn(),
}));
vi.mock("./project-data", () => data);
vi.mock("./artwork-files", () => ({ uploadArtwork: vi.fn(), discardUnreferencedArtwork: vi.fn() }));
const auth = vi.hoisted(() => ({ database: {}, session: { user: { id: "agency-1" } } }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

const upload = vi.hoisted(() => ({ runBulkDrop: vi.fn() }));
vi.mock("./bulk-drop-upload", () => upload);

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

const square: BulkDropDeliverable = {
  id: "d-square",
  name: "Campaign square",
  width: 1080,
  height: 1080,
};
const story: BulkDropDeliverable = {
  id: "d-story",
  name: "Campaign story",
  width: 1080,
  height: 1920,
};

// jsdom has no createImageBitmap; each test image carries the pixel size the stub reports.
const pixelSizes = new WeakMap<Blob, { width: number; height: number }>();
function image(name: string, width: number, height: number): File {
  const file = new File([new Uint8Array(1024)], name, { type: "image/png" });
  pixelSizes.set(file, { width, height });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  upload.runBulkDrop.mockResolvedValue({
    resolvedVersionIds: {},
    outcomes: {},
    permissionDenied: false,
  });
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(
    async (blob: Blob) => {
      const size = pixelSizes.get(blob);
      if (!size) throw new Error("not an image");
      return { ...size, close: vi.fn() };
    },
  );
});

describe("BulkDropDialog classification and choices", () => {
  it("shows one block per affected deliverable, with its size and its own version choice", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square, story]}
        versions={[{ id: "v-square-1", deliverableId: "d-square", number: 1, status: "draft" }]}
        files={[image("square-1.png", 1080, 1080), image("story-1.png", 1080, 1920)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Campaign square")).toBeInTheDocument());
    expect(screen.getByText("Campaign story")).toBeInTheDocument();
    expect(screen.getByText(/1080 × 1920/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Add to V1/)).toBeChecked();
    // Campaign story has no current version: no question, straight to V1.
    expect(
      screen.queryByLabelText(/Add to V/i, { selector: `input[name="version-d-story"]` }),
    ).toBeNull();
  });

  it("disables confirmation until every unmatched file is assigned or skipped", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[image("square-1.png", 1080, 1080), image("odd.png", 400, 300)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Needs a deliverable")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Add 1 image/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Skip odd.png/i }));
    expect(screen.getByRole("button", { name: /Add 1 image/i })).toBeEnabled();
  });

  it("adds a hand-assigned file to the chosen deliverable's block", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[image("square-1.png", 1080, 1080), image("odd.png", 400, 300)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Needs a deliverable")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Deliverable for odd.png"), "d-square");
    expect(screen.getByRole("button", { name: /Add 2 images/i })).toBeEnabled();
  });

  it("preselects a new version when the current one is already shared with the client", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[{ id: "v-square-1", deliverableId: "d-square", number: 1, status: "reviewed" }]}
        files={[image("square-1.png", 1080, 1080)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText(/Create V2/)).toBeChecked());
  });

  it("shows only the not-added list, with reasons, when nothing in the drop is usable", async () => {
    const video = new File([new Uint8Array(1024)], "clip.mp4", { type: "video/mp4" });
    const oversized = new File([new Uint8Array(30 * 1024 * 1024)], "huge.png", {
      type: "image/png",
    });
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[video, oversized]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Not added")).toBeInTheDocument());
    expect(screen.getByText(/clip.mp4/)).toBeInTheDocument();
    expect(screen.getByText(/use Add design/i)).toBeInTheDocument();
    expect(screen.getByText(/huge.png/)).toBeInTheDocument();
    expect(screen.getByText(/no larger than/i)).toBeInTheDocument();
    // No deliverable block, no unmatched picker -- nothing was matched, tied or left unmatched.
    expect(screen.queryByText("Campaign square")).toBeNull();
    expect(screen.queryByText("Needs a deliverable")).toBeNull();
    // The confirm control stays disabled rather than silently absent, so the state reads as
    // "nothing to add" instead of a broken dialog.
    expect(screen.getByRole("button", { name: /Add 0 images/i })).toBeDisabled();
  });
});

describe("BulkDropDialog progress and retry", () => {
  it("shows a summary and a retry action limited to failed files after the run finishes", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[image("square-1.png", 1080, 1080), image("square-2.png", 1080, 1080)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Add 2 images/i })).toBeEnabled(),
    );

    // Read the real per-file ids the dialog generated from the first call's own arguments, rather
    // than inventing ids a real retry would never match.
    upload.runBulkDrop.mockImplementationOnce(
      async (_deps: unknown, runs: DeliverableRun[], options: BulkDropOptions) => {
        const [first, second] = runs[0].files;
        options.onFileStatus?.(first.id, { state: "done" });
        options.onFileStatus?.(second.id, { state: "failed", message: "network error" });
        return {
          resolvedVersionIds: { "d-square": "version-new" },
          outcomes: {},
          permissionDenied: false,
        };
      },
    );
    await userEvent.click(screen.getByRole("button", { name: /Add 2 images/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/1 added · 1 failed/)).toBeInTheDocument();
    expect(screen.getByText("network error")).toBeInTheDocument();

    upload.runBulkDrop.mockClear();
    upload.runBulkDrop.mockResolvedValueOnce({
      resolvedVersionIds: {},
      outcomes: {},
      permissionDenied: false,
    });
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    await waitFor(() => expect(upload.runBulkDrop).toHaveBeenCalledTimes(1));
    const [, retryRuns, retryOptions] = upload.runBulkDrop.mock.calls[0];
    expect(retryRuns).toHaveLength(1);
    expect(retryRuns[0].files).toHaveLength(1);
    expect(retryRuns[0].files[0].file.name).toBe("square-2.png");
    expect(retryOptions.knownVersionIds).toEqual({ "d-square": "version-new" });
  });

  it("stops the files still queued when Cancel is pressed during the run", async () => {
    let finish: () => void = () => {};
    let options: BulkDropOptions | undefined;
    upload.runBulkDrop.mockImplementationOnce(
      (_deps: unknown, _runs: DeliverableRun[], runOptions: BulkDropOptions) => {
        options = runOptions;
        return new Promise((resolve) => {
          finish = () => resolve({ resolvedVersionIds: {}, outcomes: {}, permissionDenied: false });
        });
      },
    );
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[image("square-1.png", 1080, 1080)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Add 1 image/i })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /Add 1 image/i }));
    await waitFor(() => expect(options).toBeDefined());
    expect(options?.isCancelled?.()).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(options?.isCancelled?.()).toBe(true);
    await act(async () => finish());
  });

  it("keeps the version choice fixed once a run has started", async () => {
    upload.runBulkDrop.mockImplementationOnce(
      async (_deps: unknown, runs: DeliverableRun[], options: BulkDropOptions) => {
        options.onFileStatus?.(runs[0].files[0].id, { state: "failed", message: "network error" });
        return { resolvedVersionIds: {}, outcomes: {}, permissionDenied: false };
      },
    );
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[{ id: "v-square-1", deliverableId: "d-square", number: 1, status: "draft" }]}
        files={[image("square-1.png", 1080, 1080)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText(/Add to V1/)).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /Add 1 image/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/Add to V1/)).toBeDisabled();
    expect(screen.getByLabelText(/Create V2/)).toBeDisabled();
  });
});
