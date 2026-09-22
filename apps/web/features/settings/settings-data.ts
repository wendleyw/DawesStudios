"use client";

import { useQueryClient } from "@tanstack/react-query";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";

/**
 * Supabase access for every settings screen except Team, which moved to
 * `features/team/team-data.ts`: clients, campaigns, presets, workspace and account. Unlike
 * `credit-data.ts` and `project-data.ts`, these five domains are independent tabs that never share a
 * page and never want each other's cache invalidated by their own mutations — so this module exports
 * one `<domain>QueryKeys` / `useInvalidate<Domain>()` pair per domain instead of one shared set for
 * the whole feature. A single feature-wide set, invalidated by every mutation, would refetch the
 * Preset list every time a Client is renamed; every domain here already invalidated exactly its own
 * key before this migration, and splitting the pair by domain is what keeps that unchanged. See
 * `README.md` for the full reasoning.
 *
 * Functions are grouped below in that same domain order. Each group holds its read hook(s), its
 * query keys and invalidation hook, and its write function(s), in the order the components that
 * call them appear in the file table in `README.md`.
 */

// ---------------------------------------------------------------------------------------------
// Clients: creating and editing a client workspace (`client-settings.tsx`). `useClients` itself is
// not here: it is read by `team/team-page.tsx` and the workspace shell as well, and already lives in
// `features/workspace/workspace-data.ts` as their shared read hook. This module owns only the write,
// because `client-settings.tsx` is the sole component that issues it.
// ---------------------------------------------------------------------------------------------

export const clientQueryKeys = ["clients"] as const;

export function useInvalidateClients() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      clientQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/**
 * Saves a client's own details, or creates a new client with its opening credit ledger entry.
 *
 * The two branches were an `if (client) ... else ...` in `ClientEditor`'s mutation before this
 * migration; they are kept as one function with a discriminated `mode` rather than split into two,
 * because that mirrors the single mutation call site exactly and neither branch is ever called
 * without validating the other's absence first.
 */
