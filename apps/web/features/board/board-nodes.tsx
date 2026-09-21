"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Folder,
  GripHorizontal,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { statusLabels, useDateFormat, type Project } from "@/features/workspace/workspace-data";
import { BoardKanban } from "./board-kanban";
import { ProjectTimeline } from "./project-timeline";
import { campaignDateRange, type BoardCampaign } from "./board-layout";
import { openLabel } from "./project-open";
import { distinctTitle } from "./timeline-model";
import { timelineScales, type TimelineScale } from "./timeline-model";
import { type PlanningMode } from "./planning-view";
import { ProjectThumbnail, type SignedProjectArtwork } from "./project-thumbnail";

export type PlanningNode = Node<
  {
    open: boolean;
    mode: PlanningMode;
    /** The project opened from a card, which is Planning's third state. */
    projects: Project[];
    campaignName: (id: string | null) => string;
    campaignOrder: string[];
    period: number;
    onPeriod: (start: number) => void;
    scale: TimelineScale;
    onScale: (scale: TimelineScale) => void;
    onToggle: () => void;
    onMode: (mode: PlanningMode) => void;
    selectedId: string | null;
    onSelect: (projectId: string) => void;
    onOpen: (projectId: string) => void;
  },
  "planning"
>;
export type NoticeNode = Node<{ filtered: boolean; onClear: () => void }, "notice">;
export type CampaignNode = Node<{ campaign: BoardCampaign; count: number }, "campaign">;
export type ProjectCardNode = Node<
  {
    project: Project;
    /** Head shared with the other cards on this board, dropped so the tail survives the card. */
    titlePrefix: string;
    canMove: boolean;
    /** A signed URL for the project's leading artwork, when the viewer is allowed one. */
    artwork: SignedProjectArtwork;
    onOpen: (projectId: string) => void;
  },
  "project"
>;
export type BriefingSlotNode = Node<{ href: string; campaign: string }, "briefingSlot">;
export type AddCampaignNode = Node<{ onCreate: () => void }, "addCampaign">;

