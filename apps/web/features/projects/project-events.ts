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
        ? ["internal_comments", "design_versions", "design_boards"]
        : profile.role === "client"
          ? ["client_comments", "published_versions", "publication_reviews"]
          : [
              "internal_comments",
              "client_comments",
              "published_versions",
              "publication_reviews",
              "design_versions",
              "design_boards",
            ];
    for (const table of tables)
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` },
        refresh,
      );
    // A dropped socket used to fail silently: no reconnect, no fallback and nothing on screen, so
    // the project simply stopped updating. Poll while the channel is down, and refresh once on
    // recovery to pick up whatever was missed.
    let polling: ReturnType<typeof setInterval> | undefined;
    const stopPolling = () => {
      if (polling) clearInterval(polling);
      polling = undefined;
    };
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        stopPolling();
        refresh();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (!polling) polling = setInterval(refresh, 15_000);
      }
    });
    return () => {
      stopPolling();
      void database.removeChannel(channel);
    };
  }, [database, session, profile, projectId, queryClient]);
}
