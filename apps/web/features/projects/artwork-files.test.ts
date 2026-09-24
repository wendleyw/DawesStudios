import { describe, expect, it, vi, beforeEach } from "vitest";
import { VIDEO_MAX_BYTES, isVideoUpload } from "@/features/shared/upload-rules";

const tusUploadMock = vi.hoisted(() => vi.fn());
const urlStorageMock = vi.hoisted(() => ({
  findUploadsByFingerprint: vi.fn(),
  removeUpload: vi.fn(),
}));
vi.mock("tus-js-client", () => ({
  Upload: tusUploadMock,
  defaultOptions: { urlStorage: urlStorageMock },
}));

const {
  classifyUploadError,
  discardRawUpload,
  discardUnreferencedArtwork,
  UploadCancelledError,
  UploadExpiredError,
  uploadDesignAsset,
  videoFingerprint,
} = await import("./artwork-files");
const { MediaRequestError } = await import("./media-client");

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

describe("videoFingerprint", () => {
  const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });

  it("scopes the fingerprint to the user, the project and the file's own identity", () => {
    const fingerprint = videoFingerprint("user-1", "project-1", file);
    expect(fingerprint).toBe(`dawes-video:user-1:project-1:clip.mp4:4:${file.lastModified}`);
  });

  it("differs for a different project, so the same file never resumes another project's upload", () => {
    expect(videoFingerprint("user-1", "project-1", file)).not.toBe(
      videoFingerprint("user-1", "project-2", file),
    );
  });

  it("differs for a different user, so the same file never resumes another user's upload", () => {
    expect(videoFingerprint("user-1", "project-1", file)).not.toBe(
      videoFingerprint("user-2", "project-1", file),
    );
  });

  it("differs for a different file chosen for the same project", () => {
    const other = new File([new Uint8Array(5)], "other.mp4", { type: "video/mp4" });
    expect(videoFingerprint("user-1", "project-1", file)).not.toBe(
      videoFingerprint("user-1", "project-1", other),
    );
  });
});

describe("classifyUploadError", () => {
  it("classifies a cancelled upload as cancelled, never retried", () => {
    expect(classifyUploadError(new UploadCancelledError())).toBe("cancelled");
  });
  it("classifies an expired upload as expired", () => {
    expect(classifyUploadError(new UploadExpiredError())).toBe("expired");
    expect(classifyUploadError(new MediaRequestError("gone", 410))).toBe("expired");
  });
  it("classifies a processing-phase abort (a raw AbortError from the aborted fetch) as cancelled, not transient", () => {
    // Cancel during the transfer phase rejects with UploadCancelledError directly, but cancel
    // during processing aborts sanitizeVideoAsset's fetch, which rejects with a plain DOMException
    // named "AbortError" -- there is no MediaRequestError to inspect, since the request never got
    // a response. Both phases must classify as "cancelled", or a deliberate cancel would show
    // "Try processing again" instead of "Upload cancelled".
    expect(classifyUploadError(new DOMException("The operation was aborted.", "AbortError"))).toBe(
      "cancelled",
    );
  });
  it("classifies an abort by its name, whichever realm's DOMException carried it", () => {
    expect(classifyUploadError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(
      "cancelled",
    );
  });
  it("classifies a genuine fetch-level timeout (AbortSignal.timeout firing) as transient, not cancelled", () => {
    expect(classifyUploadError(new DOMException("The operation timed out.", "TimeoutError"))).toBe(
      "transient",
    );
  });
  it("classifies network-level, timeout, 408, 429 and 5xx failures as transient", () => {
    expect(classifyUploadError(new TypeError("Failed to fetch"))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("timeout", 408))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("busy", 429))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("unavailable", 503))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("timeout", 504))).toBe("transient");
  });
  it("classifies 415 and 422 as permanent, never retried", () => {
    expect(classifyUploadError(new MediaRequestError("wrong type", 415))).toBe("permanent");
    expect(classifyUploadError(new MediaRequestError("invalid content", 422))).toBe("permanent");
  });
});

const projectId = "11111111-1111-4111-8111-111111111111";

type PreviousUpload = {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
};
type MockUploadOptions = {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  onProgress?: (sent: number, total: number) => void;
  onBeforeRequest?: (request: {
    setHeader: (name: string, value: string) => void;
  }) => Promise<void>;
  fingerprint?: () => Promise<string>;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
  endpoint?: string;
  chunkSize?: number;
};
type MockUpload = {
  start: () => void;
  abort: (terminate?: boolean) => Promise<void>;
  findPreviousUploads: () => Promise<PreviousUpload[]>;
  resumeFromPreviousUpload: (previous: PreviousUpload) => void;
};

