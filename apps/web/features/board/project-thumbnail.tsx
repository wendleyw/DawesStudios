"use client";

import { ImageIcon, Play } from "lucide-react";
import { formats } from "@/features/briefings/briefing-model";

/**
 * Artwork for the project cards on the board canvas, together with the version and the deliverable
 * type that artwork belongs to.
 *
 * A project cover, when one is readable by this viewer, wins over everything else: `public
 * .project_covers` under its own row-level security (`private.can_produce`, or
 * `private.can_client_channel` while `client_visible`) already answers "readable by this viewer"
 * before this module ever sees the row, so the choice below never re-derives that decision from
 * `profile.role`. A cover is not a version, so a card showing one never carries a version label.
 *
 * Otherwise the source is chosen by role, and the private buckets behind it do the real enforcing:
 * working designs live in `public.designs` under `private.can_produce`, their numbering in
 * `public.design_versions` under the same rule, and what a client may see lives in
 * `public.published_designs` / `public.published_versions` under `private.can_client_channel`. A
 * client never asks for an internal path or an internal version number, and would be refused if it
 * did. The two sets are never mixed: an internal draft number over a published image, or published
 * artwork under an internal number, would each be a leak of the other channel.
 *
 * Every bucket is private, so the cards are shown through short-lived signed URLs, the same
 * mechanism the brand asset previews use.
 *
 * The image and the number it is labelled with come out of one query and one selection, so a card
 * can never announce a version it is not actually showing. Where the image is missing — because
 * there is no artwork, because signing it failed, or because it is a cover — the version goes with
 * it (absent for a cover, dropped otherwise).
 */

/**
 * One deliverable, reduced to the artwork the viewer's role is allowed to read.
 *
 * Both channels collapse into this shape before anything is chosen, so the selection rule below is
 * written once and cannot drift between the agency's view and the client's.
 */
export type DeliverableArtwork = {
  deliverableId: string;
  projectId: string;
  /** A `format_catalog` id, resolved to a human label through the bundled copy of that catalog. */
  format: string;
  sortOrder: number;
  versions: VersionArtwork[];
};

/** A numbered version and the artwork-bearing rows inside it. */
type VersionArtwork = {
  versionNumber: number;
  designs: { id: string; sortOrder: number; path: string }[];
};

/** What one card needs, before the storage path has been signed. */
type ProjectArtwork = {
  path: string | null;
  version: number | null;
  typeLabel: string | null;
  /** Set when `path` is a cover's storage path, so the caller signs it against `project-covers`
   * rather than the role's design bucket, and never treats it as a video asset. */
  isCover?: boolean;
};

/** A project's readable cover, as `project_covers.storage_path`, keyed by project id. Board's read
 * (`board-data.ts`) already scoped the row to what this viewer's role may see through the table's
 * own row-level security, so every entry here is chosen unconditionally. */
export type ProjectCoverMap = Record<string, string>;

/** What one card needs, ready to render. */
export type SignedProjectArtwork = {
  /** A short-lived signed URL for the artwork, or null when the card has none to show. */
  url: string | null;
  /** Video tiles load only in the project viewer and therefore have no signed thumbnail URL. */
  isVideo?: boolean;
  /** The selected artwork version; absent when no video or successfully signed image exists. */
  version: number | null;
  /** The leading deliverable's format, as a human label. Present even without artwork. */
  typeLabel: string | null;
};

export type ProjectArtworkMap = Record<string, SignedProjectArtwork>;

/** A project with no readable deliverable at all: nothing to show, nothing to claim. */
const NO_ARTWORK: SignedProjectArtwork = { url: null, version: null, typeLabel: null };

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
 * The project's leading deliverable: the lowest `sort_order`, ties broken by `id`.
 *
 * A project can hold several deliverables — the seeded baseline pairs an original with an
 * adaptation — and `sort_order` is the order the briefing requested them in, with the original
 * first. Taking the first row the database happens to return would let the card change its mind
 * between loads, so the rule is stated here and is total: `sort_order` then `id`, both stable.
 *
 * It also makes "the newest version" mean something. `version_number` is unique per deliverable,
 * not per project, so V2 of one deliverable and V2 of another are unrelated numbers; comparing
 * them would be meaningless. Pinning the card to one deliverable is what lets it count.
 */