export async function saveClient(
  database: SupabaseDatabase,
  input:
    | {
        mode: "update";
        id: string;
        /**
         * The `updated_at` the form was opened on, which turns the save into a compare-and-set.
         * Optional only because a caller without an opened form has no revision to quote; every
         * editor in the product passes one, and a save without it is last-write-wins as before.
         */
        revision?: string;
        name: string;
        industry: string;
        website: string;
        description: string;
      }
    | { mode: "create"; name: string; slug: string; industry: string; initialCredits: number },
) {
  if (input.mode === "update") {
    const update = database
      .from("clients")
      .update({
        name: input.name,
        industry: input.industry,
        website: input.website,
        description: input.description,
      })
      .eq("id", input.id);
    const result = await (input.revision ? update.eq("updated_at", input.revision) : update)
      .select("id")
      .single();
    // Same reading as `updateProjectDetails`: only the revision filter can turn a live client row
    // into a no-rows result, so that result is the conflict and the sentence belongs here.
    if (result.error?.code === "PGRST116")
      throw new Error(
        "This client changed while you were editing. Close and reopen the client to try again.",
      );
    assertResult(result);
    return;
  }
  assertResult(
    await database.rpc("create_client", {
      p_name: input.name,
      p_slug: input.slug,
      p_industry: input.industry,
      p_initial_credits: input.initialCredits,
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Campaigns: a client's campaigns (`campaign-settings.tsx`). `useCampaigns` is read from
// `features/briefings/briefing-data.ts`, which already owns it for the briefing flow; this module
// owns only the write `campaign-settings.tsx` issues.
// ---------------------------------------------------------------------------------------------

export const campaignQueryKeys = ["campaigns"] as const;

export function useInvalidateCampaigns() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      campaignQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

type CampaignFields = {
  clientId: string;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
};

/** Saves an edited campaign, or creates a new one for the client. Same shape as `saveClient` above. */
export async function saveCampaign(
  database: SupabaseDatabase,
  input: (
    | { mode: "update"; id: string; /** As `saveClient`'s `revision`. */ revision?: string }
    | { mode: "create" }
  ) &
    CampaignFields,
) {
  const payload = {
    title: input.title,
    description: input.description,
    start_date: input.startDate,
    end_date: input.endDate,
  };
  if (input.mode === "update") {
    const update = database
      .from("campaigns")
      .update(payload)
      .eq("id", input.id)
      .eq("client_id", input.clientId);
    const result = await (input.revision ? update.eq("updated_at", input.revision) : update)
      .select("id")
      .single();
    if (result.error?.code === "PGRST116")
      throw new Error(
        "This campaign changed while you were editing. Close and reopen the campaign to try again.",
      );
    assertResult(result);
    return;
  }
  assertResult(
    await database
      .from("campaigns")
      .insert({ ...payload, client_id: input.clientId })
      .select("id")
      .single(),
  );
}

// ---------------------------------------------------------------------------------------------
// Presets: service-preset revisions (`preset-settings.tsx`). `useServicePresets` is read from
// `features/briefings/briefing-data.ts`, which already owns it for the briefing flow; this module
// owns only the write `preset-settings.tsx` issues.
// ---------------------------------------------------------------------------------------------

export const presetQueryKeys = ["service-presets"] as const;

export function useInvalidatePresets() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      presetQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/**
 * Saves a preset as a new revision. `expectedRevision` is the revision the editor was opened on;
 * the procedure refuses the save when the stored one has moved, and raises the sentence itself so
 * there is one copy of it. Required: the procedure's own compare-and-set now refuses a save that
 * quotes no revision exactly as it refuses a stale one, so a caller with none to quote has nothing
 * useful to send.
 */
export async function saveServicePreset(
  database: SupabaseDatabase,
  input: {
    serviceType: string;
    minCredits: number;
    maxCredits: number;
    dueDays: number;
    expectedRevision: number;
  },
) {
  return assertResult(
    await database.rpc("save_service_preset", {
      p_service_type: input.serviceType,
      p_min_credits: input.minCredits,
      p_max_credits: input.maxCredits,
      p_due_days: input.dueDays,
      p_expected_revision: input.expectedRevision,
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Workspace: the singleton studio name and timezone (`workspace-settings.tsx`). The read hook is
// `useWorkspaceSettings` in `features/workspace/workspace-settings.ts`, kept there (per that
// module's own comment) so the application shell and notifications can read it without depending on
// this feature. This module owns only the write.
// ---------------------------------------------------------------------------------------------

// Named `useInvalidateWorkspaceSettings()` rather than `useInvalidateWorkspace()`: this module's
// domain is the workspace-*settings* screen, while `features/workspace/workspace-data.ts` exports
// its own, unrelated `useInvalidateWorkspace()` covering the `projects` key. The two used to share a
// name despite dirtying disjoint caches; this one was renamed so the pairing is unambiguous.
export const workspaceSettingsQueryKeys = ["workspace-settings"] as const;

export function useInvalidateWorkspaceSettings() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      workspaceSettingsQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/**
 * `revision` is the `updated_at` the form was read on; the procedure raises its own refusal and
 * returns the revision the save produced, which the studio form adopts for its next save.
 * Required: the procedure's own compare-and-set now refuses a save that quotes no revision exactly
 * as it refuses a stale one, so a caller with none to quote has nothing useful to send.
 */
export async function saveWorkspaceSettings(
  database: SupabaseDatabase,
  input: { studioName: string; timezone: string; revision: string },
) {
  return assertResult(
    await database.rpc("update_workspace_settings", {
      p_studio_name: input.studioName,
      p_timezone: input.timezone,
      p_expected_updated_at: input.revision,
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Account: the caller's own profile (`account-settings.tsx`) and invitation acceptance
// (`invitation-acceptance.tsx`). Both write to a signed-in caller's own row, which is why they share
// a domain despite living in different components.
// ---------------------------------------------------------------------------------------------

export const accountQueryKeys = ["profile"] as const;

export function useInvalidateAccount() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      accountQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export async function updateProfile(
  database: SupabaseDatabase,
  input: { userId: string; displayName: string },
) {
  assertResult(
    await database
      .from("profiles")
      .update({ display_name: input.displayName })
      .eq("id", input.userId)
      .select("id")
      .single(),
  );
}

/**
 * Accepts an invitation by its opaque token.
 *
 * Extracted alone, not alongside the `database.auth.updateUser({ password })` call it follows in
 * `invitation-acceptance.tsx`'s mutation: that call is Supabase Auth, not a `.from(`/`.rpc(`/
 * `.storage.` query, so it is outside this module's contract and stays in the component. Only the
 * `accept_invitation` RPC and its `assertResult(...)` move here.
 */
export async function acceptInvitation(database: SupabaseDatabase, input: { token: string }) {
  assertResult(await database.rpc("accept_invitation", { p_token: input.token }));
}
