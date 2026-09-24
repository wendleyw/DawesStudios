"use client";

import { useMutation } from "@tanstack/react-query";
import { ProjectPanelHeader } from "./project-panel";
import { Check, MapPin, MessageSquare, Send, X } from "lucide-react";
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

import { useCommentDraft, type CommentAttempt, type PendingPin } from "./comment-draft";
import { formatTimecode } from "./video-pins";
import { FormError } from "@/features/shared/form-error";

/**
 * Decides whether an attempt reuses its idempotency key or mints a fresh one.
 *
 * Kept as a plain function, exported and unit-tested on its own, rather than folded straight into
 * the mutation: the requirement it exists to satisfy — same payload replays the same key, a
 * changed payload (an edited comment, a moved pin) mints a new one — is exactly what a ref keyed on
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
  designId,
  pendingPin,
  onClearPin,
  selectedComment,
  onSelectComment,
  heading,
  onClose,
  notice,
  context,
}: {
  projectId: string;
  channel: ProjectChannel;
  versionId?: string;
  designId?: string;
  pendingPin?: PendingPin | null;
  onClearPin?: () => void;
  selectedComment?: string | null;
  onSelectComment?: (id: string) => void;
  heading?: string;
  onClose?: () => void;
  /** A call to action shown under the heading, such as a client's pending review. */
  notice?: ReactNode;
  context?: ReactNode;
}) {
  const { database } = useAuth();
  const { formatDate } = useDateFormat();
  const comments = useProjectComments(projectId, channel, designId, versionId);
  const invalidate = useInvalidateComments();
  const { draft, update, clear } = useCommentDraft(projectId, channel, designId, versionId);
  const body = draft.body;
  const panel = useRef<HTMLElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = "60px";
    field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
  }, [body]);
  // Keyed on the attempt's payload, and stored on the draft rather than in a ref: a retry of the
  // same comment must resend the same key (matching the server's replay), but a person editing the
  // text or pin between retries has to mint a new one, or `post_comment` raises a conflict it
  // cannot recover from. The draft outlives this component, so a retry after the dialog is closed
  // and reopened still replays instead of writing a second comment — a ref would mint a fresh key
  // there and duplicate exactly the write this guard exists to deduplicate.
  // `credits/credit-actions.tsx` keeps the same shape in a ref and has the same remount gap; its
  // dialog is not reopened against a surviving draft, so the gap is unreachable there today.
  //
  // The payload identity below must include every field `post_comment`'s replay guard compares
  // (`supabase/migrations/202609210002_post_comment_replay_hardening.sql`: version_id/
  // publication_id, design_id, body, pin_x, pin_y, pin_t) — a field the server compares but the
  // client's identity omits can vary underneath an unchanged key, and the retry either replays
  // against the wrong content or gets an unrecoverable "Idempotency key conflicts" error the
  // person cannot act on. If the server starts comparing another field, mirror it here too.
  useEffect(() => {
    if (selectedComment)
      panel.current
        ?.querySelector(`[data-comment-id="${CSS.escape(selectedComment)}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [selectedComment]);
  const [showResolved, setShowResolved] = useState(false);
  const post = useMutation({
    mutationFn: async () => {
      const payload = JSON.stringify({ body: body.trim(), versionId, designId, pin: pendingPin });
      const attempt = nextCommentAttempt(draft.attempt, payload);
      update({ attempt });
      return postComment(database, {
        projectId,
        channel,
        body: body.trim(),
        versionId,
        designId,
        pin: pendingPin,
        idempotencyKey: attempt.key,
      });
    },
    onSuccess: async () => {
      // `clear()` resets the whole draft, attempt included, so the next comment starts fresh.
      clear();
      onClearPin?.();
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
      ref={panel}
      className="comment-panel"
      aria-label={channel === "client" ? "Client conversation" : "Studio conversation"}
    >
      <ProjectPanelHeader
        title={heading ?? (designId || versionId ? "Feedback" : "Conversation")}
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
              className={`comment ${selectedComment === comment.id ? "selected" : ""} ${comment.resolved ? "resolved" : ""}`}
            >
              <div className="comment-author">
                <span className="comment-avatar">{comment.label[0]}</span>
                <strong>{comment.label}</strong>
                {comment.pinX !== null && (
                  <button
                    className="comment-pin-link"
                    // On a video this both highlights the pin and seeks the player to the moment it
                    // marks; `design-viewer.tsx` owns the seek, because it owns the element. The
                    // label carries the timecode for the same reason the marker's `aria-label` does:
                    // "Pin 3" says nothing about *when*, which on a video is the only thing that
                    // locates it.
                    onClick={() => onSelectComment?.(comment.id)}
                  >
                    <MapPin size={12} />
                    {comment.resolved
                      ? "Resolved pin"
                      : `Pin ${(comments.data?.filter((item) => !item.resolved && item.pinX !== null).findIndex((item) => item.id === comment.id) ?? 0) + 1}`}
                    {comment.pinT !== null && (
                      <span className="comment-pin-time">{formatTimecode(comment.pinT)}</span>
                    )}
                  </button>
                )}
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
            <p>
              {designId
                ? "Add a note or pin your feedback to a detail."
                : "Keep decisions and next steps together."}
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
        {pendingPin && (
          <div className="pending-pin">
            <MapPin size={13} />
            Feedback pinned to a design
            <button
              type="button"
              className="icon-button"
              aria-label="Remove pending pin"
              onClick={onClearPin}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <label className="visually-hidden" htmlFor={`comment-${designId ?? "project"}`}>
          Your message
        </label>
        <textarea
          ref={composer}
          id={`comment-${designId ?? "project"}`}
          value={body}
          onChange={(event) => update({ body: event.target.value })}
          placeholder={pendingPin ? "What needs a closer look?" : "Leave a thoughtful note…"}
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
