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

/**
 * The only Supabase access this feature owns: the rounds and design board names of a designer's
 * active (non-delivered) projects — nothing on a delivered project still waits on the designer or
 * the studio, so its rounds are never requested. A round is a `design_versions` row with a
 * `board_id`; the one-parent check keeps every such row free of a deliverable, so filtering on
 * `board_id` also leaves out the legacy per-deliverable versions still stored until they are
 * deleted. Row-level security already limits both reads to the designer's own boards; the client
 * Overview reuses the workspace, briefing, credit and review hooks instead. Both reads page past
 * PostgREST's row cap (`readAllRows` above) and name their columns: the API grants no role
 * `design_versions.created_by`, so a `select("*")` there is refused (`design_boards` is read as
 * `id,name`, all it needs).
 */
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
            .from("design_versions")
            .select("id,project_id,board_id,version_number,status,created_at")
            .in("project_id", projectIds)
            .not("board_id", "is", null)
            .order("created_at")
            .order("id")
            .range(offset, offset + 499)
            .abortSignal(signal),
        ),
        readAllRows<{ id: string; name: string }>((offset) =>
          database
            .from("design_boards")
            .select("id,name")
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
