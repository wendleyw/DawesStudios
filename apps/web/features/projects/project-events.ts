"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";

export function useProjectEvents(projectId: string) {
  const { database, session, profile } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!session || !profile) return;
    const channel = database.channel(`project:${session.user.id}:${projectId}`);
    const refresh = () => {
      for (const key of ["project-detail", "projects", "comments", "reviews", "assets"])
        void queryClient.invalidateQueries({ queryKey: [key] });
    };
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "projects", filter: `id=eq.${projectId}` },
      refresh,
    );
    const tables =
      profile.role === "designer"
        ? ["internal_comments"]
        : profile.role === "client"
          ? ["client_comments", "published_versions", "publication_reviews"]
          : ["internal_comments", "client_comments", "published_versions", "publication_reviews"];
    for (const table of tables)
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` },
        refresh,
      );
    channel.subscribe();
    return () => {
      void database.removeChannel(channel);
    };
  }, [database, session, profile, projectId, queryClient]);
}
