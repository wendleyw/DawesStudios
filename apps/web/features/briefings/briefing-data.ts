"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import {
  decodeAssignedBriefing,
  decodeBriefing,
  type BrandSection,
  type Campaign,
} from "./briefing-model";
import type { Database } from "@database";

export function useServicePresets() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["service-presets", session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database.from("service_presets").select("*"),
      ) as Database["public"]["Tables"]["service_presets"]["Row"][],
  });
}

export function useBriefings(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["briefings", session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async () =>
      profile?.role === "designer"
        ? assertResult(await database.rpc("get_assigned_briefings", { p_client_id: clientId })).map(
            decodeAssignedBriefing,
          )
        : assertResult(
            await database
              .from("briefings")
              .select("*")
              .eq("client_id", clientId)
              .order("updated_at", { ascending: false }),
          ).map(decodeBriefing),
  });
}

export function useCampaigns(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["campaigns", session?.user.id, clientId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("campaigns")
          .select("id,title,description,start_date,end_date")
          .eq("client_id", clientId)
          .order("title"),
      ) as Campaign[],
  });
}

export function useBriefingBrand(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["briefing-brand", session?.user.id, clientId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("brand_sections")
          .select("section,content")
          .eq("client_id", clientId)
          .in("section", ["overview", "visual-style", "messaging"]),
      ) as BrandSection[],
  });
}
