"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import type { RawDesignerRound } from "./overview-model";

/**
 * One table, read in pages of 500 with a stable order — PostgREST returns at most `max_rows`
 * (`supabase/config.toml`) per request, so a portfolio past that cap would otherwise be silently
 * undercounted. Mirrors `features/credits/credit-data.ts`'s `useCreditLedger` paging loop.
 */
async function readAllRows<T>(
  page: (offset: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = assertResult(await page(offset)) as T[];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

/** Read current board requests, including the initial work before any round exists. */
export function useDesignerRounds(projectIds: string[] | undefined) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["overview-designer-rounds", session?.user.id, projectIds?.join(",") ?? ""],
    enabled: !!session && profile?.role === "designer" && !!projectIds,
    queryFn: async ({ signal }) => {
      if (!projectIds?.length) return { rounds: [], boards: [] };
      const [rounds, boards] = await Promise.all([
        readAllRows<RawDesignerRound>((offset) =>
          database
            .from("board_work_requests")
            .select(
              "id,project_id,board_id,sequence,kind,outcome,current,round_id,created_at,round:design_versions!board_work_requests_round_id_fkey(version_number,notes)",
            )
            .in("project_id", projectIds)
            .eq("current", true)
            .neq("outcome", "closed")
            .order("created_at")
            .order("id")
            .range(offset, offset + 499)
            .abortSignal(signal),
        ),
        readAllRows<{ id: string; name: string; project_id: string }>((offset) =>
          database
            .from("design_boards")
            .select("id,name,project_id")
            .eq("activity", "active")
            .in("project_id", projectIds)
            .order("id")
            .range(offset, offset + 499)
            .abortSignal(signal),
        ),
      ]);
      return { rounds, boards };
    },
    refetchInterval: 30_000,
  });
}