const PlanningFrame = memo(function PlanningFrame({ data }: NodeProps<PlanningNode>) {
  return (
    <section className="board-planning">
      <header className="board-planning-head">
        <button
          className="icon-button"
          aria-expanded={data.open}
          aria-controls="board-planning-body"
          aria-label={data.open ? "Collapse planning" : "Expand planning"}
          onClick={data.onToggle}
        >
          {data.open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </button>
        <h2>Planning</h2>
        {/* The scale is what makes work outside a fortnight reachable at all, so it sits beside the
            view it belongs to rather than inside the calendar's narrow label column. */}
        {data.mode === "timeline" && (
          <div className="segmented-control" role="group" aria-label="Timeline scale">
            {timelineScales.map((item) => (
              <button
                key={item.id}
                aria-pressed={item.id === data.scale}
                onClick={() => data.onScale(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="segmented-control" role="group" aria-label="Planning view">
          <button aria-pressed={data.mode === "timeline"} onClick={() => data.onMode("timeline")}>
            Timeline
          </button>
          <button aria-pressed={data.mode === "kanban"} onClick={() => data.onMode("kanban")}>
            Kanban
          </button>
        </div>
      </header>
      {data.open && (
        <div id="board-planning-body" className="board-planning-body nowheel nopan nodrag">
          {data.mode === "timeline" ? (
            <ProjectTimeline
              projects={data.projects}
              campaignName={data.campaignName}
              campaignOrder={data.campaignOrder}
              start={data.period}
              onStart={data.onPeriod}
              scale={data.scale}
              selectedId={data.selectedId}
              onSelect={data.onSelect}
              onOpen={data.onOpen}
            />
          ) : (
            <BoardKanban
              projects={data.projects}
              campaignName={data.campaignName}
              selectedId={data.selectedId}
              onSelect={data.onSelect}
              onOpen={data.onOpen}
            />
          )}
        </div>
      )}
    </section>
  );
});

const NoticeFrame = memo(function NoticeFrame({ data }: NodeProps<NoticeNode>) {
  return (
    <div className="board-stack-notice empty-state">
      <h2>{data.filtered ? "No projects match." : "A fresh space for your next idea."}</h2>
      <p>
        {data.filtered
          ? "Try a different search or clear your filters."
          : "Start with a briefing. We’ll take it from there."}
      </p>
      {data.filtered && (
        <button className="button" onClick={data.onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
});

const CampaignFrame = memo(function CampaignFrame({ data }: NodeProps<CampaignNode>) {
  const { formatDate } = useDateFormat();
  return (
    <section className="board-campaign">
      <header className="board-campaign-head">
        <Folder size={15} />
        <h2>{data.campaign.title}</h2>
        <span className="count-badge">{data.count}</span>
        <span className="board-campaign-dates">{campaignDateRange(data.campaign, formatDate)}</span>
      </header>
    </section>
  );
});

const ProjectCard = memo(function ProjectCard({ data }: NodeProps<ProjectCardNode>) {
  const { formatDate } = useDateFormat();
  return (
    <article className="board-card">
      {data.canMove && (
        <div className="board-card-grip" title="Drag to arrange">
          <GripHorizontal size={17} />
        </div>
      )}
      {/*
       * One click selects the card, two open the project's own canvas — the same rule
       * `project-open.ts` states for the Kanban card and the timeline bar. Dragging is confined to
       * the grip above, so a card that is moved is never also read as opened. The explicit control
       * below is the keyboard and pointer equivalent of the second click, which a double click
       * alone would leave undiscoverable, and it carries the one accessible name `openLabel` gives
       * every surface.
       */}
      <div className="nodrag board-card-body" onDoubleClick={() => data.onOpen(data.project.id)}>
        <ProjectThumbnail src={data.artwork.url ?? undefined} />
        <div className="board-card-head">
          {/* The full title stays the card's accessible name and its tooltip. */}
          <h2 title={data.project.title}>{distinctTitle(data.project.title, data.titlePrefix)}</h2>
        </div>
        {/* The version names the artwork above it, never the newest version that exists: a card
            claiming V2 over a V1 image is worse than a card that says nothing. Both come from one
            query, so they cannot drift apart. The type is shown even with no artwork. */}
        {(data.artwork.version !== null || data.artwork.typeLabel) && (
          <p className="board-card-meta">
            {data.artwork.version !== null && (
              <span className="board-card-version">V{data.artwork.version}</span>
            )}
            {data.artwork.typeLabel && <span>{data.artwork.typeLabel}</span>}
          </p>
        )}
        <div className="board-card-footer">
          <span className={`status-badge ${data.project.status}`}>
            {statusLabels[data.project.status]}
          </span>
          <span>
            <CalendarDays size={13} />
            {formatDate(data.project.due_date, "No due date")}
          </span>
        </div>
        <button
          type="button"
          className="nodrag board-card-open"
          aria-label={openLabel(data.project.title)}
          onClick={() => data.onOpen(data.project.id)}
        >
          <ArrowUpRight size={15} />
        </button>
      </div>
    </article>
  );
});

const BriefingSlot = memo(function BriefingSlot({ data }: NodeProps<BriefingSlotNode>) {
  return (
    <Link
      className="board-slot nodrag"
      href={data.href}
      aria-label={`New briefing in ${data.campaign}`}
    >
      <Plus size={18} />
      New briefing
    </Link>
  );
});

const AddCampaignFrame = memo(function AddCampaignFrame({ data }: NodeProps<AddCampaignNode>) {
  return (
    <button className="board-add-campaign nodrag" onClick={data.onCreate}>
      <Plus size={16} />
      Add a campaign
    </button>
  );
});

export const boardNodeTypes = {
  planning: PlanningFrame,
  notice: NoticeFrame,
  campaign: CampaignFrame,
  project: ProjectCard,
  briefingSlot: BriefingSlot,
  addCampaign: AddCampaignFrame,
};
