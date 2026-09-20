"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import type { Database } from "@database";

export type WorkspaceRecord = Pick<
  Database["public"]["Tables"]["workspace_settings"]["Row"],
  "studio_name" | "timezone" | "updated_at"
>;

export function useWorkspaceSettings() {
  const { database, session } = useAuth();
  return useQuery<WorkspaceRecord>({
    queryKey: ["workspace-settings", session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      assertResult<WorkspaceRecord>(
        await database
          .from("workspace_settings")
          .select("studio_name,timezone,updated_at")
          .eq("id", 1)
          .single(),
      ),
  });
}
