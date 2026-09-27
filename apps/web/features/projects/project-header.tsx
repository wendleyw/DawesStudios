"use client";

import Link from "next/link";
import { ArrowLeft, Eye, Lock } from "lucide-react";
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
import { ProjectCreditsChip } from "@/features/credits/project-credits-chip";
import type { CanvasVersion, ProjectChannel, TableRow } from "./project-data";
import type { ProjectView } from "./miro-mode";
import { MiroBar, miroBarTone, type MiroFrame } from "./miro-view";

/** The way back from a project to its client's board. */
export function ProjectBackLink({ clientId }: { clientId: string }) {
  return (
    <Link
      className="icon-button"
      href={`/clients/${clientId}/board`}
      aria-label="Back to board"
      title="Back to board"
    >
      <ArrowLeft size={17} />
    </Link>
  );
}

/**
 * The agency's Working files | Shared with client switch; anyone else sees the name of the one
 * channel they have. `tabs` draws it as the Miro bar's channel tabs.
 */
export function ProjectChannelControl({
  agency,
  channel,
  onChannel,
  disabled = false,
  tabs = false,
}: {
  agency: boolean;
  channel: ProjectChannel;
  onChannel: (channel: ProjectChannel) => void;
  disabled?: boolean;
  tabs?: boolean;
}) {
  return (
    <div
      className={tabs ? "project-channel-tabs" : "segmented-control"}
      role="group"
      aria-label="Project channel"
    >
      {agency ? (
        (["internal", "client"] as const).map((option) => (
          <button
            key={option}
            className={channel === option ? "active" : ""}
            aria-pressed={channel === option}
            disabled={disabled}
            onClick={() => onChannel(option)}
          >
            {tabs &&
              (option === "internal" ? (
                <Lock size={13} aria-hidden="true" />
              ) : (
                <Eye size={13} aria-hidden="true" />
              ))}
            {option === "internal" ? "Working files" : "Shared with client"}
          </button>
        ))
      ) : (
        <span>{channel === "client" ? "Shared designs" : "Working files"}</span>
      )}
    </div>
  );
}

/**
 * The Miro bar's channel: the agency's tabs, or the Internal label a designer sees in place of a
 * switch they do not have. The client sees neither.
 */
export function ProjectChannelLead({
  role,
  channel,
  onChannel,
  disabled,
}: {
  role: string | undefined;
  channel: ProjectChannel;
  onChannel: (channel: ProjectChannel) => void;
  disabled?: boolean;
}) {
  if (role === "agency")
    return (
      <ProjectChannelControl
        agency
        tabs
        channel={channel}
        onChannel={onChannel}
        disabled={disabled}
      />
    );
  if (role === "designer")
    return (
      <span className="project-channel-label">
        <Lock size={12} aria-hidden="true" />
        Internal
      </span>
    );
  return null;
}

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
  miro,
  workspaceControl,
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
  /** Miro mode: the header folds into one compact bar for this deliverable's frames. */
  miro?: {
    name: string;
    linked: CanvasVersion[];
    current: MiroFrame;
    onSelect: (versionId: string) => void;
  };
  /** The agency's way back to the Miro workspace after choosing the Versions canvas. */
  workspaceControl?: ReactNode;
}) {
  const { formatDate } = useDateFormat();
  const back = <ProjectBackLink clientId={project.client_id} />;
  const channelControl = (
    <ProjectChannelControl
      agency={viewer?.role === "agency"}
      channel={channel}
      onChannel={onChannel}
      disabled={playgroundOpen}
    />
  );
  const viewControl = miroAvailable && (
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
  );
  const deliverableFilter = (
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
  );
  if (miro)
    return (
      <div className="project-chrome" ref={chromeRef}>
        {client && <CanvasHeader client={client} viewer={viewer} />}
        <MiroBar
          back={back}
          title={project.title}
          due={project.due_date ? `Due ${formatDate(project.due_date)}` : "No due date"}
          tone={miroBarTone(viewer?.role, channel)}
          lead={
            <ProjectChannelLead
              role={viewer?.role}
              channel={channel}
              onChannel={onChannel}
              disabled={playgroundOpen}
            />
          }
          {...miro}
          viewControl={
            <>
              {viewControl}
              {workspaceControl}
            </>
          }
          menu={<ProjectCreditsChip projectId={project.id} viewer={viewer} />}
        />
      </div>
    );
  return (
    <div className="project-chrome" ref={chromeRef}>
      {client && <CanvasHeader client={client} viewer={viewer} />}
      <div className="project-header">
        <div className="project-title-row">
          {back}
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
          {channelControl}
          {viewControl}
          {workspaceControl}
          <div className="project-header-actions">{deliverableFilter}</div>
        </div>
      )}
    </div>
  );
}
