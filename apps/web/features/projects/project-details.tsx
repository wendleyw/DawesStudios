"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useBriefingRequester } from "@/features/briefings/briefing-data";
import { useCreditMonthSummaries } from "@/features/credits/credit-data";
import {
  creditMonthLabel,
  creditMonthOf,
  writableCreditMonths,
  type CreditMonthSummary,
} from "@/features/credits/credit-model";
import { CopyButton } from "@/features/shared/copy-button";
import { Modal } from "@/features/shared/modal";
import { personName, reviewDecisionLabel } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import { useDateFormat, versionStatusLabel } from "@/features/workspace/workspace-data";
import {
  assignDesigner,
  moveProjectMonth,
  MonthShortfallError,
  revokeDesignAssignment,
  settleProjectCredits,
  updateProjectDetails,
  useInvalidateProject,
  useInvalidateProjectCredits,
  useProjectAssignments,
  useProjectCredits,
  type TableRow,
  type CanvasVersion,
} from "./project-data";
import { ProjectPanelHeader } from "./project-panel";
import { ProjectCover } from "./project-cover";
import { FormError } from "@/features/shared/form-error";

/** A round reads "Round N" and a project-level client version "VN". */
function historyLabel(version: CanvasVersion): string {
  return version.boardId ? `Round ${version.number}` : `V${version.number}`;
}

