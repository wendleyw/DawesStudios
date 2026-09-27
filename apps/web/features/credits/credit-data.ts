"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import { projectCreditsUsed, type CreditEntry, type CreditRequest } from "./credit-model";

export function useCreditAccount(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-account", session?.user.id, clientId],
    enabled: !!session && profile?.role !== "designer",
    queryFn: async () =>
      assertResult(
        await database
          .from("credit_accounts")
          .select("balance,updated_at")
          .eq("client_id", clientId)
          .single(),
      ) as { balance: number; updated_at: string },
  });
}

export function useCreditLedger(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-ledger", session?.user.id, clientId],
    enabled: !!session && profile?.role !== "designer",
    queryFn: async ({ signal }) => {
      const entries: CreditEntry[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = assertResult(
          await database
            .from("credit_ledger")
            .select("id,client_id,project_id,amount,balance_after,kind,description,created_at")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false })
            .order("id")
            .range(offset, offset + 499)
            .abortSignal(signal),
        ) as CreditEntry[];
        entries.push(...page);
        if (page.length < 500) return entries;
      }
    },
  });
}

/**
 * The credits one project used, for its title card. Keyed under `credit-ledger`, so every write that
 * already refreshes the ledger (accepting a briefing, an adjustment) refreshes this too. It waits
 * for the profile, so a designer's page never sends the request at all.
 */
export function useProjectCreditUse(projectId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-ledger", session?.user.id, "project", projectId],
    enabled: !!session && !!profile && profile.role !== "designer",
    queryFn: async () =>
      projectCreditsUsed(
        assertResult(
          await database
            .from("credit_ledger")
            .select("amount,kind")
            .eq("project_id", projectId)
            .eq("kind", "project_debit"),
        ) as Pick<CreditEntry, "amount" | "kind">[],
      ),
  });
}

/**
 * The balance right after the client's most recent top-up, the "full" mark for the account menu's
 * ring. A top-up is any positive entry: the initial `allocation` or a positive `adjustment` (agency
 * allocations and fulfilled requests are both recorded as adjustments). Null when the client has
 * never received credits. Keyed under `credit-ledger`, so every write that refreshes the ledger
 * refreshes this too.
 */
export function useLatestTopUp(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-ledger", session?.user.id, clientId, "latest-top-up"],
    enabled: !!session && !!profile && profile.role !== "designer",
    queryFn: async () => {
      const rows = assertResult(
        await database
          .from("credit_ledger")
          .select("balance_after")
          .eq("client_id", clientId)
          .in("kind", ["allocation", "adjustment"])
          .gt("amount", 0)
          .order("created_at", { ascending: false })
          .limit(1),
      ) as Pick<CreditEntry, "balance_after">[];
      return rows[0]?.balance_after ?? null;
    },
  });
}

export function useCreditRequests(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-requests", session?.user.id, clientId],
    enabled: !!session && profile?.role !== "designer",
    queryFn: async () =>
      assertResult(
        await database
          .from("credit_requests")
          .select("id,client_id,amount,note,status,response_note,created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
      ) as CreditRequest[],
  });
}

// `briefings/briefing-detail.tsx`'s accept-briefing mutation invalidates `credit-account` and
// `credit-ledger` inline rather than through `useInvalidateCredits()` below: this set also covers
// `credit-requests`, a key accepting a briefing never touched before, so routing through it would
// widen that call site's invalidation. See the comment at that call site for the full reasoning.
export const creditQueryKeys = [
  "credit-account",
  "credit-ledger",
  "credit-requests",
  "notifications",
] as const;

export function useInvalidateCredits() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      creditQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export async function requestCredits(
  database: SupabaseDatabase,
  input: { clientId: string; amount: number; note: string; idempotencyKey: string },
) {
  assertResult(
    await database.rpc("request_credits", {
      p_client_id: input.clientId,
      p_amount: input.amount,
      p_note: input.note,
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}

export async function adjustCredits(
  database: SupabaseDatabase,
  input: { clientId: string; amount: number; description: string; idempotencyKey: string },
) {
  assertResult(
    await database.rpc("adjust_credits", {
      p_client_id: input.clientId,
      p_amount: input.amount,
      p_description: input.description,
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}

export async function reviewCreditRequest(
  database: SupabaseDatabase,
  input: { requestId: string; decision: "fulfill" | "reject"; note: string },
) {
  assertResult(
    await database.rpc(
      input.decision === "fulfill" ? "fulfill_credit_request" : "reject_credit_request",
      { p_request_id: input.requestId, p_note: input.note },
    ),
  );
}
