"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import type { ProjectChannel } from "./project-data";

export type PendingPin = { x: number; y: number };
type CommentDraft = { body: string; pin: PendingPin | null };
const emptyDraft: CommentDraft = { body: "", pin: null };

export function useCommentDraft(projectId: string, channel: ProjectChannel, designId?: string) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = ["comment-draft", session?.user.id, projectId, channel, designId ?? "project"];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => emptyDraft,
    initialData: emptyDraft,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  function update(patch: Partial<CommentDraft>) {
    queryClient.setQueryData<CommentDraft>(key, (draft) => ({
      ...(draft ?? emptyDraft),
      ...patch,
    }));
  }
  return { draft: data, update, clear: () => queryClient.setQueryData(key, emptyDraft) };
}
