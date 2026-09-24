import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/competitors/[id]/ads/route";
import { competitorAdsResponse, type CompetitorAdsDependencies } from "./competitor-ads-route";
import { createResultCache, type CompetitorAdsResult } from "./meta-ad-library";

const id = "0b6f4a8e-6c1d-4b8f-9a55-2f1f3c1d7e10";
const token = "meta-secret-token";
const metaAnswer = () =>
  Response.json({
    data: [
      {
        id: "111",
        page_name: "Rival Co",
        publisher_platforms: ["facebook", "instagram"],
        ad_creative_bodies: ["Autumn sale"],
        ad_delivery_start_time: "2026-09-03T07:00:00+0000",
        ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=111&access_token=${token}`,
      },
    ],
  });

function request(headers: Record<string, string> = { authorization: "Bearer session-token" }) {
  return new Request(`http://localhost:3003/api/competitors/${id}/ads`, { headers });
}

function deps(overrides: Partial<CompetitorAdsDependencies> = {}): CompetitorAdsDependencies {
  return {
    env: { META_AD_LIBRARY_ACCESS_TOKEN: token },
    fetch: vi.fn<typeof fetch>(async () => metaAnswer()),
    lookup: vi.fn<CompetitorAdsDependencies["lookup"]>(async () => ({
      kind: "found",
      competitor: { name: "Rival Co", meta_page_id: "123456789" },
    })),
    cache: createResultCache<CompetitorAdsResult>({ ttlMs: 60_000, max: 10 }),
    now: () => new Date("2026-09-24T06:00:00Z"),
    ...overrides,
  };
}

describe("competitorAdsResponse", () => {
  it("refuses an id that is not a UUID", async () => {
    expect((await competitorAdsResponse(request(), "not-an-id", deps())).status).toBe(400);
  });

  it("refuses a request from another origin", async () => {
    const response = await competitorAdsResponse(
      request({ authorization: "Bearer s", origin: "https://evil.example" }),
      id,
      deps({ env: { APP_ORIGIN: "http://localhost:3003", META_AD_LIBRARY_ACCESS_TOKEN: token } }),
    );
    expect(response.status).toBe(403);
  });

  it("asks for a session without a bearer token, and again when the session has expired", async () => {
    expect((await competitorAdsResponse(request({}), id, deps())).status).toBe(401);
    const response = await competitorAdsResponse(
      request(),
      id,
      deps({ lookup: vi.fn(async () => ({ kind: "unauthenticated" as const })) }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Your session has expired. Sign in again." });
  });

  it("answers 404 when row-level security hides the competitor, as it does from every client", async () => {
    const hidden = deps({ lookup: vi.fn(async () => ({ kind: "hidden" as const })) });
    const response = await competitorAdsResponse(request(), id, hidden);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "This competitor is not available." });
    expect(hidden.fetch).not.toHaveBeenCalled();
  });

  it("answers 503 when the server has no database configuration", async () => {
    const response = await competitorAdsResponse(
      request(),
      id,
      deps({ lookup: vi.fn(async () => ({ kind: "unavailable" as const })) }),
    );
    expect(response.status).toBe(503);
  });

  it("reports previews as off, without calling Meta, when the server has no token", async () => {
    const off = deps({ env: {} });
    const response = await competitorAdsResponse(request(), id, off);
    expect(await response.json()).toEqual({ status: "not_configured" });
    expect(off.fetch).not.toHaveBeenCalled();
  });

  it("returns the competitor's active ads and never the token or a snapshot URL", async () => {
    const ready = deps();
    const response = await competitorAdsResponse(request(), id, ready);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      status: "ready",
      fetchedAt: "2026-09-24T06:00:00.000Z",
      ads: [
        {
          id: "111",
          pageName: "Rival Co",
          platforms: ["Facebook", "Instagram"],
          body: "Autumn sale",
          title: null,
          description: null,
          caption: null,
          startedOn: "2026-09-03",
          libraryUrl: "https://www.facebook.com/ads/library/?id=111",
        },
      ],
    });
    expect(text).not.toContain(token);
    expect(text).not.toContain("render_ad");
    const url = new URL(String(vi.mocked(ready.fetch).mock.calls[0][0]));
    expect(url.searchParams.get("search_page_ids")).toBe("[123456789]");
    expect(url.searchParams.get("ad_reached_countries")).toBe('["ALL"]');
  });

  it("searches by name when the competitor has no page ID", async () => {
    const byName = deps({
      lookup: vi.fn(async () => ({
        kind: "found" as const,
        competitor: { name: "Rival Co", meta_page_id: null },
      })),
    });
    await competitorAdsResponse(request(), id, byName);
    const url = new URL(String(vi.mocked(byName.fetch).mock.calls[0][0]));
    expect(url.searchParams.get("search_terms")).toBe("Rival Co");
  });

  it("answers a repeat request from the cache", async () => {
    const cached = deps();
    await competitorAdsResponse(request(), id, cached);
    const second = await competitorAdsResponse(request(), id, cached);
    expect(second.status).toBe(200);
    expect(cached.fetch).toHaveBeenCalledTimes(1);
  });

  it("words Meta's refusal for the person and keeps the token out of it", async () => {
    const refused = deps({
      fetch: vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { message: `Invalid OAuth access token ${token}`, code: 190 } },
          { status: 400 },
        ),
      ),
    });
    const response = await competitorAdsResponse(request(), id, refused);
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toEqual({
      error: "The Meta Ad Library token has expired or was revoked. Renew it on the server.",
    });
    expect(text).not.toContain(token);
  });

  it("answers 504 when Meta does not answer in time", async () => {
    const slow = deps({
      fetch: vi.fn<typeof fetch>(async () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      }),
    });
    const response = await competitorAdsResponse(request(), id, slow);
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "Meta did not answer in time. Try again." });
  });

  it("answers 502 for an answer it cannot read, and caches nothing", async () => {
    const odd = deps({
      fetch: vi.fn<typeof fetch>(async () => Response.json({ unexpected: true })),
    });
    expect((await competitorAdsResponse(request(), id, odd)).status).toBe(502);
    expect((await competitorAdsResponse(request(), id, odd)).status).toBe(502);
    expect(odd.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/competitors/[id]/ads", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the competitor as the caller and asks Meta with the server's token", async () => {
    vi.stubEnv("SUPABASE_INTERNAL_URL", "https://database.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("META_AD_LIBRARY_ACCESS_TOKEN", token);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const outgoing = new Request(input, init);
        const url = new URL(outgoing.url);
        calls.push(`${url.host}${url.pathname}`);
        if (url.pathname === "/auth/v1/user")
          return Response.json({ id: "caller", email: "caller@example.test" });
        if (url.pathname === "/rest/v1/competitors") {
          expect(outgoing.headers.get("authorization")).toBe("Bearer caller-token");
          expect(url.searchParams.get("id")).toBe(`eq.${id}`);
          return Response.json([{ name: "Rival Co", meta_page_id: "123456789" }]);
        }
        if (url.host === "graph.facebook.com") return metaAnswer();
        throw new Error(`Unexpected request ${outgoing.url}`);
      }),
    );
    const response = await GET(
      new Request(`http://localhost:3003/api/competitors/${id}/ads`, {
        headers: { authorization: "Bearer caller-token" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ready");
    expect(calls).toEqual([
      "database.example.test/auth/v1/user",
      "database.example.test/rest/v1/competitors",
      "graph.facebook.com/v26.0/ads_archive",
    ]);
  });
});
