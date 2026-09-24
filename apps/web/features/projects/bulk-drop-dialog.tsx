"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { discardUnreferencedArtwork, uploadArtwork } from "./artwork-files";
import { addDesign, createDesignVersion, useInvalidateProject } from "./project-data";
import {
  buildDeliverablePlans,
  buildDesignContent,
  classifyFiles,
  latestVersionPerDeliverable,
  type BulkDropDeliverable,
  type ClassifiedFiles,
  type DeliverablePlan,
  type VersionChoice,
} from "./bulk-drop-model";
import {
  runBulkDrop,
  type BulkDropDependencies,
  type BulkDropResult,
  type DeliverableRun,
  type FileStatus,
  type UploadFileTask,
} from "./bulk-drop-upload";

/** The browser's own way to read an image's pixel size, wrapped to match `DimensionReader`. */
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

type UnmatchedAssignment = { deliverableId: string } | { skipped: true };

/**
 * Confirms a bulk image drop: one block per affected deliverable with its version choice, a picker
 * for images no deliverable matched (or that two matched equally), the files that cannot be added
 * with their reasons, and per-file progress with a retry limited to the failed files.
 *
 * A version counts as shared with the client once `publish_version` has marked it `reviewed`; the
 * default then becomes a new version. Mount one instance per drop: its state belongs to that drop.
 */
