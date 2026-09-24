/**
 * Drives the actual upload/registration work for a confirmed bulk drop. Every side effect goes
 * through the injected `BulkDropDependencies` — this module imports neither Supabase nor React, so
 * it is unit-tested with plain fakes. See `bulk-drop-dialog.tsx` for the real dependencies, built
 * from `artwork-files.ts` and `project-data.ts`.
 *
 * docs/superpowers/specs/2026-09-23-bulk-image-drop-design.md
 */
import { BULK_DROP_CONCURRENCY, deriveDesignTitle } from "./bulk-drop-model";

export type UploadFileTask = { id: string; file: File };

export type DeliverableRun = {
  deliverableId: string;
  deliverableName: string;
  versionChoice: "current" | "new";
  /** Required when `versionChoice` is `"current"`. */
  currentVersionId?: string;
  /** Already naturally sorted by `bulk-drop-model.ts`'s `buildDeliverablePlans`. */
  files: UploadFileTask[];
};

export type FileStatus =
  | { state: "queued" }
  | { state: "uploading" }
  | { state: "done" }
  | { state: "failed"; message: string }
  | { state: "blocked" }
  | { state: "cancelled" };

export type BulkDropDependencies = {
  uploadArtwork: (file: File) => Promise<string>;
  discardUnreferencedArtwork: (path: string) => Promise<void>;
  createDesignVersion: (deliverableId: string) => Promise<string>;
  addDesign: (versionId: string, title: string, assetPath: string) => Promise<void>;
};

export type BulkDropOptions = {
  concurrency?: number;
  isCancelled?: () => boolean;
  /** Deliverable ids whose version was already created by an earlier attempt (a retry). */
  knownVersionIds?: Record<string, string>;
  onFileStatus?: (fileId: string, status: FileStatus) => void;
};

export type BulkDropResult = {
  resolvedVersionIds: Record<string, string>;
  outcomes: Record<string, FileStatus>;
  permissionDenied: boolean;
};

const PERMISSION_DENIED_MESSAGE = "Production access required";

/** Matches the exact message `create_design_version`/`add_design` raise for `private.can_produce` failing. */
export function isPermissionDeniedError(error: unknown): boolean {
  return error instanceof Error && error.message === PERMISSION_DENIED_MESSAGE;
}

/** A counting semaphore: at most `limit` runs at once; the rest wait their turn in call order. */
function createLimiter(limit: number) {
  let active = 0;
  const waiters: (() => void)[] = [];
  return async function withSlot<T>(run: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
    try {
      return await run();
    } finally {
      active--;
      waiters.shift()?.();
    }
  };
}

type UploadOutcome =
  { kind: "stored"; path: string } | { kind: "failed"; message: string } | { kind: "stopped" };

/**
 * Uploads every file with at most `concurrency` in flight across the whole drop, and registers
 * each deliverable's files strictly in their natural order: `add_design` numbers a design by
 * counting the version's rows without a lock, so one deliverable's registrations must never
 * overlap, while its uploads may.
 *
 * A new version is created just before a deliverable's first registration, so a deliverable whose
 * uploads all fail leaves no empty version. Cancelling stops the files still waiting for an upload
 * slot; a file already uploading finishes and is registered. A permission refusal stops the whole
 * drop: nothing further is uploaded or registered. Every stored file that ends up unregistered is
 * discarded, so no orphan is left behind.
 */
export async function runBulkDrop(
  deps: BulkDropDependencies,
  runs: DeliverableRun[],
  options: BulkDropOptions = {},
): Promise<BulkDropResult> {
  const withUploadSlot = createLimiter(options.concurrency ?? BULK_DROP_CONCURRENCY);
  const isCancelled = options.isCancelled ?? (() => false);
  const onFileStatus = options.onFileStatus ?? (() => {});
  const resolvedVersionIds: Record<string, string> = { ...options.knownVersionIds };
  const outcomes: Record<string, FileStatus> = {};
  let permissionDenied = false;

  function setStatus(id: string, status: FileStatus) {
    outcomes[id] = status;
    onFileStatus(id, status);
  }

  function upload(task: UploadFileTask): Promise<UploadOutcome> {
    return withUploadSlot(async () => {
      if (isCancelled() || permissionDenied) return { kind: "stopped" };
      setStatus(task.id, { state: "uploading" });
      try {
        return { kind: "stored", path: await deps.uploadArtwork(task.file) };
      } catch (error) {
        return {
          kind: "failed",
          message: error instanceof Error ? error.message : "The upload failed.",
        };
      }
    });
  }

  async function walk(run: DeliverableRun) {
    const uploads = run.files.map(upload);
    let versionId =
      run.versionChoice === "current"
        ? run.currentVersionId
        : resolvedVersionIds[run.deliverableId];
    let versionFailure: string | undefined;
    for (const [index, task] of run.files.entries()) {
      const outcome = await uploads[index];
      if (outcome.kind === "stopped") {
        setStatus(task.id, permissionDenied ? { state: "blocked" } : { state: "cancelled" });
        continue;
      }
      if (outcome.kind === "failed") {
        setStatus(task.id, { state: "failed", message: outcome.message });
        continue;
      }
      if (permissionDenied) {
        await deps.discardUnreferencedArtwork(outcome.path).catch(() => {});
        setStatus(task.id, { state: "blocked" });
        continue;
      }
      if (!versionId && !versionFailure) {
        try {
          versionId = await deps.createDesignVersion(run.deliverableId);
          resolvedVersionIds[run.deliverableId] = versionId;
        } catch (error) {
          if (isPermissionDeniedError(error)) permissionDenied = true;
          versionFailure =
            error instanceof Error ? error.message : "Could not create the new version.";
        }
      }
      if (!versionId) {
        await deps.discardUnreferencedArtwork(outcome.path).catch(() => {});
        setStatus(task.id, {
          state: "failed",
          message: versionFailure ?? "Could not create the new version.",
        });
        continue;
      }
      try {
        await deps.addDesign(versionId, deriveDesignTitle(task.file.name), outcome.path);
        setStatus(task.id, { state: "done" });
      } catch (error) {
        if (isPermissionDeniedError(error)) permissionDenied = true;
        await deps.discardUnreferencedArtwork(outcome.path).catch(() => {});
        setStatus(task.id, {
          state: "failed",
          message: error instanceof Error ? error.message : "The design could not be registered.",
        });
      }
    }
  }

  await Promise.all(runs.map(walk));
  return { resolvedVersionIds, outcomes, permissionDenied };
}
