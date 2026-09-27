"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database, Json } from "@database";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import { versionDate, versionNote, versionStatus } from "@/features/shared/version-row";
import { isVideoAsset } from "./video-pins";
import type { MiroLink } from "./miro-links";

/**
 * Supabase access for a project: the canvas the project page draws, its two comment channels, the
 * designers assigned to it, and every write the canvas and its dialogs perform.
 *
 * Signed artwork URLs are read here rather than in `artwork-files.ts`: that module is deliberately
 * free of React and of `useAuth`, and `board-data.ts` already keeps its own `createSignedUrls` read
 * beside the rows it signs. Only the upload and discard of an artwork file live in `artwork-files`.
 */

export type TableRow<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];
export type ProjectChannel = "internal" | "client";
export type CanvasVersion = {
  id: string;
  projectId: string;
  deliverableId: string | null;
  /** The design board a Miro-workspace round belongs to; null elsewhere. */
  boardId: string | null;
  number: number;
  note: string;
  status: string;
  date: string;
  feedback?: string;
  /** The client person who decided on a published version, and when; absent on the internal channel. */
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  /** The Miro frame this version points at, on the viewer's channel; null when none is set. */
  miro?: MiroLink | null;
};
export type CanvasDesign = {
  id: string;
  versionId: string;
  title: string;
  content: Json;
  assetPath: string | null;
  order: number;
};
export type CanvasComment = {
  id: string;
  body: string;
  label: string;
  pinX: number | null;
  pinY: number | null;
  /** Seconds from the start of the video the pin belongs to; null for a still design's pin. */
  pinT: number | null;
  designId: string | null;
  resolved: boolean;
  createdAt: string;
};

/**
 * The columns the API grants on the internal tables: every column but the author's id, which no
 * role reads (migration `202609260011_author_column_privileges.sql`), so a designer handed a board
 * never learns who worked on it before. A `select("*")` on these tables is refused.
 */
const internalVersionColumns =
  "id,project_id,deliverable_id,board_id,version_number,notes,status,created_at,request_key";
const internalDesignColumns =
  "id,project_id,version_id,title,content,internal_asset_path,sort_order,created_at";

/** A canvas version row, from whichever of the two channel tables the canvas was read from. */
type CanvasVersionRow =
  Omit<TableRow<"design_versions">, "created_by"> | TableRow<"published_versions">;
/** The columns of a publication review the canvas reads. */
type CanvasReviewRow = Pick<
  TableRow<"publication_reviews">,
  "publication_id" | "status" | "feedback" | "reviewed_by" | "reviewed_at"
>;

/**
 * The canvas' versions, each carrying its client review when — and only when — one can be matched.
 *
 * `publication_reviews.publication_id` references `published_versions.id`, so on the **client**
 * channel the review is matched by `publication_id === version.id`: the canvas' versions *are*
 * those publication rows, and the two ids are the same id.
 *
 * On the **internal** channel the versions are `design_versions` rows, a different entity in a
 * different id space, and comparing the two could never be true. The only record joining an
 * internal version to its publication is `private.publication_sources(publication_id,
 * internal_version_id)`, which lives in the `private` schema — `supabase/config.toml` exposes
 * `public` alone, so no API caller can read it — and `publication_reviews` itself is readable only
 * by the agency and the client (`reviews_read` → `private.can_client_channel`). An internal version
 * therefore has no review this query can reach, and the channel, not an id comparison, decides
 * whether a review applies at all.
 */
/** A version's Miro link as either channel's table returns it, keyed by that channel's version id. */
export type MiroLinkRow = { versionId: string; boardId: string; widgetId: string | null };

