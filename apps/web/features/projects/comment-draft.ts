"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import type { ProjectChannel } from "./project-data";

/**
 * The idempotency key an in-flight comment is retrying under, paired with the payload it was
 * minted for. It lives with the draft rather than in the panel's own ref because the panel
 * unmounts: someone whose write fails, closes the dialog and reopens it to retry must resend the
 * same key, or a write that committed server-side before the error becomes a second comment. The
 * draft survives that remount, this rides with it, and both are cleared together on success — so
 * a genuinely new comment with identical text still mints a fresh key and still posts.
 */
export type CommentAttempt = { payload: string; key: string };
type CommentDraft = { body: string; attempt: CommentAttempt | null };
const emptyDraft: CommentDraft = { body: "", attempt: null };

export function useCommentDraft(projectId: string, channel: ProjectChannel, versionId?: string) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = [
    "comment-draft",
    session?.user.id,
    projectId,
    channel,
    versionId ? `version:${versionId}` : "project",
  ];
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
