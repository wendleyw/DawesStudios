import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  createCompetitor,
  deleteCompetitor,
  fetchCompetitorAds,
  updateCompetitor,
} from "./competitors-data";

const input = {
  name: "Rival Co",
  website: "https://rival.example",
  metaPageId: "123456789",
  googleAdvertiserId: null,
  tiktokAdvertiser: null,
};
const columns = {
  name: "Rival Co",
  website: "https://rival.example",
  meta_page_id: "123456789",
  google_advertiser_id: null,
  tiktok_advertiser: null,
};

function chain(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const insert = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const remove = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, update, delete: remove });
  return { from, insert, update, remove, eq, select, single };
}

describe("competitor writes", () => {
  it("adds a competitor to a client with the database's column names", async () => {
    const database = chain({ data: { id: "c1" }, error: null });
    expect(await createCompetitor(database as never, { clientId: "client-1", ...input })).toEqual({
      id: "c1",
    });
    expect(database.from).toHaveBeenCalledWith("competitors");
    expect(database.insert).toHaveBeenCalledWith({ client_id: "client-1", ...columns });
  });

  it("edits a competitor by id without moving it to another client", async () => {
    const database = chain({ data: { id: "c1" }, error: null });
    await updateCompetitor(database as never, { id: "c1", ...input });
    expect(database.update).toHaveBeenCalledWith(columns);
    expect(database.eq).toHaveBeenCalledWith("id", "c1");
  });

  it("removes a competitor and reports a removal the database refused", async () => {
    const database = chain({ data: { id: "c1" }, error: null });
    await deleteCompetitor(database as never, { id: "c1" });
    expect(database.remove).toHaveBeenCalled();
    expect(database.eq).toHaveBeenCalledWith("id", "c1");
    const refused = chain({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned" },
    });
    await expect(deleteCompetitor(refused as never, { id: "c1" })).rejects.toThrow();
  });
});

describe("fetchCompetitorAds", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server route with the session's bearer token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: "not_configured" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = { access_token: "session-token" } as Session;
    expect(await fetchCompetitorAds(session, "c1")).toEqual({ status: "not_configured" });
    expect(fetchMock).toHaveBeenCalledWith("/api/competitors/c1/ads", {
      headers: { Authorization: "Bearer session-token" },
    });
  });

  it("surfaces the route's own message when it refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 }),
      ),
    );
    await expect(fetchCompetitorAds({ access_token: "old" } as Session, "c1")).rejects.toThrow(
      "Your session has expired. Sign in again.",
    );
  });
});
