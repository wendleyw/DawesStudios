"use client";

import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useDismissOnOutsideClick } from "@/features/shared/use-dismiss-on-outside-click";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";
import { versionStatusLabel } from "@/features/workspace/workspace-data";
import { miroVersionLabel } from "./miro-mode";
import type { CanvasVersion } from "./project-data";
import type { ReviewDecision } from "./project-action-review";

export type MiroFrame = CanvasVersion & { miro: MiroLink };

/**
 * Miro mode's header, folded into one bar so the board gets the height: back, the project and
 * deliverable names, a toggle of the deliverable's linked versions with the shown version's status,
 * the Versions | Miro switch,
 * "Open in Miro" (for when the embed cannot sign in) and a "More" menu holding the credits the
 * project used, the rarely used channel switch and the deliverable filter (which changes the
 * deliverable).
 */
export function MiroBar({
  back,
  title,
  name,
  due,
  linked,
  current,
  onSelect,
  viewControl,
  menu,
}: {
  back: ReactNode;
  title: string;
  name: string;
  /** The project's due date, already formatted ("Nov 29" or "No due date"). */
  due: string;
  linked: CanvasVersion[];
  current: MiroFrame;
  onSelect: (versionId: string) => void;
  viewControl: ReactNode;
  menu: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(menuRoot, menuOpen, () => setMenuOpen(false));
  const versions = linked
    .filter((version) => version.deliverableId === current.deliverableId)
    .sort((a, b) => a.number - b.number);
  return (
    <div className="project-header miro-bar">
      {back}
      <h1 className="miro-bar-title" title={`${title} / ${name}`}>
        <span>{title}</span>
        <span aria-hidden="true">/</span>
        <span>{name}</span>
      </h1>
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
      <span className="miro-bar-due">{due}</span>
      <div className="miro-bar-actions">
        {viewControl}
        <a
          className="button"
          href={miroBoardUrl(current.miro)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Miro
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
        <div
          className="miro-bar-menu"
          ref={menuRoot}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false);
          }}
        >
          <button
            className="icon-button"
            aria-label="More"
            title="More"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={17} />
          </button>
          {menuOpen && <div className="miro-bar-popover">{menu}</div>}
        </div>
      </div>
    </div>
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
    <section className="miro-view" aria-label="Miro board">
      {strip}
      {/* Miro's own top bar is cropped off (see `.miro-view-crop`); the board, its tools and paste
          stay fully usable. */}
      <div className="miro-view-crop">
        <iframe
          key={current.id}
          className="miro-view-frame"
          title={`Miro board for ${miroVersionLabel(current, deliverables)}`}
          src={miroEmbedUrl(current.miro)}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
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
