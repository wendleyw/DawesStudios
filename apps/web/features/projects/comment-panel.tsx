"use client";

import { useMutation } from "@tanstack/react-query";
import { ProjectPanelHeader } from "./project-panel";
import { Check, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useDateFormat } from "@/features/workspace/workspace-data";
import {
  postComment,
  resolveComment,
  useInvalidateComments,
  useProjectComments,
  type ProjectChannel,
} from "./project-data";

import { useCommentDraft, type CommentAttempt } from "./comment-draft";
import { FormError } from "@/features/shared/form-error";

/**
 * Decides whether an attempt reuses its idempotency key or mints a fresh one.
 *
 * Kept as a plain function, exported and unit-tested on its own, rather than folded straight into
 * the mutation: the requirement it exists to satisfy — same payload replays the same key, a
 * changed payload (an edited comment) mints a new one — is exactly what a ref keyed on
 * the component's lifetime instead of on the payload would get silently wrong. Keying it wrong is
 * invisible in manual testing (nothing errors until a real retry happens against the server) and
 * only a test that inspects the returned key across two differing payloads can catch it.
 */
export function nextCommentAttempt(
  current: CommentAttempt | null,
  payload: string,
): CommentAttempt {
  if (current?.payload === payload) return current;
  return { payload, key: `comment:${crypto.randomUUID()}` };
}

export function CommentPanel({
  projectId,
  projectTitle,
  channel,
  currentVersion,
  versionLabels,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  channel: ProjectChannel;
  currentVersion?: { id: string; label: string };
  versionLabels: Record<string, string>;
  onClose?: () => void;
}) {
  const { profile } = useAuth();
  const [thisVersion, setThisVersion] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const target = thisVersion ? currentVersion : undefined;
  return (
    <aside
      className="comment-panel"
      aria-label={channel === "client" ? "Client comments" : "Studio comments"}
    >
      <ProjectPanelHeader
        title="Comments"
        subtitle={
          channel === "client"
            ? "Client and studio"
            : profile?.role === "designer"
              ? "You and the studio"
              : "Studio team only"
        }
        onClose={onClose}
      />
      <div className="comment-controls">
        <div className="comment-scopes" role="group" aria-label="Comment scope">
          <button type="button" aria-pressed={!target} onClick={() => setThisVersion(false)}>
            All activity
          </button>
          {currentVersion && (
            <button type="button" aria-pressed={!!target} onClick={() => setThisVersion(true)}>
              {channel === "internal" ? "This round" : "This version"}
            </button>
          )}
        </div>
        <label className="resolved-toggle">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved
        </label>
      </div>
      <CommentThread
        key={target?.id ?? "project"}
        projectId={projectId}
        channel={channel}
        versionId={target?.id}
        destination={target ? `${projectTitle} [${target.label}]` : projectTitle}
        versionLabels={versionLabels}
        showResolved={showResolved}
      />
    </aside>
  );
}

