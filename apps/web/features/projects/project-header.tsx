"use client";

import Link from "next/link";
import { ArrowLeft, Info, MessageSquare } from "lucide-react";
import type { ProjectPanelKind } from "./project-panel";
import type { ReactNode, Ref } from "react";
import type { Profile } from "@/lib/supabase";
import { CanvasHeader } from "@/features/workspace/canvas-header";
import {
  projectStatusTones,
  statusLabels,
  useDateFormat,
  type Client,
} from "@/features/workspace/workspace-data";
import { statusToneClass } from "@/features/shared/status-tone";
import type { ProjectChannel, TableRow } from "./project-data";

export function ProjectHeader({
  client,
  viewer,
  project,
  deliverables,
  channel,
  format,
  onChannel,
  onFormat,
  panel,
  onPanel,
  quickActions,
  playgroundOpen,
  reviewing,
  chromeRef,
}: {
  client?: Client;
  viewer: Profile | null;
  project: TableRow<"projects">;
  deliverables: TableRow<"deliverables">[];
  channel: ProjectChannel;
  format: string;
  onChannel: (channel: ProjectChannel) => void;
  onFormat: (id: string) => void;
  panel: ProjectPanelKind | null;
  onPanel: (panel: ProjectPanelKind | null) => void;
  quickActions: ReactNode;
  playgroundOpen: boolean;
  reviewing: boolean;
  chromeRef: Ref<HTMLDivElement>;
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
          <div className="project-header-actions" role="group" aria-label="Project actions">
            {!reviewing && (
              <>
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
              </>
            )}
            {!reviewing && (
              <>
                <button
                  className={`icon-button ${panel === "details" ? "selected" : ""}`}
                  disabled={playgroundOpen}
                  aria-label="Project details"
                  title="Project details"
                  aria-expanded={panel === "details"}
                  onClick={() => onPanel(panel === "details" ? null : "details")}
                >
                  <Info size={18} />
                </button>
                <button
                  className={`icon-button ${panel === "conversation" ? "selected" : ""}`}
                  disabled={playgroundOpen}
                  aria-label="Conversation"
                  title="Conversation"
                  aria-expanded={panel === "conversation"}
                  onClick={() => onPanel(panel === "conversation" ? null : "conversation")}
                >
                  <MessageSquare size={18} />
                </button>
              </>
            )}
            {quickActions}
          </div>
        </div>
      )}
    </div>
  );
}