export function toCanvasVersions(
  versions: CanvasVersionRow[],
  reviews: CanvasReviewRow[],
  clientChannel: boolean,
  links: MiroLinkRow[] = [],
): CanvasVersion[] {
  return versions.map((version) => {
    const review = clientChannel
      ? reviews.find((entry) => entry.publication_id === version.id)
      : undefined;
    return {
      id: version.id,
      projectId: version.project_id,
      deliverableId: version.deliverable_id,
      boardId: "board_id" in version ? version.board_id : null,
      number: version.version_number,
      note: versionNote(version),
      status: versionStatus(version, review?.status),
      date: versionDate(version),
      feedback: review?.feedback,
      reviewedBy: review?.reviewed_by,
      reviewedAt: review?.reviewed_at,
      miro: (() => {
        const link = links.find((entry) => entry.versionId === version.id);
        return link ? { boardId: link.boardId, widgetId: link.widgetId } : null;
      })(),
    };
  });
}

/** The newest version's link among `versions`, skipping `excludeId`: what a new link prefills from. */
export function latestMiroLink(
  versions: { id: string; number: number }[],
  links: MiroLinkRow[],
  excludeId?: string,
): MiroLink | null {
  const newestFirst = [...versions].sort((a, b) => b.number - a.number);
  for (const version of newestFirst) {
    if (version.id === excludeId) continue;
    const link = links.find((entry) => entry.versionId === version.id);
    if (link) return { boardId: link.boardId, widgetId: link.widgetId };
  }
  return null;
}

/**
 * Each channel keeps its links in its own table under its own read rule. Reading one channel's
 * table for the other's versions is never done: the client board and the internal board stay apart.
 */
async function readMiroLinks(
  database: SupabaseDatabase,
  channel: ProjectChannel,
  filter: { projectId: string } | { versionIds: string[] },
): Promise<MiroLinkRow[]> {
  if (channel === "client") {
    const query = database
      .from("publication_miro_links")
      .select("publication_id, board_id, widget_id");
    const result =
      "projectId" in filter
        ? await query.eq("project_id", filter.projectId)
        : await query.in("publication_id", filter.versionIds);
    return assertResult(result).map((row) => ({
      versionId: row.publication_id,
      boardId: row.board_id,
      widgetId: row.widget_id,
    }));
  }
  const query = database
    .from("design_version_miro_links")
    .select("version_id, board_id, widget_id");
  const result =
    "projectId" in filter
      ? await query.eq("project_id", filter.projectId)
      : await query.in("version_id", filter.versionIds);
  return assertResult(result).map((row) => ({
    versionId: row.version_id,
    boardId: row.board_id,
    widgetId: row.widget_id,
  }));
}

export function useProjectDetail(projectId: string, channel: ProjectChannel, enabled = true) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, projectId, channel],
    enabled: !!session && enabled,
    queryFn: async () => {
      const clientChannel = channel === "client" || profile?.role === "client";
      const [project, deliverables, versionResult, designResult, reviewResult] = await Promise.all([
        database.from("projects").select("*").eq("id", projectId).single(),
        database.from("deliverables").select("*").eq("project_id", projectId).order("sort_order"),
        clientChannel
          ? database
              .from("published_versions")
              .select("*")
              .eq("project_id", projectId)
              .order("version_number")
          : database
              .from("design_versions")
              .select(internalVersionColumns)
              .eq("project_id", projectId)
              .order("version_number"),
        clientChannel
          ? database
              .from("published_designs")
              .select("*")
              .eq("project_id", projectId)
              .order("sort_order")
          : database
              .from("designs")
              .select(internalDesignColumns)
              .eq("project_id", projectId)
              .order("sort_order"),
        database.from("publication_reviews").select("*").eq("project_id", projectId),
      ]);
      if (versionResult.error) throw new Error(versionResult.error.message);
      if (designResult.error) throw new Error(designResult.error.message);
      const miroLinks = await readMiroLinks(database, clientChannel ? "client" : "internal", {
        projectId,
      });
      const versions = toCanvasVersions(
        versionResult.data,
        reviewResult.data ?? [],
        clientChannel,
        miroLinks,
      );
      const designs: CanvasDesign[] = designResult.data.map((design) => ({
        id: design.id,
        versionId: "version_id" in design ? design.version_id : design.publication_id,
        title: design.title,
        content: design.content,
        assetPath: "internal_asset_path" in design ? design.internal_asset_path : design.asset_path,
        order: design.sort_order,
      }));
      return {
        project: assertResult(project),
        deliverables: assertResult(deliverables),
        versions,
        designs,
        reviews: assertResult(reviewResult),
      };
    },
  });
}

