import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import type { ProjectAction } from "./project-action-dialog";

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => auth);

const projectData = vi.hoisted(() => ({
  addDesign: vi.fn(),
  clearMiroLink: vi.fn(),
  createDesignVersion: vi.fn(),
  findDesignByAsset: vi.fn(),
  findUnchangedDesign: vi.fn(),
  publishVersion: vi.fn(),
  reviewPublication: vi.fn(),
  setMiroLink: vi.fn(),
  submitDesignVersion: vi.fn(),
  updateDesignContent: vi.fn(),
  updateWorkingDesign: vi.fn(),
  useInvalidateProject: () => vi.fn(),
  useLatestMiroLink: vi.fn(),
}));
vi.mock("./project-data", () => projectData);

// Only the calls that leave the browser are mocked; the error classes and `classifyUploadError`
// stay real, so the dialog is tested against the same classification the upload path uses.
const artworkFiles = vi.hoisted(() => ({
  discardUnreferencedArtwork: vi.fn(),
  discardRawUpload: vi.fn(),
  uploadDesignAsset: vi.fn(),
}));
vi.mock("./artwork-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./artwork-files")>()),
  ...artworkFiles,
}));

const mediaClient = vi.hoisted(() => ({
  discardPreparedAssets: vi.fn(),
  preparePublicationAssets: vi.fn(),
  sanitizeVideoAsset: vi.fn(),
}));
vi.mock("./media-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./media-client")>()),
  ...mediaClient,
}));

const { ProjectActionDialog } = await import("./project-action-dialog");
const { UploadCancelledError } = await import("./artwork-files");
const { MediaRequestError } = await import("./media-client");

type UploadOptions = {
  onProgress?: (fraction: number) => void;
  onRawPath?: (rawPath: string) => void;
  onResuming?: () => void;
  signal?: AbortSignal;
};
type UploadCall = (
  database: unknown,
  mediaUrl: string,
  projectId: string,
  file: File,
  options: UploadOptions,
) => Promise<string>;

const version = {
  id: "version-1",
  number: 1,
  status: "draft",
  designs: [],
  notes: "",
} as unknown as CanvasVersion;

function renderDialog(action: ProjectAction = { kind: "design", version }) {
  const client = new QueryClient();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectActionDialog
        action={action}
        projectId="project-1"
        suspended={false}
        onOpenPlayground={() => {}}
        onClose={onClose}
      />
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

// jsdom's `new FormData(form)` never sees a file set on an input from a test (neither
// `fireEvent.change` nor user-event's `upload` reaches its internal file list), so the chosen file
// is handed to the form's `get("artwork")` directly.
let chosenFile: File | null = null;
const realFormDataGet = FormData.prototype.get;
beforeEach(() => {
  vi.clearAllMocks();
  chosenFile = null;
  vi.spyOn(FormData.prototype, "get").mockImplementation(function (this: FormData, name: string) {
    if (name === "artwork" && chosenFile) return chosenFile;
    return realFormDataGet.call(this, name);
  });
  auth.useAuth.mockReturnValue({ database: {}, mediaUrl: "http://media.test" });
  projectData.findDesignByAsset.mockResolvedValue([]);
  projectData.addDesign.mockResolvedValue(undefined);
  artworkFiles.discardRawUpload.mockResolvedValue(undefined);
  projectData.useLatestMiroLink.mockReturnValue({ isPending: false, data: null });
  projectData.publishVersion.mockResolvedValue("pub-1");
  projectData.setMiroLink.mockResolvedValue(undefined);
  projectData.clearMiroLink.mockResolvedValue(undefined);
  mediaClient.preparePublicationAssets.mockResolvedValue({});
  mediaClient.discardPreparedAssets.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function chooseVideo() {
  fireEvent.change(screen.getByLabelText(/design name/i), { target: { value: "Hero cut" } });
  chosenFile = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
  fireEvent.change(screen.getByLabelText(/design file/i), { target: { files: [chosenFile] } });
}

function submit(name: RegExp = /^add design$/i) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** An upload that finishes its transfer, reports its raw path, then waits in processing. */
function processingUpload(): UploadCall {
  return (_database, _mediaUrl, _projectId, _file, options) => {
    options.onProgress?.(1);
    options.onRawPath?.("project-1/raw-1.raw");
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
    });
  };
}

describe("cancel during an active video upload", () => {
  it("aborts the transfer, discards no raw file yet, and stays open showing Upload cancelled", async () => {
    let capturedSignal: AbortSignal | undefined;
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      capturedSignal = options.signal;
      options.onProgress?.(0.2);
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new UploadCancelledError()));
      });
    }) satisfies UploadCall);
    const { onClose } = renderDialog();
    chooseVideo();
    submit();
    await waitFor(() => expect(artworkFiles.uploadDesignAsset).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.getByText(/upload cancelled/i)).toBeInTheDocument());
    expect(capturedSignal?.aborted).toBe(true);
    expect(artworkFiles.discardRawUpload).not.toHaveBeenCalled();
    expect(projectData.addDesign).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/sending/i)).not.toBeInTheDocument();
  });

  it("discards the raw file and clears the processing display when cancel arrives during processing", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(processingUpload());
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() =>
      expect(screen.getByText("Processing…", { selector: "span" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(artworkFiles.discardRawUpload).toHaveBeenCalledWith({}, "http://media.test", {
        projectId: "project-1",
        rawPath: "project-1/raw-1.raw",
      }),
    );
    await waitFor(() => expect(screen.getByText(/upload cancelled/i)).toBeInTheDocument());
    expect(screen.queryByText(/processing…|sending|continuing from/i)).not.toBeInTheDocument();
    expect(projectData.addDesign).not.toHaveBeenCalled();
  });

  it("registers no design when the cancel arrives just after processing succeeded", async () => {
    let finishProcessing: (path: string) => void = () => {};
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      options.onProgress?.(1);
      options.onRawPath?.("project-1/raw-1.raw");
      return new Promise<string>((resolve) => {
        finishProcessing = resolve;
      });
    }) satisfies UploadCall);
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() => expect(artworkFiles.uploadDesignAsset).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await act(async () => finishProcessing("clean-project/clean.mp4"));
    await waitFor(() => expect(screen.getByText(/upload cancelled/i)).toBeInTheDocument());
    expect(projectData.addDesign).not.toHaveBeenCalled();
    expect(artworkFiles.discardRawUpload).toHaveBeenCalled();
  });
});

