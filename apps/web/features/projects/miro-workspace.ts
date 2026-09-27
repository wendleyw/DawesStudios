import type { MiroLink } from "./miro-links";
import type { CanvasVersion } from "./project-data";

/**
 * The Miro workspace's rules. Rounds are internal versions with a design board; shared versions
 * are client versions with no deliverable and no board. Legacy per-deliverable versions are never
 * shown.
 */
const newestFirst = (a: CanvasVersion, b: CanvasVersion) => b.number - a.number;

export function boardRounds(versions: CanvasVersion[], boardId: string): CanvasVersion[] {
  return versions
    .filter((version) => version.boardId === boardId && !!version.miro)
    .sort(newestFirst);
}

export function sharedVersions(versions: CanvasVersion[]): CanvasVersion[] {
  return versions
    .filter(
      (version) => version.deliverableId === null && version.boardId === null && !!version.miro,
    )
    .sort(newestFirst);
}

export function pickById<T extends { id: string }>(items: T[], id: string | null): T | null {
  return items.find((item) => item.id === id) ?? items[0] ?? null;
}

/** A client decides on the latest shared version while it waits for them, until delivery. */
export function canReviewShared(
  version: CanvasVersion,
  shared: CanvasVersion[],
  role: string | undefined,
  projectStatus: string,
): boolean {
  return (
    role === "client" &&
    shared[0]?.id === version.id &&
    version.status === "pending" &&
    projectStatus !== "delivered"
  );
}

export function latestSharedLink(shared: CanvasVersion[]): MiroLink | null {
  return shared[0]?.miro ?? null;
}