/**
 * The client board a new shared version prefills from: the newest project-level client version's
 * link. The agency reads it from either channel — sharing a round starts on Working files, where
 * the canvas holds no client versions. Only the agency reads client links from the internal side,
 * so callers enable it for the agency alone. Keyed under `project-detail` so a share refreshes it.
 */
export function useLatestSharedMiroLink(projectId: string, enabled: boolean) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, "miro-latest-shared", projectId],
    enabled: !!session && enabled,
    queryFn: async () => {
      const versions = assertResult(
        await database
          .from("published_versions")
          .select("id, version_number")
          .eq("project_id", projectId)
          .is("deliverable_id", null),
      ).map((row) => ({ id: row.id, number: row.version_number }));
      if (!versions.length) return null;
      const links = await readMiroLinks(database, "client", {
        versionIds: versions.map((version) => version.id),
      });
      return latestMiroLink(versions, links);
    },
  });
}

/**
 * The link a new Miro link prefills from: the newest earlier version of the same deliverable, on
 * the same channel. Keyed under `project-detail` so every project write refreshes it.
 */
export function useLatestMiroLink(
  deliverableId: string,
  channel: ProjectChannel,
  options: { excludeId?: string; enabled?: boolean } = {},
) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: [
      "project-detail",
      session?.user.id,
      "miro-latest",
      deliverableId,
      channel,
      options.excludeId,
    ],
    enabled: !!session && !!deliverableId && (options.enabled ?? true),
    queryFn: async () => {
      const table = channel === "client" ? "published_versions" : "design_versions";
      const versions = assertResult(
        await database.from(table).select("id, version_number").eq("deliverable_id", deliverableId),
      ).map((row) => ({ id: row.id, number: row.version_number }));
      if (!versions.length) return null;
      const links = await readMiroLinks(database, channel, {
        versionIds: versions.map((version) => version.id),
      });
      return latestMiroLink(versions, links, options.excludeId);
    },
  });
}

/**
 * The seven fields a comment has whichever channel it came from. The eighth, `label`, is the one
 * thing the two channels must not share: a client comment carries the author label the client
 * wrote it under, while an internal comment resolves to the reader's own name or the anonymous
 * "Studio team" — never a designer's identity. It is passed in, so the two label rules stay
 * separate and visible at the two call sites that own them.
 */
function toCanvasComment(
  comment: {
    id: string;
    body: string;
    pin_x: number | null;
    pin_y: number | null;
    pin_t: number | null;
    design_id: string | null;
    resolved: boolean;
    created_at: string;
  },
  label: string,
): CanvasComment {
  return {
    id: comment.id,
    body: comment.body,
    label,
    pinX: comment.pin_x,
    pinY: comment.pin_y,
    pinT: comment.pin_t,
    designId: comment.design_id,
    resolved: comment.resolved,
    createdAt: comment.created_at,
  };
}

export function useProjectComments(
  projectId: string,
  channel: ProjectChannel,
  designId?: string,
  versionId?: string,
) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: [
      "comments",
      session?.user.id,
      projectId,
      channel,
      designId ?? "project",
      versionId ?? "all",
    ],
    enabled: !!session,
    queryFn: async () => {
      if (channel === "client") {
        const query = database
          .from("client_comments")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at");
        const scoped = designId ? query.eq("design_id", designId) : query.is("design_id", null);
        const rows = assertResult(
          await (versionId ? scoped.eq("publication_id", versionId) : scoped),
        );
        return rows.map((comment) => toCanvasComment(comment, comment.author_label));
      }
      const query = database
        .from("internal_comments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      const scoped = designId ? query.eq("design_id", designId) : query.is("design_id", null);
      const rows = assertResult(await (versionId ? scoped.eq("version_id", versionId) : scoped));
      return rows.map((comment) =>
        toCanvasComment(
          comment,
          comment.author_id === profile?.id ? profile.display_name : "Studio team",
        ),
      );
    },
    refetchInterval: 15_000,
  });
}

