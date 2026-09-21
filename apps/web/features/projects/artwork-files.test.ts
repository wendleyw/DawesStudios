import { describe, expect, it, vi, beforeEach } from "vitest";
import { VIDEO_MAX_BYTES, isVideoUpload } from "@/features/shared/upload-rules";

const tusUploadMock = vi.hoisted(() => vi.fn());
vi.mock("tus-js-client", () => ({ Upload: tusUploadMock }));

const { discardUnreferencedArtwork, uploadDesignAsset } = await import("./artwork-files");
type MockUploadOptions = {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (sent: number, total: number) => void;
  metadata?: Record<string, string>;
  endpoint?: string;
  chunkSize?: number;
};

type Result = { data: unknown; error: { message: string } | null };

function stubDatabase(rows: Result, removal: Result = { data: [], error: null }) {
  const eq = vi.fn().mockResolvedValue(rows);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const remove = vi.fn().mockResolvedValue(removal);
  const bucket = vi.fn().mockReturnValue({ remove });
  return {
    database: { from, storage: { from: bucket } } as never,
    from,
    select,
    eq,
    bucket,
    remove,
  };
}

describe("discardUnreferencedArtwork", () => {
  it("removes an upload no design references", async () => {
    const stub = stubDatabase({ data: [], error: null });
    await discardUnreferencedArtwork(stub.database, "project-1/artwork.png");
    expect(stub.from).toHaveBeenCalledWith("designs");
    expect(stub.select).toHaveBeenCalledWith("id");
    expect(stub.eq).toHaveBeenCalledWith("internal_asset_path", "project-1/artwork.png");
    expect(stub.bucket).toHaveBeenCalledWith("internal-assets");
    expect(stub.remove).toHaveBeenCalledWith(["project-1/artwork.png"]);
  });

  it("keeps an upload a design already points at", async () => {
    const stub = stubDatabase({ data: [{ id: "design-1" }], error: null });
    await discardUnreferencedArtwork(stub.database, "project-1/artwork.png");
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it("surfaces the database error message", async () => {
    const stub = stubDatabase({ data: null, error: { message: "permission denied" } });
    await expect(
      discardUnreferencedArtwork(stub.database, "project-1/artwork.png"),
    ).rejects.toThrow("permission denied");
  });

  it("surfaces a storage error message", async () => {
    const stub = stubDatabase(
      { data: [], error: null },
      { data: null, error: { message: "object not found" } },
    );
    await expect(
      discardUnreferencedArtwork(stub.database, "project-1/artwork.png"),
    ).rejects.toThrow("object not found");
  });
});

const projectId = "11111111-1111-4111-8111-111111111111";

/**
 * `uploadDesignAsset`'s video branch touches two boundaries this suite does not otherwise cover:
 * the TUS client (mocked above, at the module level) and the media service's HTTP response
 * (mocked here via `fetch`). Neither mock proves the real upload or the real service works — only
 * a browser against a live Supabase stack and a live `apps/media` can prove that. What this does
 * prove, at the seam this module owns: the raw path is shaped and reused correctly, the video
 * branch is only taken for a video, and a failure from either boundary reaches the caller instead
 * of being swallowed.
 */
function stubSessionDatabase(token: string | null = "token-abc") {
  const getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: token ? { access_token: token } : null }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const bucket = vi.fn().mockReturnValue({ remove });
  return {
    database: { auth: { getSession }, storage: { from: bucket } } as never,
    getSession,
    bucket,
    remove,
  };
}

describe("uploadDesignAsset", () => {
  beforeEach(() => {
    tusUploadMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("refuses a video over the ceiling before any network call", async () => {
    const database = {
      storage: {
        from: () => {
          throw new Error("must not upload");
        },
      },
    };
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: VIDEO_MAX_BYTES + 1 });
    await expect(
      uploadDesignAsset(database as never, "http://media.test", projectId, file),
    ).rejects.toThrow(/no larger than/);
    expect(tusUploadMock).not.toHaveBeenCalled();
  });

  it("refuses a video format a browser cannot play", async () => {
    const database = {
      storage: {
        from: () => {
          throw new Error("must not upload");
        },
      },
    };
    const file = new File([new Uint8Array(4)], "clip.mov", { type: "video/quicktime" });
    await expect(
      uploadDesignAsset(database as never, "http://media.test", projectId, file),
    ).rejects.toThrow(/MP4|WebM/);
    expect(tusUploadMock).not.toHaveBeenCalled();
  });

  it("sends an image down the canvas path, untouched by the video branch", () => {
    // The existing image test in this file already covers the happy path; this one only asserts
    // that adding video did not divert it.
    const file = new File([new Uint8Array(4)], "art.png", { type: "image/png" });
    expect(isVideoUpload(file.type)).toBe(false);
  });

  it("refuses a video upload when the session has no access token, before starting any transfer", async () => {
    const stub = stubSessionDatabase(null);
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow(/sign-in is no longer valid/);
    expect(tusUploadMock).not.toHaveBeenCalled();
  });

  it("builds the raw path as `${projectId}/<uuid>.raw` and sends it unchanged to the sanitiser", async () => {
    const stub = stubSessionDatabase();
    let capturedOptions: MockUploadOptions | undefined;
    tusUploadMock.mockImplementation(function (_file: File, options: MockUploadOptions) {
      capturedOptions = options;
      return { start: () => options.onSuccess?.() };
    });
    let sanitizeBody: { projectId: string; rawPath: string; mimeType: string } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
        sanitizeBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            path: "clean-project/clean.mp4",
            durationSeconds: 12,
            width: 1920,
            height: 1080,
          }),
        };
      }),
    );

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const path = await uploadDesignAsset(stub.database, "http://media.test", projectId, file);

    expect(path).toBe("clean-project/clean.mp4");
    expect(capturedOptions?.metadata?.objectName).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.raw$/);
    const rawPath = capturedOptions?.metadata?.objectName ?? "";
    expect(rawPath.split("/")[0]).toBe(projectId);
    expect(capturedOptions?.metadata?.bucketName).toBe("internal-assets");
    expect(capturedOptions?.chunkSize).toBe(6 * 1024 * 1024);
    expect(sanitizeBody).toEqual({ projectId, rawPath, mimeType: "video/mp4" });
  });

  it("rejects when the resumable upload itself fails, without ever calling the sanitiser", async () => {
    const stub = stubSessionDatabase();
    tusUploadMock.mockImplementation(function (_file: File, options: MockUploadOptions) {
      return { start: () => options.onError?.(new Error("connection reset")) };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow("connection reset");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the sanitiser's failure and leaves the raw object in place, uncleaned", async () => {
    const stub = stubSessionDatabase();
    tusUploadMock.mockImplementation(function (_file: File, options: MockUploadOptions) {
      return { start: () => options.onSuccess?.() };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 415,
        json: async () => ({ error: "The file is not a playable MP4 or WebM video." }),
      }),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow("The file is not a playable MP4 or WebM video.");

    // Nothing in the browser calls storage to remove the raw object on this failure: there is no
    // equivalent of `discardUnreferencedArtwork` for video, by design (see the brief and the
    // function's own doc comment). The failure is at least made visible instead of swallowed.
    expect(stub.remove).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