function leadingDeliverable(rows: DeliverableArtwork[]) {
  const leading = new Map<string, DeliverableArtwork>();
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

/** The newest version of that deliverable that actually carries artwork, or none. */
function newestArtworkVersion(versions: VersionArtwork[]) {
  let newest: VersionArtwork | null = null;
  for (const version of versions)
    if (version.designs.length && (!newest || version.versionNumber > newest.versionNumber))
      newest = version;
  return newest;
}

/** Within that version, the first artwork by the order the project canvas lays them out in. */
function leadingDesign(designs: VersionArtwork["designs"]) {
  let leading: VersionArtwork["designs"][number] | null = null;
  for (const design of designs) {
    const earlier =
      !leading ||
      design.sortOrder < leading.sortOrder ||
      (design.sortOrder === leading.sortOrder && design.id < leading.id);
    if (earlier) leading = design;
  }
  return leading;
}

/**
 * The one image, version and type label each project's card should carry.
 *
 * The type label stands on its own — it describes the work whether or not anything has been drawn
 * yet — while the path and the version are decided together and are returned together or not at
 * all. A readable cover (`covers[projectId]`) always wins here, ahead of any legacy design or
 * published artwork, and carries no version: `newestArtworkVersion`/`leadingDesign` are not even
 * consulted for that project. Without a cover, today's rule applies unchanged.
 */
export function selectProjectArtwork(rows: DeliverableArtwork[], covers: ProjectCoverMap = {}) {
  const chosen: Record<string, ProjectArtwork> = {};
  for (const [projectId, deliverable] of leadingDeliverable(rows)) {
    const typeLabel = formatTypeLabel(deliverable.format);
    const coverPath = covers[projectId];
    if (coverPath) {
      chosen[projectId] = { path: coverPath, version: null, typeLabel, isCover: true };
      continue;
    }
    const newest = newestArtworkVersion(deliverable.versions);
    const design = newest ? leadingDesign(newest.designs) : null;
    chosen[projectId] =
      newest && design
        ? { path: design.path, version: newest.versionNumber, typeLabel }
        : { path: null, version: null, typeLabel };
  }
  return chosen;
}

/** The internal channel, as `designs` + `design_versions` come back from one embedded read. */
type InternalRow = {
  id: string;
  project_id: string;
  format: string;
  sort_order: number;
  design_versions: {
    version_number: number;
    designs: { id: string; sort_order: number; internal_asset_path: string | null }[];
  }[];
};

/** The client channel, as `published_designs` + `published_versions` come back from the same read. */
type PublishedRow = {
  id: string;
  project_id: string;
  format: string;
  sort_order: number;
  published_versions: {
    version_number: number;
    published_designs: { id: string; sort_order: number; asset_path: string | null }[];
  }[];
};

export function fromInternalRows(rows: InternalRow[]): DeliverableArtwork[] {
  return rows.map((row) => ({
    deliverableId: row.id,
    projectId: row.project_id,
    format: row.format,
    sortOrder: row.sort_order,
    versions: row.design_versions.map((version) => ({
      versionNumber: version.version_number,
      designs: version.designs
        .filter((design) => !!design.internal_asset_path)
        .map((design) => ({
          id: design.id,
          sortOrder: design.sort_order,
          path: design.internal_asset_path as string,
        })),
    })),
  }));
}

export function fromPublishedRows(rows: PublishedRow[]): DeliverableArtwork[] {
  return rows.map((row) => ({
    deliverableId: row.id,
    projectId: row.project_id,
    format: row.format,
    sortOrder: row.sort_order,
    versions: row.published_versions.map((version) => ({
      versionNumber: version.version_number,
      designs: version.published_designs
        .filter((design) => !!design.asset_path)
        .map((design) => ({
          id: design.id,
          sortOrder: design.sort_order,
          path: design.asset_path as string,
        })),
    })),
  }));
}

/**
 * The card's artwork band.
 *
 * Most projects have no artwork yet, so the empty state is the ordinary one: a quiet tile that
 * reads as part of the card rather than as a missing image. The band is decorative — the card is
 * already named by its title — so it stays out of the accessibility tree, and the image is not
 * natively draggable so it can never compete with dragging the card.
 */
export function ProjectThumbnail({ src, video = false }: { src?: string; video?: boolean }) {
  return (
    // The box keeps its size either way so cards in a row line up, but an empty one says what it
    // is rather than sitting there as a filled grey block that reads like a broken image. Every
    // project starts without artwork, so this is a normal state, not a fault.
    <div className={`board-card-media ${src ? "" : "empty"}`} aria-hidden="true">
      {video ? (
        <>
          <Play size={18} />
          <span>Video</span>
        </>
      ) : src ? (
        // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" draggable={false} />
      ) : (
        <>
          <ImageIcon size={15} />
          <span>No design yet</span>
        </>
      )}
    </div>
  );
}