describe("closing without an active upload", () => {
  it("still closes the dialog immediately, unchanged from before this feature", async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps Cancel disabled while a save that is not an upload is running", async () => {
    projectData.submitDesignVersion.mockReturnValue(new Promise(() => {}));
    const { onClose } = renderDialog({ kind: "submit", version });
    submit(/send to studio/i);
    await waitFor(() => expect(projectData.submitDesignVersion).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    // Escape reaches the Modal as the dialog's own `cancel` event.
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("resuming a previous transfer", () => {
  it("shows Continuing from once onResuming fires, distinct from Sending", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      options.onResuming?.();
      options.onProgress?.(0.4);
      return new Promise(() => {});
    }) satisfies UploadCall);
    renderDialog();
    chooseVideo();
    submit();
    // The submit button's own label also switches while pending, so this scopes to the progress
    // paragraph's <span>.
    await waitFor(() =>
      expect(screen.getByText(/continuing from 40%/i, { selector: "span" })).toBeInTheDocument(),
    );
  });

  it("shows Sending, not Continuing from, when no previous upload is resumed", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      options.onProgress?.(0.4);
      return new Promise(() => {});
    }) satisfies UploadCall);
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() =>
      expect(screen.getByText(/sending 40%/i, { selector: "span" })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/continuing from/i)).not.toBeInTheDocument();
  });
});

describe("a permanent processing failure", () => {
  it("does not silently reprocess the same raw path on resubmit, and offers no retry label", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      options.onRawPath?.("project-1/raw-1.raw");
      return Promise.reject(
        new MediaRequestError("The file is not a playable MP4 or WebM video.", 422),
      );
    }) satisfies UploadCall);
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() => expect(screen.getByText(/not a playable/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /try processing again/i })).not.toBeInTheDocument();

    // A resubmit must go through uploadDesignAsset again (a full, fresh attempt), never straight
    // to sanitizeVideoAsset with the stale raw path.
    artworkFiles.uploadDesignAsset.mockClear();
    submit();
    await waitFor(() => expect(artworkFiles.uploadDesignAsset).toHaveBeenCalled());
    expect(mediaClient.sanitizeVideoAsset).not.toHaveBeenCalled();
  });

  it("tells the person the upload expired when the raw file is gone", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      options.onRawPath?.("project-1/raw-1.raw");
      return Promise.reject(new MediaRequestError("The raw upload has expired.", 410));
    }) satisfies UploadCall);
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() =>
      expect(screen.getByText("The upload expired; choose the file again.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /try processing again/i })).not.toBeInTheDocument();
  });
});

