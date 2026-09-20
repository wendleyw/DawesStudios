"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import type { CreditEntry, CreditRequest } from "./credit-model";

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
