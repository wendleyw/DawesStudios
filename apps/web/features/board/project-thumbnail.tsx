"use client";

import { ImageIcon } from "lucide-react";
import { formats } from "@/features/briefings/briefing-model";

/**
 * Artwork for the project cards on the board canvas: the project's cover, otherwise the
 * placeholder, together with the leading deliverable's type label.
 *
 * `public.project_covers` under its own row-level security (`private.can_produce`, or
 * `private.can_client_channel` while `client_visible`) already answers "readable by this viewer"
 * before this module ever sees the row, so the choice below never re-derives that decision from
 * `profile.role`. The `project-covers` bucket is private, so a cover is shown through a
 * short-lived signed URL; a cover whose signature fails falls back to the placeholder.
 *
 * The designs themselves live in Miro, so the card never shows a design or a version number.
 */

/** One deliverable, reduced to what the card's type label needs. */
export type DeliverableType = {
  deliverableId: string;
  projectId: string;
  /** A `format_catalog` id, resolved to a human label through the bundled copy of that catalog. */
  format: string;
  sortOrder: number;
};

/** A project's readable cover, as `project_covers.storage_path`, keyed by project id. */
export type ProjectCoverMap = Record<string, string>;

/** What one card needs, ready to render. */
export type SignedProjectArtwork = {
  /** A short-lived signed URL for the cover, or null when the card shows the placeholder. */
  url: string | null;
  /** The leading deliverable's format, as a human label. Present even without a cover. */
  typeLabel: string | null;
};

export type ProjectArtworkMap = Record<string, SignedProjectArtwork>;

/** A project with neither a cover nor a deliverable: nothing to show. */
const NO_ARTWORK: SignedProjectArtwork = { url: null, typeLabel: null };

/** Reading a card's artwork without having to spell out the missing case at every call site. */
export function artworkFor(map: ProjectArtworkMap | undefined, projectId: string) {
  return map?.[projectId] ?? NO_ARTWORK;
}

/**
 * The human name of a deliverable format.
 *
 * `deliverables.format` is a foreign key into `public.format_catalog`, and the same catalog ships
 * with the app for the briefing flow, so the label costs no extra round trip. An id the bundled
 * copy has not caught up with is shown as itself rather than dropped: a card saying `feed` is
 * poor, a card saying nothing is worse.
 */
export function formatTypeLabel(format: string) {
  return formats.find((item) => item.id === format)?.name ?? format;
}

/**
 * The project's leading deliverable: the lowest `sort_order`, ties broken by `id`, so the card's
 * label never changes its mind between loads.
 */
function leadingDeliverables(rows: DeliverableType[]) {
  const leading = new Map<string, DeliverableType>();
  for (const row of rows) {
    const current = leading.get(row.projectId);
    const earlier =
      !current ||
      row.sortOrder < current.sortOrder ||
      (row.sortOrder === current.sortOrder && row.deliverableId < current.deliverableId);
    if (earlier) leading.set(row.projectId, row);
  }
  return leading;
}

/**
 * Each project's card: the signed cover when its path signed (`urlByPath` has it), otherwise the
 * placeholder, plus the leading deliverable's type label. A project with a cover but no
 * deliverable row (a defensive case) still gets a cover-only entry.
 */
export function resolveProjectArtwork(
  deliverables: DeliverableType[],
  covers: ProjectCoverMap,
  urlByPath: Map<string, string>,
): ProjectArtworkMap {
  const artwork: ProjectArtworkMap = {};
  const leading = leadingDeliverables(deliverables);
  const projectIds = new Set([...leading.keys(), ...Object.keys(covers)]);
  for (const projectId of projectIds) {
    const coverPath = covers[projectId];
    const deliverable = leading.get(projectId);
    artwork[projectId] = {
      url: (coverPath && urlByPath.get(coverPath)) || null,
      typeLabel: deliverable ? formatTypeLabel(deliverable.format) : null,
    };
  }
  return artwork;
}

/** A `deliverables` row as the board reads it. */
type DeliverableRow = { id: string; project_id: string; format: string; sort_order: number };

export function fromDeliverableRows(rows: DeliverableRow[]): DeliverableType[] {
  return rows.map((row) => ({
    deliverableId: row.id,
    projectId: row.project_id,
    format: row.format,
    sortOrder: row.sort_order,
  }));
}

/**
 * The card's artwork band.
 *
 * Most projects have no cover yet, so the empty state is the ordinary one: a quiet tile that
 * reads as part of the card rather than as a missing image. The band is decorative — the card is
 * already named by its title — so it stays out of the accessibility tree, and the image is not
 * natively draggable so it can never compete with dragging the card.
 */
export function ProjectThumbnail({ src }: { src?: string }) {
  return (
    // The box keeps its size either way so cards in a row line up, but an empty one says what it
    // is rather than sitting there as a filled grey block that reads like a broken image. Every
    // project starts without a cover, so this is a normal state, not a fault.
    <div className={`board-card-media ${src ? "" : "empty"}`} aria-hidden="true">
      {src ? (
        <>
          {/* A blurred copy of the same artwork fills the letterbox, so the band takes the design's
              own colours and the sharp copy on top reads as the focus. Keep expiring,
              caller-scoped signed URLs out of Next.js's shared image optimization cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="board-card-media-backdrop"
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" draggable={false} />
        </>
      ) : (
        <>
          <ImageIcon size={15} />
          <span>No cover yet</span>
        </>
      )}
    </div>
  );
}