describe("Try processing again", () => {
  function transientProcessingFailure() {
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      options.onProgress?.(1);
      options.onRawPath?.("project-1/raw-1.raw");
      return Promise.reject(new MediaRequestError("Media processing is busy.", 503));
    }) satisfies UploadCall);
  }

  it("relabels the submit control after the automatic retry is exhausted, and resubmitting skips the transfer", async () => {
    transientProcessingFailure();
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /try processing again/i })).toBeInTheDocument(),
    );

    mediaClient.sanitizeVideoAsset.mockResolvedValue({
      path: "clean-project/clean.mp4",
      durationSeconds: 1,
      width: 1,
      height: 1,
    });
    submit(/try processing again/i);
    await waitFor(() => expect(projectData.addDesign).toHaveBeenCalled());
    expect(mediaClient.sanitizeVideoAsset).toHaveBeenCalledWith(
      {},
      "http://media.test",
      { projectId: "project-1", rawPath: "project-1/raw-1.raw", mimeType: "video/mp4" },
      expect.any(AbortSignal),
    );
    expect(artworkFiles.uploadDesignAsset).toHaveBeenCalledTimes(1);
    expect(projectData.addDesign).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ internalAssetPath: "clean-project/clean.mp4" }),
    );
  });

  it("does not send a second processing request while the first retry is still running", async () => {
    transientProcessingFailure();
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /try processing again/i })).toBeInTheDocument(),
    );

    mediaClient.sanitizeVideoAsset.mockReturnValue(new Promise(() => {}));
    submit(/try processing again/i);
    await waitFor(() => expect(mediaClient.sanitizeVideoAsset).toHaveBeenCalledTimes(1));
    const pending = screen.getByRole("button", { name: /processing…/i });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(mediaClient.sanitizeVideoAsset).toHaveBeenCalledTimes(1);
  });

  it("keeps the action's own label for a transient failure that is not video processing", async () => {
    projectData.submitDesignVersion.mockRejectedValue(new TypeError("Failed to fetch"));
    renderDialog({ kind: "submit", version });
    submit(/send to studio/i);
    await waitFor(() => expect(screen.getByText("Failed to fetch")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /send to studio/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try processing again/i })).not.toBeInTheDocument();
  });

  it("offers the full upload again, not Try processing again, when the transfer itself failed", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(((_d, _u, _p, _f, options) => {
      options.onProgress?.(0.3);
      return Promise.reject(new Error("tus: failed to upload chunk"));
    }) satisfies UploadCall);
    renderDialog();
    chooseVideo();
    submit();
    await waitFor(() => expect(screen.getByText(/failed to upload chunk/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^add design$/i })).toBeInTheDocument();
  });
});

const publishedVersion = {
  ...version,
  id: "pub-1",
  deliverableId: "d-1",
  number: 3,
} as CanvasVersion;

describe("Miro links", () => {
  it("prefills the publish field from the previous publication", () => {
    projectData.useLatestMiroLink.mockReturnValue({
      isPending: false,
      data: { boardId: "uXjVKabc123=", widgetId: "7" },
    });
    renderDialog({
      kind: "publish",
      version: { ...version, deliverableId: "d-1" } as CanvasVersion,
    });
    expect(projectData.useLatestMiroLink).toHaveBeenCalledWith("d-1", "client", { enabled: true });
    expect(screen.getByLabelText(/Miro frame/)).toHaveValue(
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=7",
    );
  });

  it("refuses an invalid link before publishing", async () => {
    renderDialog({ kind: "publish", version });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share version" }));
    expect(await screen.findByText(/Paste a Miro board or frame link/)).toBeInTheDocument();
    expect(projectData.publishVersion).not.toHaveBeenCalled();
  });

  it("saves the link on the new publication", async () => {
    const { onClose } = renderDialog({ kind: "publish", version });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://miro.com/app/board/uXjVKabc123=/?moveToWidget=9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share version" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.setMiroLink).toHaveBeenCalledWith(expect.anything(), {
      channel: "client",
      versionId: "pub-1",
      url: "https://miro.com/app/board/uXjVKabc123=/?moveToWidget=9",
    });
  });

  it("reports a shared version whose link was not saved", async () => {
    projectData.setMiroLink.mockRejectedValue(new Error("network down"));
    const { onClose } = renderDialog({ kind: "publish", version });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://miro.com/app/board/uXjVKabc123=/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share version" }));
    expect(
      await screen.findByText(/was shared, but the Miro link was not saved/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the link when the field is saved empty", async () => {
    const { onClose } = renderDialog({
      kind: "miro",
      version: { ...publishedVersion, miro: { boardId: "uXjVKabc123=", widgetId: null } },
      channel: "client",
    });
    fireEvent.change(screen.getByLabelText(/Miro frame/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.clearMiroLink).toHaveBeenCalledWith(expect.anything(), {
      channel: "client",
      versionId: "pub-1",
    });
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
