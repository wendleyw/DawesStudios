"use client";

import { useMutation } from "@tanstack/react-query";
import { ProjectPanelHeader } from "./project-panel";
import { Check, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  channel,
  versionId,
  heading,
  onClose,
  notice,
  context,
}: {
  projectId: string;
  channel: ProjectChannel;
  /** Scopes the panel to one round or client version's feedback. */
  versionId?: string;
  heading?: string;
  onClose?: () => void;
  /** A call to action shown under the heading, such as a client's pending review. */
  notice?: ReactNode;
  context?: ReactNode;
}) {
  const { database } = useAuth();
  const { formatDate } = useDateFormat();
  const comments = useProjectComments(projectId, channel, versionId);
  const invalidate = useInvalidateComments();
  const { draft, update, clear } = useCommentDraft(projectId, channel, versionId);
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
  const [showResolved, setShowResolved] = useState(false);
  const post = useMutation({
    mutationFn: async () => {
      const payload = JSON.stringify({ body: body.trim(), versionId });
      const attempt = nextCommentAttempt(draft.attempt, payload);
      update({ attempt });
      return postComment(database, {
        projectId,
        channel,
        body: body.trim(),
        versionId,
        idempotencyKey: attempt.key,
      });
    },
    onSuccess: async () => {
      // `clear()` resets the whole draft, attempt included, so the next comment starts fresh.
      clear();
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
    <aside
      className="comment-panel"
      aria-label={channel === "client" ? "Client conversation" : "Studio conversation"}
    >
      <ProjectPanelHeader
        title={heading ?? (versionId ? "Feedback" : "Conversation")}
        subtitle={channel === "client" ? "Shared with the studio" : "Studio team only"}
        onClose={onClose}
        actions={
          <label className="resolved-toggle">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(event) => setShowResolved(event.target.checked)}
            />
            Show resolved
          </label>
        }
      />
      {notice}
      <div className="comment-list" role="region" aria-label="Comment history" tabIndex={0}>
        {context}
        {comments.isPending ? (
          <p role="status">Loading conversation…</p>
        ) : comments.error ? (
          <div role="alert">
            <p>We couldn’t load the conversation.</p>
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
            <h3>A conversation starts here.</h3>
            <p>Keep decisions and next steps together.</p>
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
        <label className="visually-hidden" htmlFor={`comment-${versionId ?? "project"}`}>
          Your message
        </label>
        <textarea
          ref={composer}
          id={`comment-${versionId ?? "project"}`}
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
    </aside>
  );
}