/** Counts unresolved design and general comments without loading production author fields. */
export function useVersionCommentCounts(projectId: string, channel: ProjectChannel) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["comments", session?.user.id, projectId, channel, "version-counts"],
    enabled: !!session,
    queryFn: async () => {
      const ids =
        channel === "client"
          ? assertResult(
              await database
                .from("client_comments")
                .select("publication_id")
                .eq("project_id", projectId)
                .eq("resolved", false),
            ).map((row) => row.publication_id)
          : assertResult(
              await database
                .from("internal_comments")
                .select("version_id")
                .eq("project_id", projectId)
                .eq("resolved", false),
            ).map((row) => row.version_id);
      return ids.reduce<Record<string, number>>((counts, id) => {
        if (id) counts[id] = (counts[id] ?? 0) + 1;
        return counts;
      }, {});
    },
    refetchInterval: 15_000,
  });
}

/** The designers a project may be assigned, and the ones it already has. */
export function useProjectAssignments(projectId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["assignments", session?.user.id, projectId],
    enabled: profile?.role === "agency",
    queryFn: async () => {
      const [members, assigned] = await Promise.all([
        database
          .from("profiles")
          .select("id,display_name")
          .eq("role", "designer")
          .is("removed_at", null),
        database.from("project_assignments").select("designer_id").eq("project_id", projectId),
      ]);
      return {
        members: assertResult(members),
        assigned: assertResult(assigned).map((item) => item.designer_id),
      };
    },
  });
}

export type DesignBoard = {
  id: string;
  projectId: string;
  name: string;
  designerId: string;
  miro: MiroLink;
  /** The internal due date the agency set for this board's designer (`2026-10-03`), if any. */
  dueDate: string | null;
};

/**
 * The project's design boards the viewer may see: all for the agency, their own for a designer.
 *
 * Polls every 30s, like `useProjectComments`' 15s interval above: RLS hides a board's row the
 * instant the agency reassigns it away from a designer, and that designer's open realtime
 * subscription never learns of the row's disappearance, so without a poll a reassigned board would
 * linger in a designer's workspace until they reloaded the page.
 */
export function useDesignBoards(projectId: string, enabled: boolean) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, projectId, "design-boards"],
    enabled: !!session && enabled,
    queryFn: async (): Promise<DesignBoard[]> =>
      assertResult(
        await database
          .from("design_boards")
          .select("id,project_id,name,designer_id,board_id,widget_id,due_date")
          .eq("project_id", projectId)
          .order("created_at"),
      ).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        designerId: row.designer_id,
        miro: { boardId: row.board_id, widgetId: row.widget_id },
        dueDate: row.due_date,
      })),
    refetchInterval: 30_000,
  });
}

/**
 * A short-lived signed URL for one design's uploaded artwork.
 *
 * The bucket is chosen by channel rather than by role, so a client channel never signs a path in
 * the internal bucket. The URL outlives a look at the artwork and is refreshed before it expires.
 */
// An open video viewer renews before expiry; VideoPlayer preserves its playhead and playback
// state across that source change. Passive video thumbnails disable this query entirely.
const VIDEO_ASSET_URL_EXPIRES_IN_SECONDS = 3600;
const VIDEO_ASSET_URL_REFRESH_MS = 55 * 60_000;

