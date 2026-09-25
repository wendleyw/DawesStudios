"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import type { RawDesignerVersion } from "./overview-model";

/**
 * The only Supabase access this feature owns: the design versions and deliverable names of a
 * designer's projects. Row-level security already limits both to their assignments; the client
 * Overview reuses the workspace, briefing, credit and review hooks instead.
 */
export function useDesignerVersions(projectIds: string[] | undefined) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["overview-designer-versions", session?.user.id, projectIds?.join(",") ?? ""],
    enabled: !!session && profile?.role === "designer" && !!projectIds,
    queryFn: async () => {
      if (!projectIds?.length) return { versions: [], deliverables: [] };
      const [versions, deliverables] = await Promise.all([
        database
          .from("design_versions")
          .select("id,project_id,deliverable_id,version_number,status,created_at")
          .in("project_id", projectIds),
        database.from("deliverables").select("id,name").in("project_id", projectIds),
      ]);
      return {
        versions: assertResult(versions) as RawDesignerVersion[],
        deliverables: assertResult(deliverables),
      };
    },
    refetchInterval: 30_000,
  });
}
