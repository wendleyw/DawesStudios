"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import {
  assertCreditResult,
  projectCostKinds,
  projectCreditsUsed,
  type CreditEntry,
  type CreditLedgerEntry,
  type CreditMonthSummary,
  type CreditPlan,
  type CreditRequest,
} from "./credit-model";

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

/**
 * The client's ledger, newest first, in bounded pages. With a `month` (`YYYY-MM-01`) it reads only
 * the entries that count against that credit month; without one, every month.
 */
export function useCreditLedger(clientId: string, month?: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-ledger", session?.user.id, clientId, ...(month ? ["month", month] : [])],
    enabled: !!session && profile?.role !== "designer",
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const entries: CreditLedgerEntry[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = database
          .from("credit_ledger")
          .select("id,client_id,project_id,amount,balance_after,kind,description,created_at,month")
          .eq("client_id", clientId);
        if (month) query = query.eq("month", month);
        const page = assertResult(
          await query
            .order("created_at", { ascending: false })
            .order("id")
            .range(offset, offset + 499)
            .abortSignal(signal),
        ) as CreditLedgerEntry[];
        entries.push(...page);
        if (page.length < 500) return entries;
      }
    },
  });
}

/**
 * One credit month's figures from `credit_month_summary`: available, allowance, extras, used,
 * transferred, expiring and the day it expires. A month that has not started yet shows its plan's
 * projected allowance. Keyed under `credit-account`, so every write that already refreshes the
 * balance (accepting a briefing, a settlement, an adjustment) refreshes the month too.
 */
export function useCreditMonthSummary(clientId: string, month: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-account", session?.user.id, clientId, "month", month],
    enabled: !!session && !!profile && profile.role !== "designer" && !!month,
    // Switching months keeps the previous figures on screen until the next ones arrive.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const rows = assertCreditResult(
        await database.rpc("credit_month_summary", { p_client_id: clientId, p_month: month }),
      ) as CreditMonthSummary[];
      return rows[0] ?? null;
    },
  });
}

/**
 * A client's figures for each of `months` (normally `writableCreditMonths(creditMonthOf(now))`),
 * read through the read-only `credit_month_summary` procedure, one call per month, returned in the
 * same order. The agency uses it to show every month's available credits when choosing where a
 * project is charged: the Month select at briefing acceptance (`briefings/briefing-detail.tsx`) and
 * the Move and Settle dialogs (`projects/project-details.tsx`).
 *
 * Keyed under `credit-account`, so every write that already refreshes the client's balance —
 * accepting a briefing, moving or settling a project — refreshes these figures too, without a key of
 * its own to remember.
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
          const rows = assertCreditResult(
            await database.rpc("credit_month_summary", { p_client_id: clientId, p_month: month }),
          ) as CreditMonthSummary[];
          if (!rows[0]) throw new Error(`No credit figures for ${month}.`);
          return rows[0];
        }),
      ),
  });
}

/** The client's monthly plans, oldest first. A client reads only the amount and start month. */
export function useCreditPlans(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-account", session?.user.id, clientId, "plans"],
    enabled: !!session && !!profile && profile.role !== "designer",
    queryFn: async () =>
      assertResult(
        await database
          .from("credit_plans")
          .select("monthly_credits,starts_on")
          .eq("client_id", clientId)
          .order("starts_on"),
      ) as CreditPlan[],
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
            .in("kind", projectCostKinds),
        ) as Pick<CreditEntry, "amount" | "kind">[],
      ),
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

/** Sets the client's monthly plan from a start month (the current month or a later one). */
export async function setCreditPlan(
  database: SupabaseDatabase,
  input: { clientId: string; monthlyCredits: number; startsOn: string },
) {
  assertCreditResult(
    await database.rpc("set_credit_plan", {
      p_client_id: input.clientId,
      p_monthly_credits: input.monthlyCredits,
      p_starts_on: input.startsOn,
    }),
  );
}

export async function addMonthExtra(
  database: SupabaseDatabase,
  input: {
    clientId: string;
    month: string;
    amount: number;
    reason: string;
    idempotencyKey: string;
  },
) {
  assertCreditResult(
    await database.rpc("add_month_extra", {
      p_client_id: input.clientId,
      p_month: input.month,
      p_amount: input.amount,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}

export async function transferMonthCredits(
  database: SupabaseDatabase,
  input: {
    clientId: string;
    fromMonth: string;
    toMonth: string;
    amount: number;
    reason: string;
    idempotencyKey: string;
  },
) {
  assertCreditResult(
    await database.rpc("transfer_month_credits", {
      p_client_id: input.clientId,
      p_from_month: input.fromMonth,
      p_to_month: input.toMonth,
      p_amount: input.amount,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}
