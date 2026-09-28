"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useInvalidateAssets } from "@/features/assets/asset-data";
import { useAuth } from "@/features/auth/auth-provider";
import { useBriefingRequester } from "@/features/briefings/briefing-data";
import { services } from "@/features/briefings/briefing-model";
import { creditMonthLabel } from "@/features/credits/credit-model";
import { CopyButton } from "@/features/shared/copy-button";
import { Modal } from "@/features/shared/modal";
import { personName, reviewDecisionLabel } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import { useDateFormat, versionStatusLabel } from "@/features/workspace/workspace-data";
import {
  assignDesigner,
  revokeDesignAssignment,
  saveProjectDetailsWithActivity,
  useInvalidateProject,
  useProjectAssignments,
  useProjectCredits,
  useProjectDriveLinks,
  useProjectWorkflow,
  type ProjectChannel,
  type TableRow,
  type CanvasVersion,
} from "./project-data";
import { ProductionBrief } from "./production-brief";
import type { DesignBoard } from "./project-data";
import { ProjectBriefing } from "./project-briefing";
import { ProjectPanelHeader } from "./project-panel";
import { ProjectCover } from "./project-cover";
import { MoveMonthDialog, SettleCreditsDialog, settlementLine } from "./project-details-credits";
import { DriveLinkControl } from "./project-details-drive-link";
import { FormError } from "@/features/shared/form-error";

/** A round reads "Round N" and a project-level client version "VN". */
function historyLabel(version: CanvasVersion): string {
  return version.boardId ? `Round ${version.number}` : `V${version.number}`;
}