export function useDesignAssetUrl(
  assetPath: string | null,
  channel: ProjectChannel,
  enabled = true,
) {
  const { database, session } = useAuth();
  const video = isVideoAsset(assetPath);
  const expiresIn = video ? VIDEO_ASSET_URL_EXPIRES_IN_SECONDS : 300;
  return useQuery({
    queryKey: ["asset-url", session?.user.id, channel, assetPath, expiresIn],
    enabled: enabled && !!assetPath,
    staleTime: video ? VIDEO_ASSET_URL_REFRESH_MS : 120_000,
    refetchInterval: enabled ? (video ? VIDEO_ASSET_URL_REFRESH_MS : 240_000) : false,
    queryFn: async () =>
      assertResult(
        await database.storage
          .from(channel === "internal" ? "internal-assets" : "published-assets")
          .createSignedUrl(assetPath!, expiresIn),
      ).signedUrl,
  });
}

export type ProjectCover = { storagePath: string; clientVisible: boolean; url: string };

/**
 * The signed URL follows the same 300-second expiry / 240-second refresh as `useDesignAssetUrl`'s
 * still-image branch above: a cover is always a still PNG, never a video, so there is no reason to
 * pick different numbers for it.
 */
const COVER_URL_EXPIRES_IN_SECONDS = 300;
const COVER_URL_REFRESH_MS = 240_000;

/**
 * A project's cover, or `null` when none is set. Keyed under `project-detail` rather than a key of
 * its own, so `useInvalidateProject()` — already called after every project write — refreshes it
 * too, the same way `useDesignBoards` above keys its own read under `project-detail`.
 *
 * The read leans on `project_covers`' own RLS (`private.can_produce` or a client-visible row under
 * `private.can_client_channel`) rather than branching on `profile.role` here: a client session that
 * cannot see the row gets zero rows back, not an error, so `maybeSingle()` resolves to `null` for
 * exactly the case the block is asked to stay absent for.
 */
export function useProjectCover(projectId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, projectId, "cover"],
    enabled: !!session,
    staleTime: 120_000,
    refetchInterval: COVER_URL_REFRESH_MS,
    queryFn: async (): Promise<ProjectCover | null> => {
      const result = await database
        .from("project_covers")
        .select("storage_path,client_visible,updated_at")
        .eq("project_id", projectId)
        .maybeSingle();
      const row = assertResult(result);
      if (!row) return null;
      const url = assertResult(
        await database.storage
          .from("project-covers")
          .createSignedUrl(row.storage_path, COVER_URL_EXPIRES_IN_SECONDS),
      ).signedUrl;
      return { storagePath: row.storage_path, clientVisible: row.client_visible, url };
    },
  });
}

/** Toggles an existing cover's client visibility; setting a cover in the first place goes through
 * `prepareProjectCover` (`media-client.ts`) instead, since the RPC it calls needs the new object's
 * path. */
export async function setProjectCoverVisibility(
  database: SupabaseDatabase,
  input: { projectId: string; visible: boolean },
) {
  assertResult(
    await database.rpc("set_project_cover_visibility", {
      p_project_id: input.projectId,
      p_client_visible: input.visible,
    }),
  );
}

/**
 * The raw bytes behind a stored design's artwork, for the Playground albums' copy-into-board flow
 * (`features/playground/playground-albums.ts`).
 *
 * A plain function, not a `use<Thing>()` hook: it runs from the album drag/keyboard-add handler,
 * not on render — the same "read that cannot be a hook" shape as `findUnchangedDesign`/
 * `findDesignByAsset` (rule 2, `docs/architecture/data-access.md`). The bucket is chosen by
 * channel, exactly like `useDesignAssetUrl` above, so a client-channel copy can never reach into
 * `internal-assets`.
 */
export async function downloadDesignAssetFile(
  database: SupabaseDatabase,
  input: { assetPath: string; channel: ProjectChannel },
) {
  return assertResult(
    await database.storage
      .from(input.channel === "internal" ? "internal-assets" : "published-assets")
      .download(input.assetPath),
  );
}

