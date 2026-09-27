"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import { decodeBriefing, type BrandSection, type Campaign } from "./briefing-model";
import type { Database } from "@database";

/**
 * The cache keys this feature's writes dirty, named one by one so each call site can invalidate
 * exactly its own subset instead of the union of all of them.
 *
 * There is no aggregate `useInvalidateBriefings()` helper, and adding one would be a behavior
 * change: no write dirties all three keys. Attachment upload and removal touch `attachments` only;
 * saving a draft and confirming or accepting a budget touch `briefings` only (plus keys other
 * features own, reached through those features' own helpers); and `brand` is dirtied only from
 * `brand/section-editor.tsx`, which never touches the other two. A helper covering the set would
 * make each of those call sites refetch caches it does not refetch today.
 *
 * `campaigns`, `credit-account`, `service-presets` and `briefing-project` are absent on purpose:
 * the first two are keys other features own and this file only reads (see `useCampaigns` and
 * `useCreditMonthSummaries` below), and no write here invalidates the last two.
 */
export const briefingQueryKeys = {
  /** `useBriefings` — the briefing list, which every briefing write changes. */
  briefings: "briefings",
  /** `useBriefingAttachments` — one briefing's attached files. */
  attachments: "briefing-attachments",
  /**
   * `useBriefingBrand` — the brand guidance the briefing editor shows alongside the form.
   *
   * This key lives here rather than in `brand/brand-data.ts` because `useBriefingBrand` is the only
   * hook that reads it: the key names this feature's cache entry, not brand's, even though the
   * `brand_sections` rows behind it are brand's to write. `brand/section-editor.tsx` is therefore
   * the one call site outside this feature that composes from this record.
   */
  brand: "briefing-brand",
} as const;

export type BriefingAttachment = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
};

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
    queryKey: [briefingQueryKeys.briefings, session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async () =>
      profile?.role === "designer"
        ? assertResult(await database.rpc("get_assigned_briefings", { p_client_id: clientId })).map(
            decodeBriefing,
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
          .select("id,title,description,start_date,end_date,updated_at")
          .eq("client_id", clientId)
          .order("title"),
      ) as Campaign[],
  });
}

export function useBriefingBrand(clientId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: [briefingQueryKeys.brand, session?.user.id, clientId],
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

/** The project created once a briefing is accepted, if acceptance has already happened. */
export function useBriefingProject(briefingId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["briefing-project", session?.user.id, briefingId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database.from("projects").select("id").eq("briefing_id", briefingId).maybeSingle(),
      ) as { id: string } | null,
  });
}

/**
 * Who asked for the briefing a project came from, for that project's details. Designers never read
 * it: the gate skips the query, and `briefings` admits only the studio and the client's own people.
 */
export function useBriefingRequester(briefingId: string | null) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: [briefingQueryKeys.briefings, "requester", session?.user.id, briefingId],
    enabled:
      !!session && !!briefingId && (profile?.role === "agency" || profile?.role === "client"),
    queryFn: async () =>
      (
        assertResult(
          await database
            .from("briefings")
            .select("requested_by")
            .eq("id", briefingId!)
            .maybeSingle(),
        ) as { requested_by: string | null } | null
      )?.requested_by ?? null,
  });
}

/** One row of `credit_month_summary`: a client's figures for one month. */
export type CreditMonthSummary =
  Database["public"]["Functions"]["credit_month_summary"]["Returns"][number];

/**
 * A client's figures for each of `months` (normally `openCreditMonths()`), read through the
 * read-only `credit_month_summary` procedure, one call per month, returned in the same order. The
 * agency uses it to show every month's available credits when choosing where a project is charged:
 * the Month select at acceptance here, and the Move and Settle dialogs in
 * `projects/project-details.tsx`.
 *
 * Keyed under `credit-account` (which `features/credits` owns), so every write that already
 * refreshes the client's balance — accepting a briefing, moving or settling a project — refreshes
 * these figures too, without a key of its own to remember.
 */
export function useCreditMonthSummaries(clientId: string, months: string[], enabled = true) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["credit-account", session?.user.id, clientId, "months", months],
    enabled: !!session && enabled && months.length > 0,
    // These figures decide where credits are charged, and another tab or studio member may have
    // changed them (an extra, a transfer), so every picker that opens reads them fresh.
    staleTime: 0,
    queryFn: async () =>
      Promise.all(
        months.map(async (month) => {
          const rows = assertResult(
            await database.rpc("credit_month_summary", { p_client_id: clientId, p_month: month }),
          ) as CreditMonthSummary[];
          if (!rows[0]) throw new Error(`No credit figures for ${month}.`);
          return rows[0];
        }),
      ),
  });
}

export function useBriefingAttachments(briefingId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: [briefingQueryKeys.attachments, session?.user.id, briefingId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("briefing_attachments")
          .select("id,name,storage_path,mime_type,file_size")
          .eq("briefing_id", briefingId)
          .order("created_at"),
      ) as BriefingAttachment[],
  });
}

/**
 * Confirms the agency's approved project budget.
 *
 * Budget acceptance is two backend calls: this one records the approved figure and its note, and
 * `acceptBriefing` below performs the atomic project-creation-plus-credit-debit transaction. Both
 * are relocated with their exact RPC name and argument object; neither call carried an
 * idempotency-key argument before this move; retry and correctness for `accept_briefing` are
 * enforced entirely inside that procedure (rejecting insufficient balance and repeat acceptance),
 * not by anything this function or its caller adds.
 */
