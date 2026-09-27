"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@database";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import { versionDate, versionNote, versionStatus } from "@/features/shared/version-row";
import { assertCreditResult, parseErrorDetails } from "@/features/credits/credit-model";
import type { MiroLink } from "./miro-links";

/**
 * Supabase access for a project: the Miro workspace's versions, boards and links, its two comment
 * channels, the designers assigned to it, its cover, and every write the workspace and its dialogs
 * perform.
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
export type CanvasComment = {
  id: string;
  body: string;
  label: string;
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

export function useProjectDetail(projectId: string, channel: ProjectChannel) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, projectId, channel],
    enabled: !!session,
    queryFn: async () => {
      const clientChannel = channel === "client" || profile?.role === "client";
      const [project, deliverables, versionResult, reviewResult] = await Promise.all([
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
        database.from("publication_reviews").select("*").eq("project_id", projectId),
      ]);
      if (versionResult.error) throw new Error(versionResult.error.message);
      const miroLinks = await readMiroLinks(database, clientChannel ? "client" : "internal", {
        projectId,
      });
      const versions = toCanvasVersions(
        versionResult.data,
        reviewResult.data ?? [],
        clientChannel,
        miroLinks,
      );
      return {
        project: assertResult(project),
        deliverables: assertResult(deliverables),
        versions,
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
 * The four fields a comment has whichever channel it came from. The fifth, `label`, is the one
 * thing the two channels must not share: a client comment carries the author label the client
 * wrote it under, while an internal comment resolves to the reader's own name or the anonymous
 * "Studio team" — never a designer's identity. It is passed in, so the two label rules stay
 * separate and visible at the two call sites that own them.
 */
function toCanvasComment(
  comment: {
    id: string;
    body: string;
    resolved: boolean;
    created_at: string;
  },
  label: string,
): CanvasComment {
  return {
    id: comment.id,
    body: comment.body,
    label,
    resolved: comment.resolved,
    createdAt: comment.created_at,
  };
}

export function useProjectComments(projectId: string, channel: ProjectChannel, versionId?: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["comments", session?.user.id, projectId, channel, versionId ?? "all"],
    enabled: !!session,
    queryFn: async () => {
      if (channel === "client") {
        const query = database
          .from("client_comments")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at");
        // Comments pinned to a legacy design are not part of any conversation shown today.
        const scoped = query.is("design_id", null);
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
      const scoped = query.is("design_id", null);
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

export type ProjectCover = { storagePath: string; clientVisible: boolean; url: string };

/** A cover is always a still PNG: a short-lived signed URL, renewed before it expires. */
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

// Credits ------------------------------------------------------------------------------------------

/** The settlement columns granted to readers; `settled_by` and the idempotency key stay private. */
const settlementColumns = "project_id,final_credits,difference,reason,charged_month,settled_at";
export type ProjectSettlement = Pick<
  TableRow<"project_settlements">,
  "project_id" | "final_credits" | "difference" | "reason" | "charged_month" | "settled_at"
>;
type ProjectLedgerEntry = Pick<TableRow<"credit_ledger">, "amount" | "kind" | "month">;

/**
 * What a project is charged now, read the way `settle_project_credits` reads it: its debits and
 * refunds in its current credit month, plus any final adjustment. A debit left in an expired month
 * by a confirmed move stays spent but is not part of the project's charge.
 */
export function projectCreditCharge(
  entries: ProjectLedgerEntry[],
  creditMonth: string | null,
): number {
  return -entries
    .filter(
      (entry) =>
        entry.kind === "final_adjustment" ||
        (entry.month === creditMonth &&
          (entry.kind === "project_debit" || entry.kind === "project_refund")),
    )
    .reduce((total, entry) => total + entry.amount, 0);
}

/**
 * The project's credit charge and its settlement, for the agency and the client. Designers never
 * read billing, so the query stays off for them (and the policies return nothing to one anyway).
 * Keyed under `credit-ledger`, owned by `features/credits`, so the writes below refresh it through
 * `useInvalidateProjectCredits` together with every other ledger view.
 */
export function useProjectCredits(projectId: string, creditMonth: string | null) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: ["credit-ledger", session?.user.id, "project-charge", projectId, creditMonth],
    enabled: !!session && !!profile && profile.role !== "designer",
    queryFn: async () => {
      const [entries, settlement] = await Promise.all([
        database.from("credit_ledger").select("amount,kind,month").eq("project_id", projectId),
        database
          .from("project_settlements")
          .select(settlementColumns)
          .eq("project_id", projectId)
          .maybeSingle(),
      ]);
      return {
        charged: projectCreditCharge(assertResult(entries) as ProjectLedgerEntry[], creditMonth),
        settlement: assertResult(settlement) as ProjectSettlement | null,
      };
    },
  });
}