/**
 * The keys every project write invalidates.
 *
 * `assignments` and `asset-url` are deliberately absent. Assignments are refetched by the panel
 * that owns them, straight after the assign or revoke that changed them, and a signed URL is
 * governed by its own expiry rather than by a project edit. Adding either here would refresh caches
 * no write has invalidated.
 */
export const projectQueryKeys = [
  "project-detail",
  "projects",
  "comments",
  "notifications",
] as const;

export function useInvalidateProject() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      projectQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/**
 * The one key a comment write dirties. `comment-panel.tsx` posts and resolves comments far more
 * often than the project's other writes fire, and neither touches `project-detail`, `projects` or
 * `notifications` — routing them through `useInvalidateProject()` would refetch the whole project
 * list and the notification feed for every message sent. Kept as its own single-key set, in the
 * same shape as `assetQueryKeys`, rather than folded into `projectQueryKeys`, precisely so the two
 * call sites can invalidate only what they dirty.
 */
const commentsQueryKeys = ["comments"] as const;

export function useInvalidateComments() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      commentsQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/** Saves the project's own details, refusing a save that would overwrite a concurrent edit. */
export async function updateProjectDetails(
  database: SupabaseDatabase,
  input: {
    id: string;
    /** The `updated_at` the form was opened on: the guard that makes the save a compare-and-set. */
    revision: string;
    title: string;
    description: string;
    startDate: string | null;
    dueDate: string | null;
  },
) {
  const result = await database
    .from("projects")
    .update({
      title: input.title,
      description: input.description,
      start_date: input.startDate,
      due_date: input.dueDate,
    })
    .eq("id", input.id)
    .eq("updated_at", input.revision)
    .select("id")
    .single();
  // The conflict message travels with the query rather than staying at the call site: it is the
  // reading of a no-rows result that only the `updated_at` guard above can produce.
  if (result.error?.code === "PGRST116")
    throw new Error(
      "This project changed while you were editing. Close and reopen the details to try again.",
    );
  assertResult(result);
}

export async function assignDesigner(
  database: SupabaseDatabase,
  input: { projectId: string; designerId: string },
) {
  return assertResult(
    await database.rpc("assign_designer", {
      p_project_id: input.projectId,
      p_designer_id: input.designerId,
    }),
  );
}

export async function revokeDesignAssignment(
  database: SupabaseDatabase,
  input: { projectId: string; designerId: string },
) {
  return assertResult(
    await database.rpc("revoke_design_assignment", {
      p_project_id: input.projectId,
      p_designer_id: input.designerId,
    }),
  );
}

export async function postComment(
  database: SupabaseDatabase,
  input: {
    projectId: string;
    channel: ProjectChannel;
    body: string;
    versionId?: string;
    designId?: string;
    pin?: { x: number; y: number; t?: number } | null;
    /** The attempt's replay key (`comment-panel.tsx` mints and reuses it across retries). */
    idempotencyKey?: string;
  },
) {
  return assertResult(
    await database.rpc("post_comment", {
      p_project_id: input.projectId,
      p_channel: input.channel,
      p_body: input.body,
      ...(input.versionId ? { p_version_id: input.versionId } : {}),
      ...(input.designId ? { p_design_id: input.designId } : {}),
      // `p_pin_t` is typed `number | undefined` (no `null`) by the generated RPC args, matching the
      // Postgres default of `null` for an unpassed argument — `PendingPin.t` is already
      // `number | undefined`, so passing it straight through has the same effect on the wire as
      // omitting the key, since the client strips undefined properties before sending the request.
      ...(input.pin ? { p_pin_x: input.pin.x, p_pin_y: input.pin.y, p_pin_t: input.pin.t } : {}),
      ...(input.idempotencyKey ? { p_idempotency_key: input.idempotencyKey } : {}),
    }),
  );
}