/** A stored resume point the way tus-js-client keeps one in browser storage. */
function previousUpload(objectName: string | undefined): PreviousUpload {
  return {
    size: 4,
    metadata:
      objectName === undefined
        ? {}
        : { objectName, bucketName: "internal-assets", contentType: "video/mp4" },
    creationTime: "",
    urlStorageKey: "tus::dawes-video::1",
    uploadUrl: "https://supabase.test/upload/1",
    parallelUploadUrls: null,
  };
}

/**
 * Builds the mocked `tus.Upload` instance a test configures. `previousUploads` stands in for what
 * `findPreviousUploads` would return from browser storage; `onFinish` fires when `start()` is
 * called, mirroring a real (possibly resumed) transfer's completion.
 */
function mockUpload(
  options: {
    previousUploads?: PreviousUpload[];
    onFinish?: (options: MockUploadOptions) => void;
    abort?: (terminate?: boolean) => Promise<void>;
  } = {},
) {
  let capturedOptions: MockUploadOptions | undefined;
  const resumed: PreviousUpload[] = [];
  const aborts: (boolean | undefined)[] = [];
  tusUploadMock.mockImplementation(function (_file: File, uploadOptions: MockUploadOptions) {
    capturedOptions = uploadOptions;
    const instance: MockUpload = {
      start: () => options.onFinish?.(uploadOptions),
      abort: async (terminate) => {
        aborts.push(terminate);
        await options.abort?.(terminate);
      },
      findPreviousUploads: async () => options.previousUploads ?? [],
      resumeFromPreviousUpload: (previous) => {
        resumed.push(previous);
      },
    };
    return instance;
  });
  return { capturedOptions: () => capturedOptions, resumed, aborts };
}

/**
 * `uploadDesignAsset`'s video branch touches two boundaries this suite does not otherwise cover:
 * the TUS client (mocked above, at the module level) and the media service's HTTP response
 * (mocked here via `fetch`). Neither mock proves the real upload or the real service works — only
 * a browser against a live Supabase stack and a live `apps/media` can prove that. What this does
 * prove, at the seam this module owns: the raw path is shaped, resumed and reused correctly, the
 * video branch is only taken for a video, cancel and retry behave as the dialog relies on, and a
 * failure from either boundary reaches the caller instead of being swallowed.
 */
function stubSessionDatabase(token: string | null = "token-abc", userId = "user-1") {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: token ? { access_token: token, user: { id: userId } } : null },
    error: null,
  });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const bucket = vi.fn().mockReturnValue({ remove });
  return {
    database: { auth: { getSession }, storage: { from: bucket } } as never,
    getSession,
    bucket,
    remove,
  };
}

function sanitizedResponse(path = "clean-project/clean.mp4") {
  return { ok: true, json: async () => ({ path, durationSeconds: 1, width: 1, height: 1 }) };
}

