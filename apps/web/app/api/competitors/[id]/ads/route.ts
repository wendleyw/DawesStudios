import {
  competitorAdsResponse,
  supabaseCompetitorLookup,
} from "@/features/competitors/competitor-ads-route";
import {
  createResultCache,
  type CompetitorAdsResult,
} from "@/features/competitors/meta-ad-library";

// One cache per server process: repeated opens of a competitor within 30 minutes reuse Meta's answer.
const cache = createResultCache<CompetitorAdsResult>({ ttlMs: 30 * 60_000, max: 100 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return competitorAdsResponse(request, id, {
    env: process.env,
    fetch,
    lookup: supabaseCompetitorLookup(process.env),
    cache,
    now: () => new Date(),
  });
}
