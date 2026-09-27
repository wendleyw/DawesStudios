/**
 * Reading a version row whichever table it came from.
 *
 * A project's versions arrive from one of two tables depending on the channel: `design_versions`
 * for the internal channel, `published_versions` for the client one. **The type split between
 * those two stays** — it is the channel boundary itself. What does not need stating twice is how
 * to read the three facts the two tables hold under different column names.
 *
 * Consumers today: `projects/project-data.ts` (`versionNote`, `versionDate`, `versionStatus`) and
 * the canonical e2e spec (`versionGroupKey`). Overview and Reviews read rounds and client versions
 * with their own named columns and no longer use this module; drop each export once its last
 * consumer goes.
 *
 * `published_versions` has no status column of its own: a published version's status lives on its
 * `publication_reviews` row, so the review status is passed in rather than looked up here; only
 * the `?? "pending"` default is shared.
 */

/** The internal channel's column names. */
type InternalVersionFields = { notes: string; created_at: string; status: string };
/** The client channel's column names for the same three facts, minus the status. */
type PublishedVersionFields = { release_note: string; published_at: string };

export type VersionRow = InternalVersionFields | PublishedVersionFields;

/** The note the author left on the version. */
export function versionNote(version: VersionRow): string {
  return "notes" in version ? version.notes : version.release_note;
}

/** The instant the version came into being on its channel. */
export function versionDate(version: VersionRow): string {
  return "created_at" in version ? version.created_at : version.published_at;
}

/**
 * The version's status. An internal version states its own; a published one takes it from its
 * review, and reads as `"pending"` until a review row exists.
 */
export function versionStatus(version: VersionRow, reviewStatus?: string | null): string {
  return "status" in version ? version.status : (reviewStatus ?? "pending");
}

/**
 * The group a version's history belongs to: its design board for a round, or the project itself
 * for a client version.
 */
export function versionGroupKey(row: { board_id?: string | null; project_id: string }): string {
  if (row.board_id) return `board:${row.board_id}`;
  return `project:${row.project_id}`;
}