export function ProjectDetails({
  project,
  deliverables,
  versions,
  onClose,
}: {
  project: TableRow<"projects">;
  deliverables: TableRow<"deliverables">[];
  versions: CanvasVersion[];
  onClose?: () => void;
}) {
  const { database, profile } = useAuth();
  const { formatDate } = useDateFormat();
  const invalidate = useInvalidateProject();
  const [editing, setEditing] = useState(false);
  const [editRevision, setEditRevision] = useState(project.updated_at);
  const [assigning, setAssigning] = useState(false);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const [creditDialog, setCreditDialog] = useState<"move" | "settle" | null>(null);
  const assignments = useProjectAssignments(project.id);
  // Billing is for the studio and the client; the read is off for a designer.
  const credits = useProjectCredits(project.id, project.credit_month);
  const creditState = profile?.role !== "designer" && project.credit_month ? credits.data : null;
  const settlement = creditState?.settlement ?? null;
  const canMove = !settlement && (creditState?.charged ?? 0) > 0;
  const canSettle =
    !settlement && (project.status === "approved" || project.status === "delivered");
  // Who asked for the work (and, below, who decided on each version): the studio and the client
  // only. Both reads are disabled for a designer, and `personName` names nobody to one.
  const people = useClientPeople(project.client_id);
  const requester = useBriefingRequester(project.briefing_id);
  const requesterName = personName(requester.data, people.data, profile?.role);
  const decisionLine = (version: CanvasVersion) =>
    version.reviewedBy && version.reviewedAt
      ? reviewDecisionLabel(
          version.status,
          personName(version.reviewedBy, people.data, profile?.role),
          formatDate(version.reviewedAt),
        )
      : null;
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const start = String(form.get("start")) || null;
      const due = String(form.get("due")) || null;
      if (start && due && due < start)
        throw new Error("The due date must be on or after the start date.");
      const title = String(form.get("title")).trim();
      if (!title) throw new Error("Add a project title.");
      await updateProjectDetails(database, {
        id: project.id,
        revision: editRevision,
        title,
        description: String(form.get("description")).trim(),
        startDate: start,
        dueDate: due,
      });
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
    onError: async () => {
      await invalidate();
    },
  });
  const assign = useMutation({
    mutationFn: async (designerId: string) =>
      assignDesigner(database, { projectId: project.id, designerId }),
    onSuccess: async () => {
      await assignments.refetch();
      setAssigning(false);
    },
  });
  const revoke = useMutation({
    mutationFn: async (designerId: string) =>
      revokeDesignAssignment(database, { projectId: project.id, designerId }),
    onSuccess: async () => {
      await assignments.refetch();
      setRevoking(null);
    },
  });
  const shareLink =
    typeof window === "undefined"
      ? `/projects/${project.id}?channel=client`
      : `${window.location.origin}/projects/${project.id}?channel=client`;

  return (
    <aside className="project-details" aria-label="Project details">
      <ProjectPanelHeader
        title="Project details"
        subtitle="Scope, timing and resources"
        onClose={onClose}
        actions={
          profile?.role === "agency" ? (
            <button
              className="icon-button"
              aria-label="Edit project details"
              onClick={() => {
                setEditRevision(project.updated_at);
                save.reset();
                setEditing(true);
              }}
            >
              <Pencil size={15} />
            </button>
          ) : undefined
        }
      />
      <div className="project-details-content">
        <ProjectCover projectId={project.id} />
        <p>{project.description || "No additional project notes yet."}</p>
        <dl>
          <dt>Service</dt>
          <dd>{project.service_type.replaceAll("-", " ")}</dd>
          {requesterName && (
            <>
              <dt>Requested by</dt>
              <dd>{requesterName}</dd>
            </>
          )}
          <dt>Starts</dt>
          <dd>{formatDate(project.start_date, "To be planned")}</dd>
          <dt>Due date</dt>
          <dd>{formatDate(project.due_date, "No due date")}</dd>
          <dt>Deliverables</dt>
          <dd>{deliverables.length}</dd>
          {creditState && project.credit_month && (
            <>
              <dt>Credits</dt>
              <dd>
                {creditState.charged} · {creditMonthLabel(project.credit_month)}
              </dd>
            </>
          )}
          {settlement && (
            <>
              <dt>Settled</dt>
              <dd>{settlementLine(settlement)}</dd>
              <dt>Reason</dt>
              <dd>{settlement.reason}</dd>
            </>
          )}
        </dl>
        {profile?.role === "agency" && (
          <div className="assignment-section">
            <h3>Designer</h3>
            {assignments.error ? (
              <p role="alert">Assignments could not be loaded.</p>
            ) : (
              <div>
                {assignments.data?.members
                  .filter((member) => assignments.data.assigned.includes(member.id))
                  .map((member) => (
                    <div className="details-heading" key={member.id}>
                      <span>{member.display_name}</span>
                      <button
                        className="button quiet"
                        aria-label={`Remove ${member.display_name} from project`}
                        disabled={revoke.isPending}
                        onClick={() => {
                          revoke.reset();
                          setRevoking({ id: member.id, name: member.display_name });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                {!assignments.data?.assigned.length && <p>Not assigned yet</p>}
              </div>
            )}
            <button className="button quiet" onClick={() => setAssigning(true)}>
              Assign a designer
            </button>
          </div>
        )}
        {profile?.role === "agency" && creditState && (canMove || canSettle) && (
          <div className="assignment-section">
            <h3>Credits</h3>
            {canMove && (
              <button className="button quiet" onClick={() => setCreditDialog("move")}>
                Move to another month
              </button>
            )}
            {canSettle && (
              <button className="button quiet" onClick={() => setCreditDialog("settle")}>
                Settle final credits
              </button>
            )}
          </div>
        )}
        {project.briefing_id && (
          <Link
            className="button"
            href={`/clients/${project.client_id}/briefings/${project.briefing_id}`}
          >
            View briefing
            <ArrowUpRight size={14} />
          </Link>
        )}
        <Link className="button quiet" href={`/clients/${project.client_id}/brand/overview`}>
          Brand direction
          <ArrowUpRight size={14} />
        </Link>
        <Link
          className="button quiet"
          href={`/clients/${project.client_id}/brand/files?project=${project.id}`}
        >
          Files
          <ArrowUpRight size={14} />
        </Link>
        {profile?.role !== "designer" && <CopyButton text={shareLink} label="Copy project link" />}
        <details className="project-history">
          <summary>Version history</summary>
          <ol>
            {versions
              .toSorted((a, b) => b.date.localeCompare(a.date))
              .map((version) => (
                <li key={version.id}>
                  <strong>{historyLabel(version)}</strong>
                  <span>
                    {decisionLine(version) ??
                      `${formatDate(version.date)} · ${versionStatusLabel(version.status)}`}
                  </span>
                  {version.note && <p>{version.note}</p>}
                </li>
              ))}
          </ol>
          {!versions.length && <p>The first version will appear here.</p>}
        </details>
      </div>
      <Modal
        open={editing}
        title="Project details"
        onClose={() => {
          if (!save.isPending) setEditing(false);
        }}
      >
        <form
          key={editRevision}
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(new FormData(event.currentTarget));
          }}
        >
          <label>
            Project title
            <input name="title" defaultValue={project.title} required maxLength={200} />
          </label>
          <label>
            Notes
            <textarea
              name="description"
              defaultValue={project.description}
              maxLength={5000}
              rows={4}
            />
          </label>
          <div className="form-row">
            <label>
              Start date
              <input type="date" name="start" defaultValue={project.start_date ?? ""} />
            </label>
            <label>
              Due date
              <input type="date" name="due" defaultValue={project.due_date ?? ""} />
            </label>
          </div>
          {/*
            The compare-and-set conflict reads as a sentence because `updateProjectDetails` turns
            the PGRST116 result into one before it returns; there is no second copy of that message
            here.
          */}
          {save.error && <FormError>{save.error.message}</FormError>}
          <div className="form-actions">
            <button
              className="button"
              type="button"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      </Modal>
      {/* Removing an assignment takes the designer's access to the project with it, so it asks
          first, like every other action in the product that destroys something. */}
      <Modal
        open={!!revoking}
        title="Remove this designer?"
        description="They will lose access to the working files and the studio conversation for this project."
        onClose={() => {
          if (!revoke.isPending) setRevoking(null);
        }}
      >
        <div className="form-actions">
          <button className="button" onClick={() => setRevoking(null)} disabled={revoke.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => revoking && revoke.mutate(revoking.id)}
            disabled={revoke.isPending}
          >
            {revoke.isPending ? "Removing…" : "Remove designer"}
          </button>
        </div>
        {revoke.error && <FormError>{revoke.error.message}</FormError>}
      </Modal>
      <Modal
        open={assigning}
        title="Assign a designer"
        description="This person will have access to the working files and studio conversation."
        onClose={() => {
          if (!assign.isPending) setAssigning(false);
        }}
      >
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            assign.mutate(String(new FormData(event.currentTarget).get("designer")));
          }}
        >
          <label>
            Designer
            <select name="designer" required defaultValue="">
              <option value="" disabled>
                Choose a designer
              </option>
              {assignments.data?.members
                .filter((member) => !assignments.data.assigned.includes(member.id))
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                  </option>
                ))}
            </select>
          </label>
          {assign.error && <FormError>{assign.error.message}</FormError>}
          <div className="form-actions">
            <button className="button primary" type="submit" disabled={assign.isPending}>
              Assign designer
            </button>
          </div>
        </form>
      </Modal>
      {creditDialog === "move" && creditState && project.credit_month && (
        <MoveMonthDialog
          project={project}
          fromMonth={project.credit_month}
          charged={creditState.charged}
          onClose={() => setCreditDialog(null)}
        />
      )}
      {creditDialog === "settle" && creditState && (
        <SettleCreditsDialog
          project={project}
          charged={creditState.charged}
          onClose={() => setCreditDialog(null)}
        />
      )}
    </aside>
  );
}

