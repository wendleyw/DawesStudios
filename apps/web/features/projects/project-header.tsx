"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Ref } from "react";
import type { Profile } from "@/lib/supabase";
import { CanvasHeader } from "@/features/workspace/canvas-header";
import {
  projectStatusTones,
  statusLabels,
  useDateFormat,
  type Client,
} from "@/features/workspace/workspace-data";
import { statusToneClass } from "@/features/shared/status-tone";
import { ProjectCreditsChip } from "@/features/credits/project-credits-chip";
import type { ProjectChannel, TableRow } from "./project-data";
import type { ProjectView } from "./miro-mode";

export function ProjectHeader({
  client,
  viewer,
  project,
  deliverables,
  channel,
  format,
  onChannel,
  onFormat,
  playgroundOpen,
  reviewing,
  chromeRef,
  view,
  miroAvailable,
  onView,
}: {
  client?: Client;
  viewer: Profile | null;
  project: TableRow<"projects">;
  deliverables: TableRow<"deliverables">[];
  channel: ProjectChannel;
  format: string;
  onChannel: (channel: ProjectChannel) => void;
  onFormat: (id: string) => void;
  playgroundOpen: boolean;
  reviewing: boolean;
  chromeRef: Ref<HTMLDivElement>;
  view: ProjectView;
  miroAvailable: boolean;
  onView: (view: ProjectView) => void;
}) {
  const { formatDate } = useDateFormat();
  return (
    <div className="project-chrome" ref={chromeRef}>
      {client && <CanvasHeader client={client} viewer={viewer} />}
      <div className="project-header">
        <div className="project-title-row">
          <Link
            className="icon-button"
            href={`/clients/${project.client_id}/board`}
            aria-label="Back to board"
            title="Back to board"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="project-heading">
            <h1 title={project.title}>{project.title}</h1>
            <div>
              <span className={statusToneClass(projectStatusTones[project.status])}>
                {statusLabels[project.status]}
              </span>
              <span>{formatDate(project.due_date, "No due date")}</span>
            </div>
          </div>
          <ProjectCreditsChip projectId={project.id} viewer={viewer} />
        </div>
      </div>
      {!reviewing && (
        <div className="project-toolbar">
          {!reviewing && (
            <div className="segmented-control" role="group" aria-label="Project channel">
              {viewer?.role === "agency" ? (
                <>
                  <button
                    className={channel === "internal" ? "active" : ""}
                    aria-pressed={channel === "internal"}
                    disabled={playgroundOpen}
                    onClick={() => onChannel("internal")}
                  >
                    Working files
                  </button>
                  <button
                    className={channel === "client" ? "active" : ""}
                    aria-pressed={channel === "client"}
                    disabled={playgroundOpen}
                    onClick={() => onChannel("client")}
                  >
                    Shared with client
                  </button>
                </>
              ) : (
                <span>{channel === "client" ? "Shared designs" : "Working files"}</span>
              )}
            </div>
          )}
          {miroAvailable && (
            <div className="segmented-control" role="group" aria-label="Project view">
              {(["versions", "miro"] as const).map((option) => (
                <button
                  key={option}
                  className={view === option ? "active" : ""}
                  aria-pressed={view === option}
                  disabled={playgroundOpen}
                  onClick={() => {
                    if (option !== view) onView(option);
                  }}
                >
                  {option === "versions" ? "Versions" : "Miro"}
                </button>
              ))}
            </div>
          )}
          <div className="project-header-actions">
            <label className="visually-hidden" htmlFor="deliverable-filter">
              Filter deliverable
            </label>
            <select
              id="deliverable-filter"
              disabled={playgroundOpen}
              value={format}
              onChange={(event) => onFormat(event.target.value)}
            >
              <option value="">All deliverables</option>
              {deliverables.map((deliverable) => (
                <option key={deliverable.id} value={deliverable.id}>
                  {deliverable.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
