"use client";

import { useQuery } from "@tanstack/react-query";
import type { Database, Json } from "@database";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import type { EditableSectionId, TemplateContent } from "./brand-model";

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
export function useTemplateDraft(clientId: string, draftId: string) {
  const { database, session } = useAuth();
  return useQuery<TemplateDraft | null>({
    queryKey: ["template-draft", session?.user.id, clientId, draftId],
    enabled: !!session,
    queryFn: async () =>
      assertResult<TemplateDraft | null>(
        await database
          .from("template_drafts")
          .select("*")
          .eq("id", draftId)
          .eq("client_id", clientId)
          .eq("owner_id", session!.user.id)
          .maybeSingle(),
      ),
  });
}

/**
 * A short-lived signed URL for one brand asset's raster preview.
 *
 * `enabled` carries the caller's own mime-type check (only PNG/JPEG/WebP are ever previewed as an
 * image), so the query is never issued for an SVG, a PDF, or an asset with no stored file.
 */
export function useBrandAssetPreviewUrl(
  assetId: string,
  storagePath: string | null,
  enabled: boolean,
) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["brand-asset-preview", session?.user.id, assetId, storagePath],
    enabled: !!session && enabled,
    staleTime: 120_000,
    queryFn: async () =>
      assertResult(await database.storage.from("brand-assets").createSignedUrl(storagePath!, 300))
        .signedUrl,
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

/*
 * `findBrandAssetById` and `downloadBrandAssetFile` are plain functions rather than `use<Thing>()`
 * hooks. Both are called from inside a mutation's `mutationFn` or a dialog's own close handler in
 * `brand-assets.tsx`, where React does not permit a hook to be called at all — the `Reads that
 * cannot be hooks` rule in `docs/architecture/data-access.md`, also recorded in this feature's
 * `README.md`.
 *
 * `findBrandAssetById` runs on submit and on close to decide whether the asset row an upload is
 * retrying has already committed, so a retry never uploads a second row or deletes a file the
 * stored row now references. `downloadBrandAssetFile` runs inside the download mutation, which
 * exists only to trigger a browser save — no component ever puts the blob on screen.
 */

/** The brand asset row with this id, if the id has already committed. */
export async function findBrandAssetById(database: SupabaseDatabase, input: { id: string }) {
  return assertResult(
    await database.from("brand_assets").select("id").eq("id", input.id).maybeSingle(),
  );
}

/** The raw file behind a stored brand asset, for a real authenticated download. */
export async function downloadBrandAssetFile(database: SupabaseDatabase, input: { path: string }) {
  return assertResult(await database.storage.from("brand-assets").download(input.path));
}

export async function uploadBrandAssetFile(
  database: SupabaseDatabase,
  input: { path: string; file: File },
) {
  assertResult(
    await database.storage
      .from("brand-assets")
      .upload(input.path, input.file, { contentType: input.file.type, upsert: false }),
  );
}

export async function insertBrandAsset(
  database: SupabaseDatabase,
  input: {
    id: string;
    clientId: string;
    name: string;
    category: string;
    description: string;
    tags: string[];
    mimeType: string;
    storagePath: string;
  },
) {
  assertResult(
    await database
      .from("brand_assets")
      .insert({
        id: input.id,
        client_id: input.clientId,
        name: input.name,
        category: input.category,
        description: input.description,
        tags: input.tags,
        mime_type: input.mimeType,
        storage_path: input.storagePath,
      })
      .select("id")
      .single(),
  );
}

export async function removeBrandAssetFile(database: SupabaseDatabase, input: { path: string }) {
  assertResult(await database.storage.from("brand-assets").remove([input.path]));
}

export async function createTemplateDraft(
  database: SupabaseDatabase,
  input: { clientId: string; templateId: string; ownerId: string; name: string; content: Json },
) {
  return assertResult<{ id: string }>(
    await database
      .from("template_drafts")
      .insert({
        client_id: input.clientId,
        template_id: input.templateId,
        owner_id: input.ownerId,
        name: input.name,
        content: input.content,
      })
      .select("id")
      .single(),
  );
}

/** Saves a private template draft, refusing a save that would overwrite a concurrent edit. */
export async function updateTemplateDraft(
  database: SupabaseDatabase,
  input: {
    id: string;
    clientId: string;
    ownerId: string;
    /** The `updated_at` the form was opened on: the guard that makes the save a compare-and-set. */
    revision: string;
    name: string;
    content: TemplateContent;
  },
) {
  const result = await database
    .from("template_drafts")
    .update({ name: input.name, content: input.content, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("client_id", input.clientId)
    .eq("owner_id", input.ownerId)
    .eq("updated_at", input.revision)
    .select("updated_at")
    .maybeSingle();
  const row = assertResult(result);
  if (!row)
    throw new Error(
      "This draft changed elsewhere. Reopen it to review the latest version before saving.",
    );
  return row.updated_at;
}

export async function saveBrandSection(
  database: SupabaseDatabase,
  input: { clientId: string; section: EditableSectionId; content: Json },
) {
  assertResult(
    await database
      .from("brand_sections")
      .upsert(
        {
          client_id: input.clientId,
          section: input.section,
          content: input.content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id,section" },
      )
      .select("section")
      .single(),
  );
}
