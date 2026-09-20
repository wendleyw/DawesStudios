"use client";

import { useQuery } from "@tanstack/react-query";
import type { Database } from "@database";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";

export type BrandSection = Database["public"]["Tables"]["brand_sections"]["Row"];
export type BrandAsset = Database["public"]["Tables"]["brand_assets"]["Row"];
export type BrandTemplate = Database["public"]["Tables"]["brand_templates"]["Row"];
export type TemplateDraft = Database["public"]["Tables"]["template_drafts"]["Row"];

export function useBrandSections(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({ queryKey: ["brand-sections", session?.user.id, clientId], enabled: !!session, queryFn: async () => assertResult(await database.from("brand_sections").select("*").eq("client_id", clientId)) });
}
export function useBrandAssets(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({ queryKey: ["brand-assets", session?.user.id, clientId], enabled: !!session, queryFn: async () => assertResult(await database.from("brand_assets").select("*").eq("client_id", clientId).order("name")) });
}
export function useBrandTemplates(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({ queryKey: ["brand-templates", session?.user.id, clientId], enabled: !!session, queryFn: async () => assertResult(await database.from("brand_templates").select("*").eq("client_id", clientId).order("name")) });
}
export function useTemplateDrafts(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({ queryKey: ["template-drafts", session?.user.id, clientId], enabled: !!session, queryFn: async () => assertResult(await database.from("template_drafts").select("*").eq("client_id", clientId).eq("owner_id", session!.user.id).order("updated_at", { ascending: false })) });
}
