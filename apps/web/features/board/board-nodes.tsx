"use client";

import { ArrowUpRight, CalendarDays, Folder, GripHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import {
  projectStatusTones,
  statusLabels,
  useDateFormat,
  type Project,
} from "@/features/workspace/workspace-data";
import { statusToneClass } from "@/features/shared/status-tone";
import { campaignDateRange, type BoardCampaign } from "./board-layout";
import { openLabel } from "./project-open";
import { distinctTitle } from "./timeline-model";
import { ProjectThumbnail, type SignedProjectArtwork } from "./project-thumbnail";
import { CompetitorAdsWidget } from "@/features/competitors/competitor-ads-widget";

export type NoticeNode = Node<
  { filtered: boolean; hasSearch: boolean; onClear: () => void },
  "notice"
>;
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
export type CompetitorAdsNode = Node<
  { clientId: string; canEdit: boolean; removing: boolean; onRemove: () => void },
  "competitorAds"
>;

const NoticeFrame = memo(function NoticeFrame({ data }: NodeProps<NoticeNode>) {
  return (
    <div className="board-stack-notice empty-state">
      <h2>{data.filtered ? "No projects match." : "A fresh space for your next idea."}</h2>
      <p>
        {data.filtered
          ? data.hasSearch
            ? "Try a different search or clear your filters."
            : "Try a different filter or clear your filters."
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
        <Folder size={18} />
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
        <ProjectThumbnail src={data.artwork.url ?? undefined} video={data.artwork.isVideo} />
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
          <span className={statusToneClass(projectStatusTones[data.project.status])}>
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

const CompetitorAdsFrame = memo(function CompetitorAdsFrame({
  data,
}: NodeProps<CompetitorAdsNode>) {
  return (
    <CompetitorAdsWidget
      clientId={data.clientId}
      canEdit={data.canEdit}
      removing={data.removing}
      onRemove={data.onRemove}
    />
  );
});

export const boardNodeTypes = {
  notice: NoticeFrame,
  campaign: CampaignFrame,
  project: ProjectCard,
  briefingSlot: BriefingSlot,
  addCampaign: AddCampaignFrame,
  competitorAds: CompetitorAdsFrame,
};