export function ProjectDetails({
  project,
  board = null,
  internal = false,
  deliverables,
  versions,
  onClose,
}: {
  project: TableRow<"projects">;
  board?: DesignBoard | null;
  internal?: boolean;
  deliverables: TableRow<"deliverables">[];
  versions: CanvasVersion[];
  onClose?: () => void;
}) {
  const { database, profile } = useAuth();
  const { formatDate } = useDateFormat();
  const invalidate = useInvalidateProject();
  const invalidateAssets = useInvalidateAssets();
  const designer = profile?.role === "designer";
  const briefingFirst = designer;
  const production = designer || (profile?.role === "agency" && internal);
  const [selectedView, setView] = useState<"overview" | "briefing" | "production">(
    briefingFirst ? "production" : "overview",
  );
  const view = selectedView === "production" && !production ? "overview" : selectedView;
  const [editing, setEditing] = useState(false);
  const [editRevision, setEditRevision] = useState(project.updated_at);
  const [editWorkflowRevision, setEditWorkflowRevision] = useState(0);
  const [editActivity, setEditActivity] = useState<"active" | "backlog">("active");
  const editAttempt = useRef<{ payload: string; id: string } | null>(null);
  const workflow = useProjectWorkflow(project.id);
  const [assigning, setAssigning] = useState(false);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const [creditDialog, setCreditDialog] = useState<"move" | "settle" | null>(null);
  const assignments = useProjectAssignments(project.id);
  // Read for every role: RLS alone keeps a designer to `internal` and a client to `client`, and
  // only the agency renders either control below.
  const driveLinks = useProjectDriveLinks(project.id);
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
      const description = String(form.get("description")).trim();
      const payload = JSON.stringify({ title, description, start, due, activity: editActivity });
      if (editAttempt.current?.payload !== payload)
        editAttempt.current = { payload, id: crypto.randomUUID() };
      await saveProjectDetailsWithActivity(database, {
        id: project.id,
        revision: editRevision,
        workflowRevision: editWorkflowRevision,
        activity: editActivity,
        requestId: editAttempt.current.id,
        title,
        description,
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
  // Deliverables (`assets-page.tsx`) shows the same Drive link beside a project's file group, reading only
  // the `client` channel; a `client` save also refreshes that cache so the icon there never goes
  // stale for up to the assets query's own cache time. Non-widening: `assets-page.tsx`'s own writes
  // already invalidate this same key. An `internal` save never reaches Deliverables, which no designer's
  // channel does either.
  const onDriveLinkSaved = async (channel: ProjectChannel) => {
    await (channel === "client" ? Promise.all([invalidate(), invalidateAssets()]) : invalidate());
  };
  const shareLink =
    typeof window === "undefined"
      ? `/projects/${project.id}?channel=client`
      : `${window.location.origin}/projects/${project.id}?channel=client`;

  return (
    <aside className="project-details" aria-label="Project details">
      <ProjectPanelHeader
        title={briefingFirst ? "Briefing" : "Project details"}
        subtitle={
          designer ? "Creative direction and project resources" : "Scope, timing and resources"
        }
        onClose={onClose}
        actions={
          profile?.role === "agency" ? (
            <button
              className="icon-button"
              aria-label="Edit project details"
              onClick={() => {
                if (!workflow.data) return;
                setEditRevision(project.updated_at);
                setEditWorkflowRevision(workflow.data.project.workflowRevision);
                setEditActivity(workflow.data.project.activity);
                editAttempt.current = null;
                save.reset();
                setEditing(true);
              }}
            >
              <Pencil size={15} />
            </button>
          ) : undefined
        }
      />
      {(project.briefing_id || production) && (
        <div className="project-details-tabs" role="group" aria-label="Project information">
          {(designer
            ? (["production", "overview"] as const)
            : [
                "overview" as const,
                ...(project.briefing_id ? ["briefing" as const] : []),
                ...(production ? ["production" as const] : []),
              ]
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={view === tab}
              onClick={() => setView(tab)}
            >
              {tab === "production"
                ? designer
                  ? "Briefing"
                  : "Production"
                : tab === "briefing"
                  ? profile?.role === "agency"
                    ? "Client brief"
                    : "Briefing"
                  : designer
                    ? "Project info"
                    : "Overview"}
            </button>
          ))}
        </div>
      )}
      {view === "production" && production && (
        <div
          className="project-details-content"
          role="region"
          aria-label="Production instructions"
          tabIndex={0}
        >
          <ProductionBrief key={board?.id ?? "none"} board={board} project={project} />
        </div>
      )}
      {view === "briefing" && !designer && project.briefing_id && (
        <div className="project-details-content">
          <ProjectBriefing clientId={project.client_id} briefingId={project.briefing_id} />
        </div>
      )}
      <div className="project-details-content" hidden={view !== "overview"}>
        {!designer && (
          <div className="project-details-overview">
            <h3>Project overview</h3>
            <p>{project.description || "No additional project notes yet."}</p>
          </div>
        )}
        <dl>
          {!designer && (
            <>
              <dt>Service</dt>
              <dd>
                {services.find((service) => service.id === project.service_type)?.name ??
                  project.service_type.replaceAll("-", " ")}
              </dd>
            </>
          )}
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
          {!designer && (
            <>
              <dt>Deliverables</dt>
              <dd>{deliverables.length}</dd>
            </>
          )}
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
        <nav className="project-resources" aria-label="Project resources">
          <h3>Resources</h3>
          {(designer || project.briefing_id) && (
            <button
              className="button"
              onClick={() => setView(designer ? "production" : "briefing")}
            >
              Read briefing
              <ArrowUpRight size={14} />
            </button>
          )}
          <Link className="button quiet" href={`/clients/${project.client_id}/brand/overview`}>
            Brand direction
            <ArrowUpRight size={14} />
          </Link>
          {!designer && (
            <Link
              className="button quiet"
              href={`/clients/${project.client_id}/brand/files?project=${project.id}`}
            >
              Deliverables
              <ArrowUpRight size={14} />
            </Link>
          )}
          {profile?.role !== "designer" && (
            <CopyButton
              text={shareLink}
              label="Copy project link"
              className="button quiet project-copy-link"
            />
          )}
        </nav>
        {!designer && <ProjectCover projectId={project.id} />}
        {profile?.role === "agency" && (
          <details className="project-management">
            <summary>Manage project</summary>
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
            {creditState && (canMove || canSettle) && (
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
            {driveLinks.isPending && <p role="status">Loading Drive links…</p>}
            {driveLinks.error && (
              <div className="assignment-section">
                <FormError>Could not load Drive links. Try again.</FormError>
                <button className="button quiet" onClick={() => void driveLinks.refetch()}>
                  Try again
                </button>
              </div>
            )}
            {!driveLinks.error && driveLinks.data && (
              <>
                <DriveLinkControl
                  projectId={project.id}
                  channel="internal"
                  url={driveLinks.data?.internal ?? null}
                  onSaved={() => onDriveLinkSaved("internal")}
                />
                <DriveLinkControl
                  projectId={project.id}
                  channel="client"
                  url={driveLinks.data?.client ?? null}
                  onSaved={() => onDriveLinkSaved("client")}
                />
              </>
            )}
          </details>
        )}
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
          <label>
            Project activity
            <select
              name="activity"
              value={editActivity}
              onChange={(event) => setEditActivity(event.target.value as "active" | "backlog")}
            >
              <option value="active">Active</option>
              {project.status !== "delivered" && <option value="backlog">Backlog</option>}
            </select>
          </label>
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
