"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import type { RawDesignerVersion } from "./overview-model";

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
 * The only Supabase access this feature owns: the design versions and deliverable names of a
 * designer's active (non-delivered) projects — nothing on a delivered project still waits on the
 * designer or the studio, so its versions are never requested. Row-level security already limits
 * both reads to the designer's own assignments; the client Overview reuses the workspace, briefing,
 * credit and review hooks instead. Both reads page past PostgREST's row cap (`readAllRows` above).
 */
export function useDesignerVersions(projectIds: string[] | undefined) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["overview-designer-versions", session?.user.id, projectIds?.join(",") ?? ""],
    enabled: !!session && profile?.role === "designer" && !!projectIds,
    queryFn: async ({ signal }) => {
      if (!projectIds?.length) return { versions: [], deliverables: [] };
      const [versions, deliverables] = await Promise.all([
        readAllRows<RawDesignerVersion>((offset) =>
          database
            .from("design_versions")
            .select("id,project_id,deliverable_id,version_number,status,created_at")
            .in("project_id", projectIds)
            .order("created_at")
            .order("id")
            .range(offset, offset + 499)
            .abortSignal(signal),
        ),
        readAllRows<{ id: string; name: string }>((offset) =>
          database
            .from("deliverables")
            .select("id,name")
            .in("project_id", projectIds)
            .order("id")
            .range(offset, offset + 499)
            .abortSignal(signal),
        ),
      ]);
      return { versions, deliverables };
    },
    refetchInterval: 30_000,
  });
}
