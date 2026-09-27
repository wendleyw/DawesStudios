import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearProjectCover,
  deliverySchema,
  MediaRequestError,
  mediaErrorMessage,
  prepareProjectCover,
} from "./media-client";
import { invitationRequestSchema } from "@/features/settings/settings-model";

/*
 * A `uuid` column holds any 128-bit value. `gen_random_uuid()` produces version 4, but the
 * deterministic fixtures derive their ids from a hash, so the version and variant nibbles are
 * whatever the digest gave — `3daa14bc-6fe4-ce7e-d63b-dc75e94bba0e` is a real seeded design id and
 * declares version `c`. Validating responses as RFC 4122 version 4 rejected those ids, so sharing a
 * seeded version with a client reported "The file service returned an incomplete response" after the
 * service had already sanitized and stored the artwork.
 */
const seededDesignId = "3daa14bc-6fe4-ce7e-d63b-dc75e94bba0e";
const seededClientId = "e4401a17-cbe2-1d70-400d-d40f9e6b8632";
const generatedId = "b9ca3fce-bba1-4515-9d0c-e978a168d84d";

describe("identifiers the database actually produces", () => {
  it("accepts a delivery whose id is hash-derived", () => {
    const result = deliverySchema.safeParse({
      id: seededDesignId,
      storagePath: "project/delivery.png",
      mimeType: "image/png",
      fileSize: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an invitation to a seeded workspace", () => {
    const result = invitationRequestSchema.safeParse({
      email: "someone@client.dawes.local",
      role: "client",
      clientId: seededClientId,
    });
    expect(result.success).toBe(true);
  });

  it("still refuses anything that is not UUID-shaped", () => {
    expect(
      deliverySchema.safeParse({
        id: "1234",
        storagePath: "project/delivery.png",
        mimeType: "image/png",
        fileSize: 1024,
      }).success,
    ).toBe(false);
  });

  it("still refuses an empty storage path and a zero file size", () => {
    const base = { id: generatedId, mimeType: "image/png" as const };
    expect(deliverySchema.safeParse({ ...base, storagePath: "", fileSize: 1024 }).success).toBe(
      false,
    );
    expect(
      deliverySchema.safeParse({ ...base, storagePath: "project/delivery.png", fileSize: 0 })
        .success,
    ).toBe(false);
  });
});

describe("what a refused preparation says", () => {
  it("names the cause and the next step when the session no longer resolves", () => {
    // The media service reports `Access denied.` for a token the auth server will not resolve, which
    // is what a viewer sees after their session is revoked while the rest of the workspace still
    // renders normally.
    expect(mediaErrorMessage(403, { error: "Access denied." })).toBe(
      "Your sign-in is no longer valid. Sign out, sign in again, and retry.",
    );
    expect(mediaErrorMessage(401, {})).toBe(
      "Your sign-in is no longer valid. Sign out, sign in again, and retry.",
    );
  });

  it("keeps a refusal that already explains itself", () => {
    expect(mediaErrorMessage(403, { error: "Agency access required." })).toBe(
      "Agency access required.",
    );
    expect(
      mediaErrorMessage(409, { error: "Approve all deliverables before adding final files." }),
    ).toBe("Approve all deliverables before adding final files.");
  });

  it("falls back when the service says nothing usable", () => {
    expect(mediaErrorMessage(500, "not json at all")).toBe(
      "The file could not be prepared. Please try again.",
    );
  });
});

describe("MediaRequestError", () => {
  it("carries the HTTP status a caller needs to classify the failure", () => {
    const error = new MediaRequestError(
      "Delivery supports PNG, JPEG, WebP and PDF files only.",
      415,
    );
    expect(error.status).toBe(415);
    expect(error.message).toBe("Delivery supports PNG, JPEG, WebP and PDF files only.");
  });
});

/** A session-only database double, since
 * `prepareProjectCover`/`clearProjectCover` never touch `.from(...)` or `.storage.from(...)`
 * themselves — the media service does that with its own service-role token. */
function stubSessionDatabase(token: string | null = "token-abc", userId = "user-1") {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: token ? { access_token: token, user: { id: userId } } : null },
    error: null,
  });
  return { database: { auth: { getSession } } as never, getSession };
}

const projectId = "project-1";

describe("prepareProjectCover", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses an unsupported file type before any network call", async () => {
    const { database } = stubSessionDatabase();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(4)], "cover.gif", { type: "image/gif" });
    await expect(
      prepareProjectCover(database, "http://media.test", projectId, file, false),
    ).rejects.toThrow(/PNG, JPG, or WebP/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a file over the project-covers bucket's 10 MB ceiling before any network call", async () => {
    const { database } = stubSessionDatabase();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(4)], "cover.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    await expect(
      prepareProjectCover(database, "http://media.test", projectId, file, false),
    ).rejects.toThrow(/no larger than 10 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the current visibility through as a query parameter, not the RPC's own false default", async () => {
    const { database } = stubSessionDatabase();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ path: "project-1/cover.png", clientVisible: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(4)], "cover.png", { type: "image/png" });
    const result = await prepareProjectCover(database, "http://media.test", projectId, file, true);
    expect(result).toEqual({ path: "project-1/cover.png", clientVisible: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://media.test/covers/prepare?projectId=project-1&visible=true");
    expect(options.headers.Authorization).toBe("Bearer token-abc");
    expect(options.headers["Content-Type"]).toBe("image/png");
  });
});

describe("clearProjectCover", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts to the project's clear route and resolves to whether a cover was actually removed", async () => {
    const { database } = stubSessionDatabase();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ cleared: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(clearProjectCover(database, "http://media.test", projectId)).resolves.toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://media.test/covers/clear?projectId=project-1");
    expect(options.headers.Authorization).toBe("Bearer token-abc");
  });

  it("resolves to false when the project already had no cover", async () => {
    const { database } = stubSessionDatabase();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cleared: false }) }),
    );
    await expect(clearProjectCover(database, "http://media.test", projectId)).resolves.toBe(false);
  });
});
