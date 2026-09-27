"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useBriefingRequester } from "@/features/briefings/briefing-data";
import { CopyButton } from "@/features/shared/copy-button";
import { Modal } from "@/features/shared/modal";
import { personName, reviewDecisionLabel } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import { useDateFormat, versionStatusLabel } from "@/features/workspace/workspace-data";
import {
  assignDesigner,
  revokeDesignAssignment,
  updateProjectDetails,
  useInvalidateProject,
  useProjectAssignments,
  type TableRow,
  type CanvasVersion,
} from "./project-data";
import { ProjectPanelHeader } from "./project-panel";
import { ProjectCover } from "./project-cover";
import { FormError } from "@/features/shared/form-error";

/**
 * A Miro-workspace round reads "Round N" and a project-level shared version "VN"; a legacy version
 * keeps its deliverable's name.
 */
function historyLabel(version: CanvasVersion, deliverables: TableRow<"deliverables">[]): string {
  if (version.boardId) return `Round ${version.number}`;
  const deliverable = deliverables.find((item) => item.id === version.deliverableId);
  return deliverable ? `${deliverable.name} · V${version.number}` : `V${version.number}`;
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
  const assignments = useProjectAssignments(project.id);
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
                  <strong>{historyLabel(version, deliverables)}</strong>
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
            here, as there is none beside `updateWorkingDesign`.
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
    </aside>
  );
}
