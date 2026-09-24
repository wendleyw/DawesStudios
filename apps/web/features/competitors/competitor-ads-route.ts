import { createClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import {
  adLibraryCountries,
  adsArchiveUrl,
  metaErrorMessage,
  parseAdsArchive,
  type CompetitorAdsResult,
  type ResultCache,
} from "./meta-ad-library";

/**
 * Server side of `GET /api/competitors/[id]/ads`. The competitor is read as the caller, so
 * row-level security decides who may ask (a client never can), and only then is Meta queried with
 * the server's own token. Kept apart from the route file so it can be tested with its
 * dependencies replaced.
 */
export type CompetitorLookup =
  | { kind: "found"; competitor: { name: string; meta_page_id: string | null } }
  | { kind: "hidden" }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

export type CompetitorAdsDependencies = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  lookup: (token: string, competitorId: string) => Promise<CompetitorLookup>;
  cache: ResultCache<CompetitorAdsResult>;
  now: () => Date;
};

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 10_000;
const failure = (error: string, status: number) => Response.json({ error }, { status });

export async function competitorAdsResponse(
  request: Request,
  competitorId: string,
  deps: CompetitorAdsDependencies,
): Promise<Response> {
  if (!UUID.test(competitorId)) return failure("Select a valid competitor.", 400);
  const origin = deps.env.APP_ORIGIN ?? new URL(request.url).origin;
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin)
    return failure("This request must come from your workspace.", 403);
  const session = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!session) return failure("Sign in to see competitor ads.", 401);

  const found = await deps.lookup(session, competitorId);
  if (found.kind === "unauthenticated")
    return failure("Your session has expired. Sign in again.", 401);
  if (found.kind === "unavailable")
    return failure("Competitor ads are not configured. Contact the workspace administrator.", 503);
  if (found.kind === "hidden") return failure("This competitor is not available.", 404);

  const token = deps.env.META_AD_LIBRARY_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ status: "not_configured" } satisfies CompetitorAdsResult);

  const countries = adLibraryCountries(deps.env.META_AD_LIBRARY_COUNTRIES);
  const { name, meta_page_id: pageId } = found.competitor;
  const key = `${competitorId}:${pageId ?? name}:${countries.join(",")}`;
  const cached = deps.cache.get(key);
  if (cached) return Response.json(cached);

  let answer: Response;
  try {
    answer = await deps.fetch(adsArchiveUrl({ token, pageId, name, countries }), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      return failure("Meta did not answer in time. Try again.", 504);
    return failure("Meta could not return ads right now. Try again.", 502);
  }
  const body: unknown = await answer.json().catch(() => null);
  if (!answer.ok) return failure(metaErrorMessage(body), 502);
  const ads = parseAdsArchive(body);
  if (!ads) return failure("Meta could not return ads right now. Try again.", 502);
  const result: CompetitorAdsResult = { status: "ready", ads, fetchedAt: deps.now().toISOString() };
  deps.cache.set(key, result);
  return Response.json(result);
}

/** Reads a competitor with the caller's own session, so their row-level security applies. */
export function supabaseCompetitorLookup(
  env: Record<string, string | undefined>,
): CompetitorAdsDependencies["lookup"] {
  return async (token, competitorId) => {
    const url = env.SUPABASE_INTERNAL_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !publicKey) return { kind: "unavailable" };
    const caller = createClient<Database>(url, publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.auth.getUser(token);
    if (error || !data.user) return { kind: "unauthenticated" };
    const competitor = await caller
      .from("competitors")
      .select("name, meta_page_id")
      .eq("id", competitorId)
      .maybeSingle();
    if (competitor.error || !competitor.data) return { kind: "hidden" };
    return { kind: "found", competitor: competitor.data };
  };
}