describe("uploadDesignAsset", () => {
  beforeEach(() => {
    tusUploadMock.mockReset();
    urlStorageMock.findUploadsByFingerprint.mockReset().mockResolvedValue([]);
    urlStorageMock.removeUpload.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("surfaces a genuine session-lookup failure instead of implying the sign-in itself is invalid", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: "network error contacting the auth server" },
    });
    const database = { auth: { getSession } } as never;
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(uploadDesignAsset(database, "http://media.test", projectId, file)).rejects.toThrow(
      "network error contacting the auth server",
    );
    expect(tusUploadMock).not.toHaveBeenCalled();
  });

  it("fetches a fresh token for every request instead of baking one static header into the transfer", async () => {
    // `jwt_expiry` is short enough that a large upload can outlive the token captured at the
    // start; a static `headers.authorization` would then 401 on a later chunk with no retry
    // (tus-js-client never retries a 401). Each call to `getSession` here returns a different
    // token, so asserting that `onBeforeRequest` sees a new one on every invocation is what
    // proves the header is not fixed at construction time.
    let calls = 0;
    const getSession = vi.fn().mockImplementation(async () => {
      calls += 1;
      return {
        data: { session: { access_token: `token-${calls}`, user: { id: "user-1" } } },
        error: null,
      };
    });
    const database = { auth: { getSession } } as never;
    const { capturedOptions } = mockUpload({ onFinish: (options) => options.onSuccess?.() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sanitizedResponse()));

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await uploadDesignAsset(database, "http://media.test", projectId, file);

    // No static token lives in `headers` at all.
    expect(capturedOptions()?.headers?.authorization).toBeUndefined();

    // What matters is only that two further, back-to-back `onBeforeRequest` invocations each see
    // a token newer than the last, not any particular absolute count.
    const before = calls;
    const setHeader = vi.fn();
    await capturedOptions()?.onBeforeRequest?.({ setHeader });
    await capturedOptions()?.onBeforeRequest?.({ setHeader });
    expect(setHeader).toHaveBeenNthCalledWith(1, "authorization", `Bearer token-${before + 1}`);
    expect(setHeader).toHaveBeenNthCalledWith(2, "authorization", `Bearer token-${before + 2}`);
  });

  it("builds a fresh raw path and sends it to the sanitiser when no previous upload exists", async () => {
    const stub = stubSessionDatabase();
    let sanitizeBody: { projectId: string; rawPath: string; mimeType: string } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
        sanitizeBody = JSON.parse(init.body);
        return sanitizedResponse();
      }),
    );
    const { capturedOptions, resumed } = mockUpload({
      onFinish: (options) => options.onSuccess?.(),
    });

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const rawPaths: string[] = [];
    const path = await uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      onRawPath: (value) => rawPaths.push(value),
    });

    expect(path).toBe("clean-project/clean.mp4");
    const rawPath = capturedOptions()?.metadata?.objectName ?? "";
    expect(rawPath).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.raw$/);
    expect(rawPath.split("/")[0]).toBe(projectId);
    expect(capturedOptions()?.metadata?.bucketName).toBe("internal-assets");
    expect(capturedOptions()?.chunkSize).toBe(6 * 1024 * 1024);
    expect(await capturedOptions()?.fingerprint?.()).toBe(
      videoFingerprint("user-1", projectId, file),
    );
    expect(sanitizeBody).toEqual({ projectId, rawPath, mimeType: "video/mp4" });
    expect(rawPaths).toEqual([rawPath]);
    expect(resumed).toEqual([]);
  });

  it("resumes from a previous upload's stored objectName instead of a new uuid", async () => {
    const stub = stubSessionDatabase();
    const previousRawPath = `${projectId}/22222222-2222-4222-8222-222222222222.raw`;
    let sanitizeBody: { rawPath: string } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
        sanitizeBody = JSON.parse(init.body);
        return sanitizedResponse();
      }),
    );
    const previous = previousUpload(previousRawPath);
    const { capturedOptions, resumed } = mockUpload({
      previousUploads: [previous],
      onFinish: (options) => options.onSuccess?.(),
    });

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    let resumingFired = false;
    const path = await uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      onResuming: () => {
        resumingFired = true;
      },
    });

    expect(path).toBe("clean-project/clean.mp4");
    expect(resumed).toEqual([previous]);
    expect(sanitizeBody?.rawPath).toBe(previousRawPath);
    expect(resumingFired).toBe(true);
    // If the stored upload URL has expired, tus-js-client quietly creates a new upload from these
    // options instead, so they must name the same path the sanitiser is about to be given.
    expect(capturedOptions()?.metadata?.objectName).toBe(previousRawPath);
  });

  it("never fires onResuming for a fresh transfer with no previous upload", async () => {
    const stub = stubSessionDatabase();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sanitizedResponse()));
    mockUpload({ onFinish: (options) => options.onSuccess?.() });

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    let resumingFired = false;
    await uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      onResuming: () => {
        resumingFired = true;
      },
    });

    expect(resumingFired).toBe(false);
  });

  it.each([
    ["is missing", undefined],
    ["does not look like a raw video path", `${projectId}/aaaaaaaa-previous.raw`],
    [
      "belongs to another project",
      "33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222.raw",
    ],
  ])(
    "falls back to a fresh upload when a previous upload's objectName %s",
    async (_case, objectName) => {
      const stub = stubSessionDatabase();
      let sanitizeBody: { rawPath: string } | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
          sanitizeBody = JSON.parse(init.body);
          return sanitizedResponse();
        }),
      );
      const { resumed } = mockUpload({
        previousUploads: [previousUpload(objectName)],
        onFinish: (options) => options.onSuccess?.(),
      });

      const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
      await uploadDesignAsset(stub.database, "http://media.test", projectId, file);

      expect(resumed).toEqual([]);
      expect(sanitizeBody?.rawPath).toMatch(new RegExp(`^${projectId}/[0-9a-f-]{36}\\.raw$`));
      expect(sanitizeBody?.rawPath).not.toBe(objectName);
    },
  );

  it("rejects with UploadCancelledError and calls upload.abort(true) when the signal aborts during transfer", async () => {
    const stub = stubSessionDatabase();
    const { aborts } = mockUpload();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const promise = uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(tusUploadMock).toHaveBeenCalled());
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(UploadCancelledError);
    expect(aborts).toEqual([true]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forgets the stored resume point on cancel even when the server refuses to terminate the upload", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ abort: async () => Promise.reject(new Error("tus: termination not supported")) });
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    urlStorageMock.findUploadsByFingerprint.mockResolvedValue([
      previousUpload(`${projectId}/22222222-2222-4222-8222-222222222222.raw`),
    ]);
    const controller = new AbortController();
    const promise = uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(tusUploadMock).toHaveBeenCalled());
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(UploadCancelledError);
    await vi.waitFor(() =>
      expect(urlStorageMock.removeUpload).toHaveBeenCalledWith("tus::dawes-video::1"),
    );
    expect(urlStorageMock.findUploadsByFingerprint).toHaveBeenCalledWith(
      videoFingerprint("user-1", projectId, file),
    );
  });

  it("rejects with UploadCancelledError without starting a transfer when the signal aborts during the session lookup", async () => {
    let releaseSession: () => void = () => {};
    const getSession = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSession = () =>
            resolve({
              data: { session: { access_token: "token-abc", user: { id: "user-1" } } },
              error: null,
            });
        }),
    );
    const database = { auth: { getSession } } as never;
    const started = vi.fn();
    tusUploadMock.mockImplementation(function () {
      return {
        start: started,
        abort: async () => {},
        findPreviousUploads: async () => [],
        resumeFromPreviousUpload: () => {},
      } satisfies MockUpload;
    });
    const controller = new AbortController();
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const promise = uploadDesignAsset(database, "http://media.test", projectId, file, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(getSession).toHaveBeenCalled());
    controller.abort();
    releaseSession();
    await expect(promise).rejects.toBeInstanceOf(UploadCancelledError);
    expect(started).not.toHaveBeenCalled();
  });

  it("rejects with UploadExpiredError when the resumable upload URL is gone (a 404/410 from the tus endpoint)", async () => {
    const stub = stubSessionDatabase();
    mockUpload({
      onFinish: (options) =>
        options.onError?.({
          name: "DetailedError",
          message: "tus: unexpected response",
          originalResponse: { getStatus: () => 410 },
        }),
    });
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toBeInstanceOf(UploadExpiredError);
  });

  it("rejects when the resumable upload itself fails, without ever calling the sanitiser", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onError?.(new Error("connection reset")) });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow("connection reset");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a transient processing failure once automatically, with the same raw path, and succeeds", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onSuccess?.() });
    let attempt = 0;
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
        bodies.push(init.body);
        attempt += 1;
        if (attempt === 1)
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: "Media processing is busy." }),
          };
        return sanitizedResponse();
      }),
    );
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const path = await uploadDesignAsset(stub.database, "http://media.test", projectId, file);
    expect(path).toBe("clean-project/clean.mp4");
    expect(attempt).toBe(2);
    expect(JSON.parse(bodies[0]).rawPath).toBe(JSON.parse(bodies[1]).rawPath);
  });

  it("gives up after one automatic retry, surfacing the second transient failure", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onSuccess?.() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        attempt += 1;
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: "Media processing is busy." }),
        };
      }),
    );
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow("Media processing is busy.");
    expect(attempt).toBe(2);
  });

  it("never retries a permanent (422) processing failure", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onSuccess?.() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        attempt += 1;
        return {
          ok: false,
          status: 422,
          json: async () => ({ error: "The video could not be read." }),
        };
      }),
    );
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow("The video could not be read.");
    expect(attempt).toBe(1);
  });

  it("surfaces the sanitiser's failure and logs the raw path the browser leaves in place", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onSuccess?.() });
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

    // The browser never removes the raw object on a processing failure: the media service
    // discards content it rejects, a retry reuses it, and its 24-hour sweep removes the rest.
    expect(stub.remove).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("aborts processing on cancel without terminating the finished transfer, and logs nothing", async () => {
    const stub = stubSessionDatabase();
    const { aborts } = mockUpload({ onFinish: (options) => options.onSuccess?.() });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let processingStarted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            processingStarted = true;
            init.signal.addEventListener("abort", () => reject(init.signal.reason));
          }),
      ),
    );
    const controller = new AbortController();
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const promise = uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(processingStarted).toBe(true));
    controller.abort();
    const error = await promise.catch((reason: unknown) => reason);
    expect(classifyUploadError(error)).toBe("cancelled");
    expect(aborts).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("discardRawUpload", () => {
  it("posts the project and raw path to the media service", async () => {
    const stub = stubSessionDatabase();
    let sent: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init: { body: string }) => {
        sent = { url, body: JSON.parse(init.body) };
        return { ok: true, json: async () => ({ discarded: true }) };
      }),
    );
    await discardRawUpload(stub.database, "http://media.test", {
      projectId,
      rawPath: `${projectId}/x.raw`,
    });
    expect(sent).toEqual({
      url: "http://media.test/designs/discard-raw",
      body: { projectId, rawPath: `${projectId}/x.raw` },
    });
  });
});
