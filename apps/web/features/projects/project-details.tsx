"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { CopyButton } from "@/features/shared/copy-button";
import { Modal } from "@/features/shared/modal";
import { formatDate } from "@/features/workspace/workspace-data";
import { assertResult } from "@/lib/supabase";
import { useInvalidateProject, type TableRow, type CanvasVersion } from "./project-data";
import { FormError } from "@/features/shared/form-error";

export function ProjectDetails({
  project,
  deliverables,
  versions,
}: {
  project: TableRow<"projects">;
  deliverables: TableRow<"deliverables">[];
  versions: CanvasVersion[];
}) {
  const { database, profile, session } = useAuth();
  const invalidate = useInvalidateProject();
  const [editing, setEditing] = useState(false);
  const [editRevision, setEditRevision] = useState(project.updated_at);
  const [assigning, setAssigning] = useState(false);
  const assignments = useQuery({
    queryKey: ["assignments", session?.user.id, project.id],
    enabled: profile?.role === "agency",
    queryFn: async () => {
      const [members, assigned] = await Promise.all([
        database.from("profiles").select("id,display_name").eq("role", "designer"),
        database.from("project_assignments").select("designer_id").eq("project_id", project.id),
      ]);
      return {
        members: assertResult(members),
        assigned: assertResult(assigned).map((item) => item.designer_id),
      };
    },
  });
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const start = String(form.get("start")) || null;
      const due = String(form.get("due")) || null;
      if (start && due && due < start)
        throw new Error("The due date must be on or after the start date.");
      const title = String(form.get("title")).trim();
      if (!title) throw new Error("Add a project title.");
      const result = await database
        .from("projects")
        .update({
          title,
          description: String(form.get("description")).trim(),
          start_date: start,
          due_date: due,
        })
        .eq("id", project.id)
        .eq("updated_at", editRevision)
        .select("id")
        .single();
      if (result.error?.code === "PGRST116")
        throw new Error(
          "This project changed while you were editing. Close and reopen the details to try again.",
        );
      assertResult(result);
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
      assertResult(
        await database.rpc("assign_designer", {
          p_project_id: project.id,
          p_designer_id: designerId,
        }),
      ),
    onSuccess: async () => {
      await assignments.refetch();
      setAssigning(false);
    },
  });
  const revoke = useMutation({
    mutationFn: async (designerId: string) =>
      assertResult(
        await database.rpc("revoke_design_assignment", {
          p_project_id: project.id,
          p_designer_id: designerId,
        }),
      ),
    onSuccess: async () => {
      await assignments.refetch();
    },
  });
  const shareLink =
    typeof window === "undefined"
      ? `/projects/${project.id}?channel=client`
      : `${window.location.origin}/projects/${project.id}?channel=client`;

  return (
    <aside className="project-details">
      <span className="eyebrow">THE BIG PICTURE</span>
      <div className="details-heading">
        <h2>Project details</h2>
        {profile?.role === "agency" && (
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
        )}
      </div>
      <p>{project.description || "No additional project notes yet."}</p>
      <dl>
        <dt>Service</dt>
        <dd>{project.service_type.replaceAll("-", " ")}</dd>
        <dt>Starts</dt>
        <dd>{project.start_date ? formatDate(project.start_date) : "To be planned"}</dd>
        <dt>Due date</dt>
        <dd>{formatDate(project.due_date)}</dd>
        <dt>Deliverables</dt>
        <dd>{deliverables.length}</dd>
      </dl>
      {profile?.role === "agency" && (
        <div className="assignment-section">
          <h3>Creative partner</h3>
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
                      onClick={() => revoke.mutate(member.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              {!assignments.data?.assigned.length && <p>Not assigned yet</p>}
            </div>
          )}
          {revoke.error && <FormError>{revoke.error.message}</FormError>}
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
        href={`/clients/${project.client_id}/assets?project=${project.id}`}
      >
        Files & delivery
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
                <strong>
                  {deliverables.find((item) => item.id === version.deliverableId)?.name} · V
                  {version.number}
                </strong>
                <span>
                  {formatDate(version.date)} · {version.status.replaceAll("_", " ")}
                </span>
                {version.note && <p>{version.note}</p>}
              </li>
            ))}
        </ol>
        {!versions.length && <p>The first version will appear here.</p>}
      </details>
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
          {save.error && (
            <FormError>
              {save.error.message.includes("0 rows")
                ? "This project changed while you were editing. Close and reopen the details to try again."
                : save.error.message}
            </FormError>
          )}
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
      <Modal
        open={assigning}
        title="Assign a creative partner"
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