export async function resolveComment(
  database: SupabaseDatabase,
  input: { commentId: string; channel: ProjectChannel; resolved: boolean },
) {
  return assertResult(
    await database.rpc("resolve_comment", {
      p_comment_id: input.commentId,
      p_channel: input.channel,
      p_resolved: input.resolved,
    }),
  );
}

/** Creates the deliverable's next design version and resolves to its id. */
export async function createDesignVersion(
  database: SupabaseDatabase,
  input: { deliverableId: string; notes: string; copyVersionId?: string },
) {
  return assertResult(
    await database.rpc("create_design_version", {
      p_deliverable_id: input.deliverableId,
      p_notes: input.notes,
      ...(input.copyVersionId ? { p_copy_version_id: input.copyVersionId } : {}),
    }),
  );
}

/*
 * `findUnchangedDesign` and `findDesignByAsset` are plain functions rather than `use<Thing>()`
 * hooks. Both are called from inside `mutation.mutationFn` in `project-action-design.tsx`, where a
 * hook cannot be called at all, so the contract's read rule cannot apply — see the `Reads that
 * cannot be hooks` rule in `docs/architecture/data-access.md` and this feature's `README.md`.
 *
 * Each runs on the submit that needs it, to decide whether the write that follows is a repeat of
 * one already stored. A hook would read on render instead — the answer would be cached from before
 * the upload it is meant to judge, and there is no component that wants the row on screen.
 */

/** The design row already holding exactly what this save would write, if there is one. */
export async function findUnchangedDesign(
  database: SupabaseDatabase,
  input: { id: string; title: string; content: Json; assetPath: string | null },
) {
  const query = database
    .from("designs")
    .select("id")
    .eq("id", input.id)
    .eq("title", input.title)
    .eq("content", JSON.stringify(input.content));
  return assertResult(
    await (input.assetPath
      ? query.eq("internal_asset_path", input.assetPath)
      : query.is("internal_asset_path", null)),
  );
}

/** The design in this version already carrying an uploaded artwork, so a retry does not add a second. */
export async function findDesignByAsset(
  database: SupabaseDatabase,
  input: { versionId: string; assetPath: string },
) {
  return assertResult(
    await database
      .from("designs")
      .select("id")
      .eq("version_id", input.versionId)
      .eq("internal_asset_path", input.assetPath),
  );
}

/** Saves an edited working design, refusing a save that would overwrite a concurrent edit. */
export async function updateWorkingDesign(
  database: SupabaseDatabase,
  input: {
    id: string;
    title: string;
    content: Json;
    assetPath: string | null;
    /** The values the form was opened on: the guard that makes the save a compare-and-set. */
    previousTitle: string;
    previousContent: Json;
    previousAssetPath: string | null;
  },
) {
  const query = database
    .from("designs")
    .update({ title: input.title, content: input.content, internal_asset_path: input.assetPath })
    .eq("id", input.id)
    .eq("title", input.previousTitle)
    .eq("content", JSON.stringify(input.previousContent));
  const result = await (
    input.previousAssetPath
      ? query.eq("internal_asset_path", input.previousAssetPath)
      : query.is("internal_asset_path", null)
  )
    .select("id")
    .single();
  if (result.error?.code === "PGRST116")
    throw new Error(
      "This design changed while you were editing. Close and reopen it before saving.",
    );
  assertResult(result);
}

/** Rewrites the design a repeated upload resolved to, instead of adding another one beside it. */
export async function updateDesignContent(
  database: SupabaseDatabase,
  input: { id: string; title: string; content: Json },
) {
  assertResult(
    await database
      .from("designs")
      .update({ title: input.title, content: input.content })
      .eq("id", input.id)
      .select("id")
      .single(),
  );
}

export async function addDesign(
  database: SupabaseDatabase,
  input: { versionId: string; title: string; content: Json; internalAssetPath: string | null },
) {
  assertResult(
    await database.rpc("add_design", {
      p_version_id: input.versionId,
      p_title: input.title,
      p_content: input.content,
      ...(input.internalAssetPath ? { p_internal_asset_path: input.internalAssetPath } : {}),
    }),
  );
}