export function BulkDropDialog({
  projectId,
  deliverables,
  versions,
  files,
  onClose,
}: {
  projectId: string;
  deliverables: BulkDropDeliverable[];
  versions: { id: string; deliverableId: string; number: number; status: string }[];
  files: File[] | null;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateProject();
  const open = !!files && files.length > 0;
  const [classified, setClassified] = useState<ClassifiedFiles | null>(null);
  const [assignments, setAssignments] = useState<Record<string, UnmatchedAssignment>>({});
  const [choices, setChoices] = useState<Record<string, VersionChoice>>({});
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>({});
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<BulkDropResult | null>(null);
  // The plans a run used. The project refreshes after a run (a new version becomes the latest), so
  // the blocks and any retry keep to what the person confirmed instead of recomputing.
  const [confirmedPlans, setConfirmedPlans] = useState<DeliverablePlan[] | null>(null);
  // Read by the running drop between files, so it must not be a render-time snapshot.
  const cancelledRef = useRef(false);
  const [taskIds] = useState(() => new Map<File, string>());

  useEffect(() => {
    if (!files?.length) return;
    let live = true;
    void classifyFiles(files, deliverables, readImageDimensions).then((result) => {
      if (live) setClassified(result);
    });
    return () => {
      live = false;
    };
  }, [files, deliverables]);

  const currentVersions = useMemo(() => latestVersionPerDeliverable(versions), [versions]);

  const draftPlans: DeliverablePlan[] = useMemo(() => {
    if (!classified) return [];
    const handAssigned = [...classified.tied, ...classified.unmatched].flatMap(({ file }) => {
      const assignment = assignments[fileKey(file)];
      return assignment && "deliverableId" in assignment
        ? [{ file, deliverableId: assignment.deliverableId }]
        : [];
    });
    return buildDeliverablePlans(
      [...classified.matched, ...handAssigned],
      deliverables,
      currentVersions,
      (deliverableId, versionNumber) =>
        versions.some(
          (version) =>
            version.deliverableId === deliverableId &&
            version.number === versionNumber &&
            version.status === "reviewed",
        ),
    );
  }, [classified, assignments, deliverables, currentVersions, versions]);
  const plans = confirmedPlans ?? draftPlans;

  const needsAssignment = classified ? [...classified.tied, ...classified.unmatched] : [];
  const everyNeedsAssignmentResolved = needsAssignment.every(
    (entry) => !!assignments[fileKey(entry.file)],
  );
  const totalFiles = plans.reduce((count, plan) => count + plan.files.length, 0);
  const started = running || lastResult !== null;
  const canConfirm = !!classified && totalFiles > 0 && everyNeedsAssignmentResolved && !started;

  function choiceFor(plan: DeliverablePlan): VersionChoice {
    return choices[plan.deliverableId] ?? plan.defaultChoice;
  }

  function idFor(file: File): string {
    let id = taskIds.get(file);
    if (!id) {
      id = crypto.randomUUID();
      taskIds.set(file, id);
    }
    return id;
  }

  function dependencies(): BulkDropDependencies {
    return {
      uploadArtwork: (file) => uploadArtwork(database, projectId, file),
      discardUnreferencedArtwork: (path) => discardUnreferencedArtwork(database, path),
      createDesignVersion: (deliverableId) =>
        createDesignVersion(database, { deliverableId, notes: "" }),
      addDesign: (versionId, title, assetPath) =>
        addDesign(database, {
          versionId,
          title,
          content: buildDesignContent(title),
          internalAssetPath: assetPath,
        }),
    };
  }

  function buildRuns(onlyFileIds?: Set<string>): DeliverableRun[] {
    return plans
      .map((plan) => {
        const planFiles: UploadFileTask[] = plan.files
          .map((file) => ({ id: idFor(file), file }))
          .filter((task) => !onlyFileIds || onlyFileIds.has(task.id));
        return {
          deliverableId: plan.deliverableId,
          deliverableName: plan.deliverableName,
          versionChoice: choiceFor(plan),
          currentVersionId: plan.currentVersion?.versionId,
          files: planFiles,
        };
      })
      .filter((run) => run.files.length > 0);
  }

  async function run(onlyFileIds?: Set<string>) {
    cancelledRef.current = false;
    setConfirmedPlans(plans);
    setRunning(true);
    try {
      const result = await runBulkDrop(dependencies(), buildRuns(onlyFileIds), {
        isCancelled: () => cancelledRef.current,
        knownVersionIds: lastResult?.resolvedVersionIds,
        onFileStatus: (id, status) => setStatuses((current) => ({ ...current, [id]: status })),
      });
      setLastResult(result);
    } finally {
      setRunning(false);
      await invalidate();
    }
  }

  function retry() {
    const failedIds = new Set(
      Object.entries(statuses)
        .filter(([, status]) => status.state === "failed")
        .map(([id]) => id),
    );
    void run(failedIds);
  }

  const doneCount = Object.values(statuses).filter((status) => status.state === "done").length;
  const failedCount = Object.values(statuses).filter((status) => status.state === "failed").length;
  const finished = lastResult !== null && !running;

  return (
    <Modal
      open={open}
      onClose={() => !running && onClose()}
      title="Add images"
      size="lg"
      closeDisabled={running}
    >
      {!classified ? (
        <p>Reading dropped files…</p>
      ) : (
        <div className="stack-form bulk-drop-dialog">
          {plans.map((plan) => {
            const deliverable = deliverables.find((entry) => entry.id === plan.deliverableId);
            return (
              <fieldset className="bulk-drop-group" key={plan.deliverableId}>
                <legend>
                  <strong>{plan.deliverableName}</strong>{" "}
                  <span>
                    {deliverable?.width && deliverable.height
                      ? `${deliverable.width} × ${deliverable.height} · `
                      : ""}
                    {plan.files.length} image{plan.files.length === 1 ? "" : "s"}
                  </span>
                </legend>
                {plan.askChoice && plan.currentVersion ? (
                  <div
                    className="bulk-drop-choice"
                    role="radiogroup"
                    aria-label={`Version for ${plan.deliverableName}`}
                  >
                    <label className="checkbox-label">
                      <input
                        type="radio"
                        name={`version-${plan.deliverableId}`}
                        checked={choiceFor(plan) === "current"}
                        disabled={started}
                        onChange={() =>
                          setChoices((current) => ({ ...current, [plan.deliverableId]: "current" }))
                        }
                      />
                      Add to V{plan.currentVersion.number}
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="radio"
                        name={`version-${plan.deliverableId}`}
                        checked={choiceFor(plan) === "new"}
                        disabled={started}
                        onChange={() =>
                          setChoices((current) => ({ ...current, [plan.deliverableId]: "new" }))
                        }
                      />
                      Create V{plan.currentVersion.number + 1}
                    </label>
                  </div>
                ) : (
                  <p className="bulk-drop-note">Creates V1, the first version.</p>
                )}
                <ul className="bulk-drop-files">
                  {plan.files.map((file) => {
                    const status = statuses[idFor(file)];
                    return (
                      <li key={fileKey(file)}>
                        <span>{file.name}</span>
                        {status && (
                          <span className={`bulk-drop-status is-${status.state}`}>
                            {statusLabel(status)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}

          {needsAssignment.length > 0 && (
            <fieldset className="bulk-drop-group">
              <legend>
                <strong>Needs a deliverable</strong>
              </legend>
              <ul className="bulk-drop-files">
                {needsAssignment.map(({ file }) => {
                  const assignment = assignments[fileKey(file)];
                  return (
                    <li key={fileKey(file)}>
                      <span>{file.name}</span>
                      <select
                        aria-label={`Deliverable for ${file.name}`}
                        value={
                          assignment && "deliverableId" in assignment
                            ? assignment.deliverableId
                            : ""
                        }
                        disabled={started}
                        onChange={(event) =>
                          setAssignments((current) => ({
                            ...current,
                            [fileKey(file)]: { deliverableId: event.target.value },
                          }))
                        }
                      >
                        <option value="">Choose a deliverable…</option>
                        {deliverables.map((deliverable) => (
                          <option key={deliverable.id} value={deliverable.id}>
                            {deliverable.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="button quiet"
                        aria-label={`Skip ${file.name}`}
                        aria-pressed={!!assignment && "skipped" in assignment}
                        disabled={started}
                        onClick={() =>
                          setAssignments((current) => ({
                            ...current,
                            [fileKey(file)]: { skipped: true },
                          }))
                        }
                      >
                        {assignment && "skipped" in assignment ? "Skipped" : "Skip"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          {classified.rejected.length > 0 && (
            <fieldset className="bulk-drop-group">
              <legend>
                <strong>Not added</strong>
              </legend>
              <ul className="bulk-drop-files">
                {classified.rejected.map(({ file, reason }) => (
                  <li key={fileKey(file)}>
                    <span>{file.name}</span>
                    <span className="bulk-drop-status">{reason}</span>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {finished && (
            <p className="bulk-drop-summary" aria-live="polite">
              {doneCount} added{failedCount > 0 ? ` · ${failedCount} failed` : ""}
              {lastResult?.permissionDenied &&
                " · You no longer have production access to this project."}
            </p>
          )}

          <div className="form-actions">
            {running ? (
              <button
                type="button"
                className="button"
                onClick={() => {
                  cancelledRef.current = true;
                }}
              >
                Cancel
              </button>
            ) : (
              <button type="button" className="button" onClick={onClose}>
                Close
              </button>
            )}
            {finished && failedCount > 0 && !lastResult?.permissionDenied && (
              <button type="button" className="button primary" onClick={retry}>
                Try again
              </button>
            )}
            {!started && (
              <button
                type="button"
                className="button primary"
                disabled={!canConfirm}
                onClick={() => void run()}
              >
                {`Add ${totalFiles} image${totalFiles === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

const statusLabels = {
  queued: "Waiting",
  uploading: "Uploading…",
  done: "Added",
  blocked: "Stopped",
  cancelled: "Cancelled",
} as const;

function statusLabel(status: FileStatus): string {
  return status.state === "failed" ? status.message : statusLabels[status.state];
}
