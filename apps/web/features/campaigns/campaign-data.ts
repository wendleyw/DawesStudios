"use client";

import { useQueryClient } from "@tanstack/react-query";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";

/**
 * `campaigns` has one component, `campaign-dialog.tsx`, and one write: creating a campaign for a
 * client. `settings/settings-data.ts` separately owns `saveCampaign` (used by
 * `settings/campaign-settings.tsx` to create or edit a campaign from the settings tab) and its own
 * `campaignQueryKeys` / `useInvalidateCampaigns`; this module does not import from it; the two
 * mutations invalidate the same `["campaigns"]` key, by coincidence of domain rather than shared
 * code, and each feature owns its own copy per the data-access contract's per-feature invalidation
 * rule.
 */
export const campaignQueryKeys = ["campaigns"] as const;

export function useInvalidateCampaigns() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      campaignQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export async function createCampaign(
  database: SupabaseDatabase,
  input: {
    clientId: string;
    title: string;
    description: string;
    startDate: string | null;
    endDate: string | null;
  },
) {
  return assertResult<{ id: string }>(
    await database
      .from("campaigns")
      .insert({
        client_id: input.clientId,
        title: input.title,
        description: input.description,
        start_date: input.startDate,
        end_date: input.endDate,
      })
      .select("id")
      .single(),
  );
}
