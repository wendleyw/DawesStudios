"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import type { Competitor, CompetitorInput } from "./competitors-model";
import type { CompetitorAdsResult } from "./meta-ad-library";

/**
 * Supabase access for the competitors a client's studio team follows, and the server route that
 * previews their Meta ads. Row-level security returns nothing to a client, so these reads are also
 * disabled for one rather than sent and emptied.
 */
export const competitorQueryKeys = ["competitors", "competitor-ads"] as const;

export function useInvalidateCompetitors() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      competitorQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

const COMPETITOR_COLUMNS =
  "id, client_id, name, website, meta_page_id, google_advertiser_id, tiktok_advertiser";

export function useCompetitors(clientId: string, enabled = true) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["competitors", session?.user.id, clientId],
    enabled: enabled && !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("competitors")
          .select(COMPETITOR_COLUMNS)
          .eq("client_id", clientId)
          .order("name"),
      ) as Competitor[],
  });
}

function columns(input: CompetitorInput) {
  return {
    name: input.name,
    website: input.website,
    meta_page_id: input.metaPageId,
    google_advertiser_id: input.googleAdvertiserId,
    tiktok_advertiser: input.tiktokAdvertiser,
  };
}

export async function createCompetitor(
  database: SupabaseDatabase,
  input: { clientId: string } & CompetitorInput,
) {
  return assertResult<{ id: string }>(
    await database
      .from("competitors")
      .insert({ client_id: input.clientId, ...columns(input) })
      .select("id")
      .single(),
  );
}

export async function updateCompetitor(
  database: SupabaseDatabase,
  input: { id: string } & CompetitorInput,
) {
  return assertResult<{ id: string }>(
    await database
      .from("competitors")
      .update(columns(input))
      .eq("id", input.id)
      .select("id")
      .single(),
  );
}

/** Asks for the removed row back, so a removal row-level security refused fails loudly. */
export async function deleteCompetitor(database: SupabaseDatabase, input: { id: string }) {
  assertResult(
    await database.from("competitors").delete().eq("id", input.id).select("id").single(),
  );
}

export async function fetchCompetitorAds(
  session: Session,
  competitorId: string,
): Promise<CompetitorAdsResult> {
  const response = await fetch(`/api/competitors/${competitorId}/ads`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = (await response.json().catch(() => ({}))) as CompetitorAdsResult & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Competitor ads could not be loaded.");
  return body;
}

export function useCompetitorAds(competitorId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["competitor-ads", session?.user.id, competitorId],
    enabled: !!session,
    // The server caches Meta's answer for 30 minutes; the screen need not ask more often than 10.
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => fetchCompetitorAds(session!, competitorId),
  });
}