export async function confirmBriefingBudget(
  database: SupabaseDatabase,
  input: { briefingId: string; credits: number; note: string },
) {
  assertResult(
    await database.rpc("confirm_briefing_budget", {
      p_briefing_id: input.briefingId,
      p_credits: input.credits,
      p_note: input.note,
    }),
  );
}

/**
 * Accepts a briefing, debiting `month` (a first-of-month date). The backend `accept_briefing`
 * procedure is what atomically creates one project and one debit of that month, rejects an
 * insufficient month balance or a month outside the open window, and stays idempotent under
 * retries — see the comment above `confirmBriefingBudget`. The detail page always passes the month
 * its Month select shows, which opens on the same default the procedure applies without one.
 */
export async function acceptBriefing(
  database: SupabaseDatabase,
  input: { briefingId: string; month: string },
) {
  return assertResult(
    await database.rpc("accept_briefing", {
      p_briefing_id: input.briefingId,
      p_month: input.month,
    }),
  ) as string;
}

/**
 * Saves a briefing revision, receiving the already-built RPC payload and the revision the form was
 * opened on. `briefingPayload` (in `briefing-model.ts`) still builds that payload, and the
 * component still owns the `p_expected_updated_at` compare-and-set guard; this function relocates
 * only the `database.rpc(...)` call and its `assertResult(...)`.
 */
export async function saveBriefingRevision(
  database: SupabaseDatabase,
  input: {
    payload: Database["public"]["Functions"]["save_briefing_revision"]["Args"];
    /** The `updated_at` the form was opened on: the guard that makes the save a compare-and-set. */
    expectedRevision?: string;
  },
) {
  return assertResult(
    await database.rpc("save_briefing_revision", {
      ...input.payload,
      ...(input.expectedRevision ? { p_expected_updated_at: input.expectedRevision } : {}),
    }),
  );
}

/**
 * Submits a saved draft to the studio. Briefing submission is free — this call carries no credit or
 * budget effect, unlike `confirmBriefingBudget`/`acceptBriefing` above.
 */
export async function submitBriefing(database: SupabaseDatabase, input: { briefingId: string }) {
  assertResult(await database.rpc("submit_briefing", { p_briefing_id: input.briefingId }));
}

/**
 * The studio changes who a briefing's work is for, for example after the requester leaves;
 * `set_briefing_requester` accepts only one of the client's active people.
 */
export async function setBriefingRequester(
  database: SupabaseDatabase,
  input: { briefingId: string; requestedBy: string },
) {
  assertResult(
    await database.rpc("set_briefing_requester", {
      p_briefing_id: input.briefingId,
      p_requested_by: input.requestedBy,
    }),
  );
}

export async function uploadBriefingAttachmentFile(
  database: SupabaseDatabase,
  input: { path: string; file: File },
) {
  assertResult(
    await database.storage
      .from("briefing-files")
      .upload(input.path, input.file, { contentType: input.file.type, upsert: false }),
  );
}

export async function addBriefingAttachment(
  database: SupabaseDatabase,
  input: {
    briefingId: string;
    name: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
  },
) {
  assertResult(
    await database.rpc("add_briefing_attachment", {
      p_briefing_id: input.briefingId,
      p_name: input.name,
      p_storage_path: input.storagePath,
      p_mime_type: input.mimeType,
      p_file_size: input.fileSize,
    }),
  );
}

export async function removeBriefingAttachmentFile(
  database: SupabaseDatabase,
  input: { path: string },
) {
  assertResult(await database.storage.from("briefing-files").remove([input.path]));
}

export async function removeBriefingAttachment(database: SupabaseDatabase, input: { id: string }) {
  return assertResult(
    await database.rpc("remove_briefing_attachment", { p_attachment_id: input.id }),
  ) as string;
}

/*
 * `findBriefingAttachmentByPath` and `downloadBriefingAttachmentFile` are plain functions rather
 * than `use<Thing>()` hooks, for the reason recorded above `findBrandAssetById` in
 * `features/brand/brand-data.ts`: both run from inside a mutation's `mutationFn`, where React does
 * not permit a hook at all — the "Reads that cannot be hooks" rule in
 * `docs/architecture/data-access.md`.
 *
 * `findBriefingAttachmentByPath` runs only in the upload mutation's catch branch, to decide whether
 * a retried upload's row already committed before the mutation decides whether to delete the file
 * it just uploaded. Unlike every write above, it does not return through `assertResult(...)`: the
 * calling code in `briefing-attachments.tsx` inspects `.error` and `.data` directly and, when the
 * select itself errors, silently falls through to rethrow the original upload error rather than the
 * select's — a deliberate pre-existing branch this relocation preserves rather than "corrects" to
 * the usual `assertResult` shape. See the feature `README.md`.
 *
 * `downloadBriefingAttachmentFile` runs inside the download mutation, which exists only to trigger a
 * browser save; no component ever puts the blob on screen.
 */

/** The raw select result for the attachment row already registered at this storage path. */
export async function findBriefingAttachmentByPath(
  database: SupabaseDatabase,
  input: { briefingId: string; path: string },
) {
  return await database
    .from("briefing_attachments")
    .select("id")
    .eq("briefing_id", input.briefingId)
    .eq("storage_path", input.path)
    .maybeSingle();
}

/** The raw file behind a stored briefing attachment, for a real authenticated download. */
export async function downloadBriefingAttachmentFile(
  database: SupabaseDatabase,
  input: { path: string },
) {
  return assertResult(await database.storage.from("briefing-files").download(input.path));
}