/**
 * Refreshes what moving or settling a project changes: the client's balances and ledger (keys
 * `features/credits` owns, named here because its `useInvalidateCredits()` would also refetch credit
 * requests, which neither write touches) and the project itself (`credit_month`, the notification a
 * settlement sends).
 */
export function useInvalidateProjectCredits() {
  const queryClient = useQueryClient();
  const invalidateProject = useInvalidateProject();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["credit-account"] }),
      queryClient.invalidateQueries({ queryKey: ["credit-ledger"] }),
      invalidateProject(),
    ]);
  };
}

/**
 * Moves a project's charge to another open month: `move_project_month` refunds the old month while
 * it is open and debits the new one in one transaction. When the old month has expired its credits
 * are gone, so the procedure debits the new month in full only with `chargeFull` confirmed. The key
 * makes a retry return the same move.
 *
 * Goes through `assertCreditResult` (`features/credits/credit-model.ts`), not the plain
 * `assertResult` other writes in this file use, so a month outside the writable range or a target
 * month that is short reads as a sentence (`describeCreditError`) instead of surfacing the
 * database's raw `insufficient_month_credits` token.
 */
export async function moveProjectMonth(
  database: SupabaseDatabase,
  input: { projectId: string; toMonth: string; chargeFull: boolean; idempotencyKey: string },
) {
  return assertCreditResult(
    await database.rpc("move_project_month", {
      p_project_id: input.projectId,
      p_to_month: input.toMonth,
      p_idempotency_key: input.idempotencyKey,
      p_charge_full: input.chargeFull,
    }),
  );
}

/** The month a settlement's extra cost could not be charged to, as `insufficient_month_credits` reports it. */
export class MonthShortfallError extends Error {
  constructor(
    readonly month: string,
    readonly available: number,
    readonly shortfall: number,
  ) {
    super(`The month is ${shortfall} credits short.`);
    this.name = "MonthShortfallError";
  }
}

/**
 * Settles a project's final credits once, at approval or delivery. Extra cost is charged to
 * `chargeMonth` (the current month when null); a refund always returns to the current month. When
 * the charge month is short, the procedure raises `insufficient_month_credits` with the month, its
 * available credits and the shortfall in the error detail; that becomes a `MonthShortfallError` so
 * the dialog can offer another month. Nothing is written in that case, so the same key is retried.
 */
export async function settleProjectCredits(
  database: SupabaseDatabase,
  input: {
    projectId: string;
    finalCredits: number;
    reason: string;
    chargeMonth: string | null;
    idempotencyKey: string;
  },
) {
  const result = await database.rpc("settle_project_credits", {
    p_project_id: input.projectId,
    p_final_credits: input.finalCredits,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    ...(input.chargeMonth ? { p_charge_month: input.chargeMonth } : {}),
  });
  if (result.error?.message === "insufficient_month_credits") {
    const detail =
      parseErrorDetails<{
        month?: string;
        available?: number;
        shortfall?: number;
      }>(result.error.details) ?? {};
    throw new MonthShortfallError(
      detail.month ?? input.chargeMonth ?? "",
      detail.available ?? 0,
      detail.shortfall ?? 0,
    );
  }
  return assertResult(result) as ProjectSettlement;
}
