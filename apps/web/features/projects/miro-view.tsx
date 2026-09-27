"use client";

import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useDismissOnOutsideClick } from "@/features/shared/use-dismiss-on-outside-click";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";
import { versionStatusLabel } from "@/features/workspace/workspace-data";
import { miroVersionLabel } from "./miro-mode";
import type { CanvasVersion, ProjectChannel } from "./project-data";
import type { ReviewDecision } from "./project-action-review";

export type MiroFrame = CanvasVersion & { miro: MiroLink };

/**
 * The More button and its popover, shared by both Miro bars. A pointer outside or Escape closes it;
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
 * The two-row bar both Miro views share. The first row says where you are: back, the title (with an
 * optional second name), the due date, then on the right the caller's tools, "Open in Miro" for the
 * shown link (for when the embed cannot sign in) and the More menu. The second row says what you are
 * looking at and what you can do there: the channel (`lead`), the caller's controls, and its primary
 * action; its tint marks Working files apart from what the client sees.
 */
export function MiroBarShell({
  back,
  title,
  name,
  due,
  tone,
  lead,
  children,
  primary,
  tools,
  link,
  menu,
}: {
  back: ReactNode;
  title: string;
  /** A second name after the title, such as the deliverable. */
  name?: string;
  /** The project's due date, already formatted ("Due Nov 29" or "No due date"). */
  due: string;
  tone: MiroBarTone;
  /** The channel: the agency's tabs, or the designer's Internal label. */
  lead?: ReactNode;
  /** The controls of the channel: board, rounds or versions, and status. */
  children?: ReactNode;
  /** The one action the viewer takes on what is shown. */
  primary?: ReactNode;
  /** Controls that do not depend on the channel, such as the view switch. */
  tools?: ReactNode;
  /** The link "Open in Miro" opens; without one the button is left out. */
  link?: MiroLink | null;
  menu: (close: () => void) => ReactNode;
}) {
  return (
    <div className={`project-header miro-bar${tone ? ` is-${tone}` : ""}`}>
      <div className="miro-bar-row">
        {back}
        <h1 className="miro-bar-title" title={name ? `${title} / ${name}` : title}>
          <span>{title}</span>
          {name && (
            <>
              <span aria-hidden="true">/</span>
              <span>{name}</span>
            </>
          )}
        </h1>
        <span className="miro-bar-due">{due}</span>
        <div className="miro-bar-actions">
          {tools}
          {link && (
            <a
              className="button"
              href={miroBoardUrl(link)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Miro
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
          <MiroBarMenu>{menu}</MiroBarMenu>
        </div>
      </div>
      {(lead || children || primary) && (
        <div className="miro-bar-context">
          {lead}
          {children}
          {primary && <div className="miro-bar-primary">{primary}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Miro mode's header: back, the project and deliverable names and the due date, then the Versions |
 * Miro switch, "Open in Miro" (for when the embed cannot sign in) and a "More" menu holding the
 * credits the project used. The second row holds the channel and a toggle of the deliverable's
 * linked versions with the shown version's status.
 */
export function MiroBar({
  back,
  title,
  name,
  due,
  tone,
  lead,
  linked,
  current,
  onSelect,
  viewControl,
  menu,
}: {
  back: ReactNode;
  title: string;
  name: string;
  /** The project's due date, already formatted ("Due Nov 29" or "No due date"). */
  due: string;
  tone: MiroBarTone;
  lead?: ReactNode;
  linked: CanvasVersion[];
  current: MiroFrame;
  onSelect: (versionId: string) => void;
  viewControl: ReactNode;
  menu: (close: () => void) => ReactNode;
}) {
  const versions = linked
    .filter((version) => version.deliverableId === current.deliverableId)
    .sort((a, b) => a.number - b.number);
  return (
    <MiroBarShell
      back={back}
      title={title}
      name={name}
      due={due}
      tone={tone}
      lead={lead}
      tools={viewControl}
      link={current.miro}
      menu={menu}
    >
      <div className="segmented-control" role="group" aria-label="Miro version">
        {versions.map((version) => (
          <button
            key={version.id}
            className={version.id === current.id ? "active" : ""}
            aria-pressed={version.id === current.id}
            onClick={() => {
              if (version.id !== current.id) onSelect(version.id);
            }}
          >
            V{version.number}
          </button>
        ))}
      </div>
      <span className="miro-bar-status">{versionStatusLabel(current.status)}</span>
    </MiroBarShell>
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
 * Miro mode's view: the chosen version's frame in place of the canvas, running under the header and
 * the floating tool bar. The iframe source is rebuilt from stored ids; `key` reloads it on the new
 * frame when the version changes.
 */
export function MiroView({
  current,
  deliverables,
  strip,
}: {
  current: MiroFrame;
  deliverables: { id: string; name: string }[];
  strip?: ReactNode;
}) {
  return (
    <MiroEmbed
      title={`Miro board for ${miroVersionLabel(current, deliverables)}`}
      link={current.miro}
      frameKey={current.id}
      strip={strip}
    />
  );
}

/**
 * The client's review of the shown frame in Miro mode, under the project tool bar: Request changes
 * or Approve opens the review dialog with that decision chosen. Shown only when the version can be
 * reviewed (the client's latest pending publication of its deliverable).
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
