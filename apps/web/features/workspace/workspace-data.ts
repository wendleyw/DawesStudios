"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";

export type Client = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  initials: string;
  website: string;
  description: string;
  archived: boolean;
};
export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "internal_review"
  | "client_review"
  | "changes_requested"
  | "approved"
  | "delivered";
export type Project = {
  id: string;
  client_id: string;
  campaign_id: string | null;
  briefing_id: string | null;
  title: string;
  description: string;
  status: ProjectStatus;
  service_type: string;
  due_date: string | null;
  start_date: string | null;
  board_position: { x: number; y: number };
  created_at: string;
  updated_at: string;
};

export function useClients() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["clients", session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database.from("clients").select("*").eq("archived", false).order("name"),
      ) as Client[],
  });
}

export function useProjects(clientId?: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["projects", session?.user.id, clientId ?? "all"],
    enabled: !!session,
    queryFn: async () => {
      const query = database.from("projects").select("*").order("created_at", { ascending: false });
      return assertResult(await (clientId ? query.eq("client_id", clientId) : query)) as Project[];
    },
  });
}

export const statusLabels: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  internal_review: "Studio review",
  client_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  delivered: "Delivered",
};

export function formatDate(date: string | null) {
  if (!date) return "No due date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}
