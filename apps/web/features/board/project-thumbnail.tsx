"use client";

import { useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { formats } from "@/features/briefings/briefing-model";
import { assertResult } from "@/lib/supabase";

/**
 * Artwork for the project cards on the board canvas, together with the version and the deliverable
 * type that artwork belongs to.
 *
 * The source is chosen by role, and the private buckets behind it do the real enforcing: working
 * designs live in `public.designs` under `private.can_produce`, their numbering in
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
 * there is no artwork, or because signing it failed — the version goes with it.
 */

/** Long enough to outlive a board session, short enough that a copied URL stops working. */
const THUMBNAIL_TTL = 3600;
/** Refetch a little before the URLs expire rather than after a card has already gone blank. */
const THUMBNAIL_STALE = (THUMBNAIL_TTL - 300) * 1000;

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
export type VersionArtwork = {
  versionNumber: number;
  designs: { id: string; sortOrder: number; path: string }[];
};

/** What one card needs, before the storage path has been signed. */
export type ProjectArtwork = {
  path: string | null;
  version: number | null;
  typeLabel: string | null;
};

/** What one card needs, ready to render. */
export type SignedProjectArtwork = {
  /** A short-lived signed URL for the artwork, or null when the card has none to show. */
  url: string | null;
  /** The version number that `url` belongs to. Null whenever `url` is null. */
  version: number | null;
  /** The leading deliverable's format, as a human label. Present even without artwork. */
  typeLabel: string | null;
};

export type ProjectArtworkMap = Record<string, SignedProjectArtwork>;

/** A project with no readable deliverable at all: nothing to show, nothing to claim. */
export const NO_ARTWORK: SignedProjectArtwork = { url: null, version: null, typeLabel: null };

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
 * all.
 */
export function selectProjectArtwork(rows: DeliverableArtwork[]) {
  const chosen: Record<string, ProjectArtwork> = {};
  for (const [projectId, deliverable] of leadingDeliverable(rows)) {
    const newest = newestArtworkVersion(deliverable.versions);
    const design = newest ? leadingDesign(newest.designs) : null;
    chosen[projectId] =
      newest && design
        ? {
            path: design.path,
            version: newest.versionNumber,
            typeLabel: formatTypeLabel(deliverable.format),
          }
        : { path: null, version: null, typeLabel: formatTypeLabel(deliverable.format) };
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

/*
 * The two reads. Each one names only the tables its role may touch, so the wrong channel is never
 * even asked for; row level security is what makes that a guarantee rather than a convention.
 * Deliverables lead both queries so a project without any artwork still comes back with its type.
 */
const INTERNAL_SELECT =
  "id, project_id, format, sort_order, design_versions(version_number, designs(id, sort_order, internal_asset_path))";
const PUBLISHED_SELECT =
  "id, project_id, format, sort_order, published_versions(version_number, published_designs(id, sort_order, asset_path))";

/**
 * Shared options for the board's artwork read, so the hooks below are two views of one request.
 *
 * React Query keys the result by viewer, role and project list; two hooks asking for the same key
 * share the one cache entry, which keeps the board at a single query and a single signing call.
 */
function useBoardArtworkQuery(projectIds: string[]) {
  const { database, session, profile } = useAuth();
  const role = profile?.role;
  // The identity of the id list drives the query key, so a filter that only hides cards must not
  // start a new request: callers pass their full client scope and the board picks from the result.
  const ids = useMemo(() => [...projectIds].sort(), [projectIds]);
  return {
    queryKey: ["board-thumbnails", session?.user.id, role, ids],
    enabled: !!session && !!role && ids.length > 0,
    staleTime: THUMBNAIL_STALE,
    queryFn: async (): Promise<ProjectArtworkMap> => {
      const asClient = role === "client";
      const deliverables = asClient
        ? fromPublishedRows(
            assertResult(
              await database
                .from("deliverables")
                .select(PUBLISHED_SELECT)
                .in("project_id", ids)
                .not("published_versions.published_designs.asset_path", "is", null),
            ),
          )
        : fromInternalRows(
            assertResult(
              await database
                .from("deliverables")
                .select(INTERNAL_SELECT)
                .in("project_id", ids)
                .not("design_versions.designs.internal_asset_path", "is", null),
            ),
          );
      const chosen = selectProjectArtwork(deliverables);
      const paths = [
        ...new Set(
          Object.values(chosen)
            .map((item) => item.path)
            .filter((path): path is string => !!path),
        ),
      ];
      const urlByPath = new Map<string, string>();
      if (paths.length) {
        const signed = assertResult(
          await database.storage
            .from(asClient ? "published-assets" : "internal-assets")
            .createSignedUrls(paths, THUMBNAIL_TTL),
        );
        for (const item of signed)
          if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      const artwork: ProjectArtworkMap = {};
      for (const [projectId, item] of Object.entries(chosen)) {
        const url = item.path ? (urlByPath.get(item.path) ?? null) : null;
        // A version is a claim about an image. Without the image the claim is dropped rather than
        // shown over an empty tile, which is the mismatch this whole path exists to prevent.
        artwork[projectId] = {
          url,
          version: url ? item.version : null,
          typeLabel: item.typeLabel,
        };
      }
      return artwork;
    },
  };
}

/**
 * Artwork, version and type label for a whole board, keyed by project id.
 *
 * One query covers every card: twenty cards each fetching their own design row and signature
 * would be twenty round trips for a board that is read as a single surface.
 */
export function useProjectArtwork(projectIds: string[]) {
  return useQuery(useBoardArtworkQuery(projectIds));
}

/** Just the signed URLs, for callers that have no badge to draw. Shares the query above. */
function toThumbnailUrls(artwork: ProjectArtworkMap) {
  const urls: Record<string, string> = {};
  for (const [projectId, item] of Object.entries(artwork)) if (item.url) urls[projectId] = item.url;
  return urls;
}

export type ProjectThumbnails = Record<string, string>;

export function useProjectThumbnails(projectIds: string[]) {
  return useQuery({ ...useBoardArtworkQuery(projectIds), select: toThumbnailUrls });
}

/**
 * The card's artwork band.
 *
 * Most projects have no artwork yet, so the empty state is the ordinary one: a quiet tile that
 * reads as part of the card rather than as a missing image. The band is decorative — the card is
 * already named by its title — so it stays out of the accessibility tree, and the image is not
 * natively draggable so it can never compete with dragging the card.
 */
export function ProjectThumbnail({ src }: { src?: string }) {
  return (
    // The box keeps its size either way so cards in a row line up, but an empty one says what it
    // is rather than sitting there as a filled grey block that reads like a broken image. Every
    // project starts without artwork, so this is a normal state, not a fault.
    <div className={`board-card-media ${src ? "" : "empty"}`} aria-hidden="true">
      {src ? (
        // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" draggable={false} />
      ) : (
        <>
          <ImageIcon size={15} />
          <span>No artwork yet</span>
        </>
      )}
    </div>
  );
}
