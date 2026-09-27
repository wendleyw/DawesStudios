"use client";

import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useDismissOnOutsideClick } from "@/features/shared/use-dismiss-on-outside-click";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";
import type { ProjectChannel } from "./project-data";
import type { ReviewDecision } from "./project-action-review";

/**
 * The More button and its popover in the Miro bar. A pointer outside or Escape closes it;
 * Escape also returns focus to More, so the keyboard never lands on the page body. `children`
 * receives `close` for items that act and then close the menu.
 */
export function MiroBarMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  useDismissOnOutsideClick(root, open, close);
  return (
    <div
      className="miro-bar-menu"
      ref={root}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        setOpen(false);
        trigger.current?.focus();
      }}
    >
      <button
        ref={trigger}
        className="icon-button"
        aria-label="More"
        title="More"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && <div className="miro-bar-popover">{children(close)}</div>}
    </div>
  );
}

/**
 * Whose view the second row shows: Working files, the agency's view of what the client sees, or
 * nothing to tell apart (the client has one channel and is never told it has another).
 */
export type MiroBarTone = "internal" | "client" | null;

/** The Miro bar's tint for a viewer: the client has one channel, so theirs is left plain. */
export function miroBarTone(role: string | undefined, channel: ProjectChannel): MiroBarTone {
  if (role !== "agency" && role !== "designer") return null;
  return channel === "internal" ? "internal" : "client";
}

/**
 * The workspace's two-row bar (`miro-workspace-bar.tsx` fills it). The first row says where you
 * are: back, the title, the due date, then on the right "Open in Miro" for the shown link (for when
 * the embed cannot sign in) and the More menu. The second row says what you are
 * looking at and what you can do there: the channel (`lead`), the caller's controls, and its primary
 * action; its tint marks Working files apart from what the client sees.
 */
export function MiroBarShell({
  compact = false,
  back,
  title,
  due,
  tone,
  lead,
  children,
  primary,
  link,
  menu,
}: {
  /** Title and due date are in the header above; combine the remaining controls into one row. */
  compact?: boolean;
  back: ReactNode;
  title: string;
  /** The project's due date, already formatted ("Due Nov 29" or "No due date"). */
  due: string;
  tone: MiroBarTone;
  /** The channel: the agency's tabs, or the designer's Internal label. */
  lead?: ReactNode;
  /** The controls of the channel: board, rounds or versions, and status. */
  children?: ReactNode;
  /** The one action the viewer takes on what is shown. */
  primary?: ReactNode;
  /** The link "Open in Miro" opens; without one the button is left out. */
  link?: MiroLink | null;
  menu: (close: () => void) => ReactNode;
}) {
  const actions = (
    <div className="miro-bar-actions">
      {link && (
        <a className="button" href={miroBoardUrl(link)} target="_blank" rel="noopener noreferrer">
          Open in Miro
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
      <MiroBarMenu>{menu}</MiroBarMenu>
    </div>
  );
  return (
    <div
      className={`project-header miro-bar${tone ? ` is-${tone}` : ""}${compact ? " is-compact" : ""}`}
    >
      {!compact && (
        <div className="miro-bar-row">
          {back}
          <h1 className="miro-bar-title" title={title}>
            <span>{title}</span>
          </h1>
          <span className="miro-bar-due">{due}</span>
          {actions}
        </div>
      )}
      {(compact || lead || children || primary) && (
        <div className="miro-bar-context">
          {compact && back}
          {lead}
          {children}
          {primary && <div className="miro-bar-primary">{primary}</div>}
          {compact && actions}
        </div>
      )}
    </div>
  );
}

/** The Miro embed itself: a cropped live-embed iframe; `frameKey` reloads it on a new frame. */
export function MiroEmbed({
  title,
  link,
  frameKey,
  strip,
}: {
  title: string;
  link: MiroLink;
  frameKey: string;
  strip?: ReactNode;
}) {
  return (
    <section className="miro-view" aria-label="Miro board">
      {strip}
      {/* Miro's own top bar is cropped off (see `.miro-view-crop`); the board, its tools and paste
          stay fully usable. */}
      <div className="miro-view-crop">
        <iframe
          key={frameKey}
          className="miro-view-frame"
          title={title}
          src={miroEmbedUrl(link)}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}

/**
 * The client's review of the shown client version, under the project tool bar: Request changes
 * or Approve opens the review dialog with that decision chosen. Shown only when the version can be
 * reviewed (`canReviewShared`).
 */
export function MiroReviewBar({
  label,
  onDecide,
}: {
  label: string;
  onDecide: (decision: ReviewDecision) => void;
}) {
  return (
    <div className="miro-review-bar" role="group" aria-label="Review this version">
      <p>
        <strong>{label}</strong>
        <span>Ready for your review</span>
      </p>
      <button className="button" onClick={() => onDecide("changes_requested")}>
        Request changes
      </button>
      <button className="button primary" onClick={() => onDecide("approved")}>
        Approve
      </button>
    </div>
  );
}