/**
 * What settling changed, beside the Credits line that already shows the final total: "3 more
 * charged to September 2026", "2 refunded to September 2026" or "No change".
 */
function settlementLine(settlement: { difference: number; charged_month: string | null }): string {
  const month = settlement.charged_month ? creditMonthLabel(settlement.charged_month) : "";
  if (settlement.difference > 0) return `${settlement.difference} more charged to ${month}`;
  if (settlement.difference < 0) return `${-settlement.difference} refunded to ${month}`;
  return "No change";
}

/** "October 2026 · 40 available" once the month's figures are in. */
function monthOption(month: string, summary: CreditMonthSummary | undefined): string {
  return summary
    ? `${creditMonthLabel(month)} · ${summary.available} available`
    : creditMonthLabel(month);
}

/**
 * Moves the project's charge to another open month. An open origin month gets its credits back; an
 * expired one does not, so the move then asks the studio to confirm charging the full amount again.
 */
function MoveMonthDialog({
  project,
  fromMonth,
  charged,
  onClose,
}: {
  project: TableRow<"projects">;
  fromMonth: string;
  charged: number;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateProjectCredits();
  const months = useMemo(() => writableCreditMonths(creditMonthOf(new Date())), []);
  const choices = months.filter((month) => month !== fromMonth);
  const summaries = useCreditMonthSummaries(project.client_id, months);
  const [target, setTarget] = useState(choices[0]);
  const [chargeFull, setChargeFull] = useState(false);
  // One key for the whole dialog opening, not one per chosen target: if a first attempt's outcome
  // is unknown (its response was lost) and the studio picks another month before retrying, reusing
  // this same key makes the database reject the retry as a month mismatch instead of moving the
  // project a second time. The dialog closes and reopens (a fresh key) to try again.
  const [attempt] = useState(() => crypto.randomUUID());
  const originExpired = fromMonth < months[0];
  const available = summaries.data?.[months.indexOf(target)]?.available;
  const short = available !== undefined && available < charged;
  const from = creditMonthLabel(fromMonth);
  const to = creditMonthLabel(target);
  const move = useMutation({
    mutationFn: async () =>
      moveProjectMonth(database, {
        projectId: project.id,
        toMonth: target,
        chargeFull: originExpired && chargeFull,
        idempotencyKey: `move:${project.id}:${attempt}`,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Move to another month"
      description={`The project is charged ${charged} credits to ${from}.`}
      onClose={() => {
        if (!move.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          move.mutate();
        }}
      >
        <label>
          New month
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            {choices.map((month) => (
              <option key={month} value={month}>
                {monthOption(month, summaries.data?.[months.indexOf(month)])}
              </option>
            ))}
          </select>
        </label>
        {originExpired ? (
          <>
            <p>
              {from} has ended and its credits expired, so they are not returned. Moving charges the
              full {charged} credits to {to}.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={chargeFull}
                onChange={(event) => setChargeFull(event.target.checked)}
              />
              Charge the full {charged} credits to {to}
            </label>
          </>
        ) : (
          <p>
            {charged} credits return to {from} and are charged to {to}.
          </p>
        )}
        {short && (
          <p className="form-error">
            {to} has {available} credits available; {charged - available} more are needed.
          </p>
        )}
        {move.error && <FormError>{move.error.message}</FormError>}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose} disabled={move.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={
              move.isPending || summaries.isPending || short || (originExpired && !chargeFull)
            }
          >
            {move.isPending ? "Moving…" : `Move to ${to}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Settles the project's final credits once, with a reason the client reads. Extra cost comes from
 * the current month; when that month is short, the dialog names the shortfall and offers a later
 * month to charge instead. A refund always returns to the current month.
 */
function SettleCreditsDialog({
  project,
  charged,
  onClose,
}: {
  project: TableRow<"projects">;
  charged: number;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateProjectCredits();
  const months = useMemo(() => writableCreditMonths(creditMonthOf(new Date())), []);
  const [finalCredits, setFinalCredits] = useState(String(charged));
  const [reason, setReason] = useState("");
  const [chargeMonth, setChargeMonth] = useState<string | null>(null);
  const [attempt] = useState(() => crypto.randomUUID());
  const summaries = useCreditMonthSummaries(project.client_id, months, chargeMonth !== null);
  const total = Number(finalCredits);
  const difference = Number.isSafeInteger(total) ? total - charged : 0;
  const current = creditMonthLabel(months[0]);
  const settle = useMutation({
    mutationFn: async () => {
      if (!Number.isSafeInteger(total) || total < 0)
        throw new Error("Enter the final total as a whole number of credits.");
      if (!reason.trim()) throw new Error("Explain the final total to the client.");
      return settleProjectCredits(database, {
        projectId: project.id,
        finalCredits: total,
        reason: reason.trim(),
        chargeMonth,
        idempotencyKey: `settle:${project.id}:${attempt}`,
      });
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
    onError: (error) => {
      // A shortfall opens the charge-month choice on the short month, so the studio picks another.
      if (error instanceof MonthShortfallError && chargeMonth === null)
        setChargeMonth(error.month || months[0]);
    },
  });
  const shortfall = settle.error instanceof MonthShortfallError ? settle.error : null;
  return (
    <Modal
      open
      title="Settle final credits"
      description={`The project is charged ${charged} credits. Enter its final total once; the client sees the reason.`}
      onClose={() => {
        if (!settle.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          settle.mutate();
        }}
      >
        <label>
          Final total
          <input
            type="number"
            min={0}
            step={1}
            required
            value={finalCredits}
            onChange={(event) => setFinalCredits(event.target.value)}
          />
        </label>
        <label>
          Reason
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What the final total covers"
          />
        </label>
        <p>
          {difference > 0
            ? `${difference} more credits will be charged to ${creditMonthLabel(chargeMonth ?? months[0])}.`
            : difference < 0
              ? `${-difference} credits will be refunded to ${current}.`
              : "The charge stays the same."}
        </p>
        {chargeMonth !== null && (
          <label>
            Charge month
            <select value={chargeMonth} onChange={(event) => setChargeMonth(event.target.value)}>
              {months.map((month, index) => (
                <option key={month} value={month}>
                  {monthOption(month, summaries.data?.[index])}
                </option>
              ))}
            </select>
          </label>
        )}
        {shortfall ? (
          <FormError>
            {creditMonthLabel(shortfall.month || months[0])} has {shortfall.available} credits
            available, {shortfall.shortfall} short. Choose another charge month, or add an extra on
            the Credits page and try again.
          </FormError>
        ) : (
          settle.error && <FormError>{settle.error.message}</FormError>
        )}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose} disabled={settle.isPending}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={settle.isPending}>
            {settle.isPending ? "Settling…" : "Settle credits"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