export async function publishVersion(
  database: SupabaseDatabase,
  input: { versionId: string; releaseNote: string; assets: Record<string, string> },
): Promise<string> {
  return assertResult(
    await database.rpc("publish_version", {
      p_version_id: input.versionId,
      p_release_note: input.releaseNote,
      p_assets: input.assets,
      // No submission key: publish_version then treats one internal version as mapping to
      // exactly one client snapshot, so reopening this dialog and sharing an unchanged
      // version returns the existing publication instead of minting a second one. A caller
      // that genuinely wants a fresh snapshot of the same version still passes a key.
    }),
  );
}

export async function submitDesignVersion(
  database: SupabaseDatabase,
  input: { versionId: string },
) {
  assertResult(await database.rpc("submit_design_version", { p_version_id: input.versionId }));
}

export async function reviewPublication(
  database: SupabaseDatabase,
  input: { publicationId: string; decision: string; feedback: string },
) {
  assertResult(
    await database.rpc("review_publication", {
      p_publication_id: input.publicationId,
      p_decision: input.decision,
      p_feedback: input.feedback,
    }),
  );
}

/** Sets a version's Miro link on one channel; the agency-only RPC parses and validates the URL. */
export async function setMiroLink(
  database: SupabaseDatabase,
  input: { channel: ProjectChannel; versionId: string; url: string },
) {
  assertResult(
    input.channel === "client"
      ? await database.rpc("set_publication_miro_link", {
          p_publication_id: input.versionId,
          p_url: input.url,
        })
      : await database.rpc("set_version_miro_link", {
          p_version_id: input.versionId,
          p_url: input.url,
        }),
  );
}

export async function clearMiroLink(
  database: SupabaseDatabase,
  input: { channel: ProjectChannel; versionId: string },
) {
  assertResult(
    input.channel === "client"
      ? await database.rpc("clear_publication_miro_link", { p_publication_id: input.versionId })
      : await database.rpc("clear_version_miro_link", { p_version_id: input.versionId }),
  );
}

export async function createDesignBoard(
  database: SupabaseDatabase,
  input: {
    projectId: string;
    name: string;
    url: string;
    designerId: string;
    dueDate: string | null;
  },
) {
  return assertResult(
    await database.rpc("create_design_board", {
      p_project_id: input.projectId,
      p_name: input.name,
      p_url: input.url,
      p_designer_id: input.designerId,
      p_due_date: input.dueDate ?? undefined,
    }),
  );
}

export async function updateDesignBoard(
  database: SupabaseDatabase,
  input: { boardId: string; name: string; url: string; designerId: string; dueDate: string | null },
) {
  assertResult(
    await database.rpc("update_design_board", {
      p_board_id: input.boardId,
      p_name: input.name,
      p_url: input.url,
      p_designer_id: input.designerId,
      // Left out, the board's date is cleared.
      p_due_date: input.dueDate ?? undefined,
    }),
  );
}

/** "Send to studio": the next round of a design board. */
export async function sendBoardRound(
  database: SupabaseDatabase,
  input: { boardId: string; note: string; frameUrl: string; idempotencyKey: string },
) {
  return assertResult(
    await database.rpc("send_board_round", {
      p_board_id: input.boardId,
      p_note: input.note,
      ...(input.frameUrl ? { p_frame_url: input.frameUrl } : {}),
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}

/** Shares a project-level client version, from a round or directly. */
export async function shareMiroVersion(
  database: SupabaseDatabase,
  input: {
    projectId: string;
    url: string;
    note: string;
    sourceRoundId: string | null;
    idempotencyKey: string;
  },
) {
  return assertResult(
    await database.rpc("share_miro_version", {
      p_project_id: input.projectId,
      p_url: input.url,
      p_note: input.note,
      ...(input.sourceRoundId ? { p_source_round: input.sourceRoundId } : {}),
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}
