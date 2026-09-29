"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { setCampaignCollapsed, useCollapsedCampaigns } from "./board-data";

/**
 * Which Canvas campaign frames the viewer folded, saved per viewer and client. A toggle updates
 * the cached list at once and sends one fold/unfold to the database; a failed save restores the
 * previous list and leaves the error for the page to report.
 */
export function useBoardCollapsedCampaigns(clientId: string) {
  const { database, session } = useAuth();
  const queryClient = useQueryClient();
  const stored = useCollapsedCampaigns(clientId);
  const queryKey = ["board-collapsed-campaigns", session?.user.id, clientId];
  const save = useMutation({
    mutationFn: (input: { campaignId: string; collapsed: boolean }) =>
      setCampaignCollapsed(database, { clientId, ...input }),
    onMutate: async ({ campaignId, collapsed }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey);
      queryClient.setQueryData<string[]>(queryKey, (current = []) =>
        collapsed
          ? [...current.filter((id) => id !== campaignId), campaignId]
          : current.filter((id) => id !== campaignId),
      );
      return { previous };
    },
    onError: (_error, _input, context) => queryClient.setQueryData(queryKey, context?.previous),
    onSuccess: (keys) => queryClient.setQueryData(queryKey, keys),
  });
  const collapsed = useMemo(() => new Set(stored.data ?? []), [stored.data]);
  return {
    collapsed,
    toggle: (campaignId: string) =>
      save.mutate({ campaignId, collapsed: !collapsed.has(campaignId) }),
    saveError: save.error,
  };
}
