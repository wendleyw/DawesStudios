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
  return useQuery({
    queryKey: ["brand-sections", session?.user.id, clientId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(await database.from("brand_sections").select("*").eq("client_id", clientId)),
  });
}
export function useBrandAssets(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["brand-assets", session?.user.id, clientId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database.from("brand_assets").select("*").eq("client_id", clientId).order("name"),
      ),
  });
}
export function useBrandTemplates(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["brand-templates", session?.user.id, clientId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database.from("brand_templates").select("*").eq("client_id", clientId).order("name"),
      ),
  });
}
export function useTemplateDrafts(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["template-drafts", session?.user.id, clientId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("template_drafts")
          .select("*")
          .eq("client_id", clientId)
          .eq("owner_id", session!.user.id)
          .order("updated_at", { ascending: false }),
      ),
  });
}

const logoImageTypes = ["image/svg+xml", "image/png", "image/webp", "image/jpeg"];
/** Resolves the client's approved brand mark so the workspace can show the client's own logo. */
export function useClientLogo(clientId: string | undefined) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["client-logo", session?.user.id, clientId],
    enabled: !!session && !!clientId,
    retry: false,
    staleTime: 240_000,
    queryFn: async () => {
      const assets = assertResult(
        await database
          .from("brand_assets")
          .select("storage_path, mime_type")
          .eq("client_id", clientId!)
          .eq("category", "Logo")
          .order("name"),
      );
      const mark = logoImageTypes.flatMap((type) =>
        assets.filter((asset) => asset.storage_path && asset.mime_type === type),
      )[0];
      if (!mark?.storage_path) return null;
      return assertResult(
        await database.storage.from("brand-assets").createSignedUrl(mark.storage_path, 600),
      ).signedUrl;
    },
  });
}