/** Remounting a thread keeps in-flight writes bound to their original draft and destination. */
function CommentThread({
  projectId,
  channel,
  versionId,
  destination,
  versionLabels,
  showResolved,
}: {
  projectId: string;
  channel: ProjectChannel;
  versionId?: string;
  destination: string;
  versionLabels: Record<string, string>;
  showResolved: boolean;
}) {
  const { database } = useAuth();
  const { formatDate } = useDateFormat();
  const comments = useProjectComments(projectId, channel, versionId);
  const invalidate = useInvalidateComments();
  const { draft, update, clearIfCurrent } = useCommentDraft(projectId, channel, versionId);
  const body = draft.body;
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = "60px";
    field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
  }, [body]);
  // Keyed on the attempt's payload, and stored on the draft rather than in a ref: a retry of the
  // same comment must resend the same key (matching the server's replay), but a person editing the
  // text between retries has to mint a new one, or `post_comment` raises a conflict it
  // cannot recover from. The draft outlives this component, so a retry after the dialog is closed
  // and reopened still replays instead of writing a second comment — a ref would mint a fresh key
  // there and duplicate exactly the write this guard exists to deduplicate.
  // `credits/credit-actions.tsx` keeps the same shape in a ref and has the same remount gap; its
  // dialog is not reopened against a surviving draft, so the gap is unreachable there today.
  //
  // The payload identity below must include every field `post_comment`'s replay guard compares
  // (`supabase/migrations/202609270007_retire_versions_schema.sql`: version_id/publication_id and
  // body) — a field the server compares but the client's identity omits can vary underneath an
  // unchanged key, and the retry either replays against the wrong content or gets an
  // unrecoverable "Idempotency key conflicts" error the person cannot act on. If the server
  // starts comparing another field, mirror it here too.
  const post = useMutation({
    mutationFn: async () => {
      const submittedBody = body.trim();
      const payload = JSON.stringify({ body: submittedBody, versionId });
      const attempt = nextCommentAttempt(draft.attempt, payload);
      update({ attempt });
      await postComment(database, {
        projectId,
        channel,
        body: submittedBody,
        versionId,
        idempotencyKey: attempt.key,
      });
      return { submittedBody, attemptKey: attempt.key };
    },
    onSuccess: async ({ submittedBody, attemptKey }) => {
      // A follow-up typed during the request, including after remount, must survive its response.
      clearIfCurrent(submittedBody, attemptKey);
      await invalidate();
    },
  });
  const resolve = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) =>
      resolveComment(database, { commentId: id, channel, resolved }),
    onSuccess: invalidate,
  });
  const visibleComments =
    comments.data?.filter((comment) => showResolved || !comment.resolved) ?? [];

  return (
    <>
      <div className="comment-list" role="region" aria-label="Comment history" tabIndex={0}>
        {comments.isPending ? (
          <p role="status">Loading comments…</p>
        ) : comments.error ? (
          <div role="alert">
            <p>We couldn’t load the comments.</p>
            <button className="button quiet" onClick={() => void comments.refetch()}>
              Try again
            </button>
          </div>
        ) : visibleComments.length ? (
          visibleComments.map((comment) => (
            <article
              data-comment-id={comment.id}
              key={comment.id}
              className={`comment${comment.resolved ? " resolved" : ""}`}
            >
              <div className="comment-author">
                <span className="comment-avatar">{comment.label[0]}</span>
                <strong>{comment.label}</strong>
                <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
              </div>
              <span className="comment-scope-label">
                {comment.versionId
                  ? (versionLabels[comment.versionId] ??
                    (channel === "internal" ? "Round" : "Version"))
                  : "Project"}
              </span>
              <p>{comment.body}</p>
              <button
                className="comment-resolve"
                onClick={() => resolve.mutate({ id: comment.id, resolved: !comment.resolved })}
                disabled={resolve.isPending}
              >
                <Check size={12} />
                {comment.resolved ? "Reopen" : "Resolve"}
              </button>
            </article>
          ))
        ) : (
          <div className="empty-state comment-empty">
            <MessageSquare size={25} />
            <h3>No comments yet.</h3>
            <p>
              {versionId
                ? `Start the discussion for ${destination}.`
                : "Keep project notes and next steps together."}
            </p>
          </div>
        )}
      </div>
      <form
        className="comment-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) post.mutate();
        }}
      >
        <p className="comment-destination" id={`comment-destination-${versionId ?? "project"}`}>
          Posting to <strong>{destination}</strong>
        </p>
        <label className="visually-hidden" htmlFor={`comment-${versionId ?? "project"}`}>
          Your message
        </label>
        <textarea
          ref={composer}
          id={`comment-${versionId ?? "project"}`}
          aria-describedby={`comment-destination-${versionId ?? "project"}`}
          value={body}
          onChange={(event) => update({ body: event.target.value })}
          placeholder="Leave a thoughtful note…"
          maxLength={10000}
          rows={2}
          required
        />
        <button
          className="icon-button send-comment"
          type="submit"
          disabled={post.isPending || !body.trim()}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
        {(post.error || resolve.error) && (
          <FormError>{(post.error || resolve.error)?.message}</FormError>
        )}
      </form>
    </>
  );
}
