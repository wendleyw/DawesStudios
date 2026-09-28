"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, Eye, Lock } from "lucide-react";
import { useCampaigns } from "@/features/briefings/briefing-data";
import type { ProjectChannel } from "./project-data";

/** Every project's campaign, title and role-appropriate due date. */
export function ProjectTitle({
  clientId,
  campaignId,
  title,
  dueLabel,
}: {
  clientId: string;
  campaignId: string | null;
  title: string;
  dueLabel: string;
}) {
  const campaigns = useCampaigns(clientId);
  const campaign = campaigns.data?.find((item) => item.id === campaignId);
  return (
    <div className="project-heading">
      {campaign && (
        <p className="project-heading-campaign" title={campaign.title}>
          {campaign.title}
        </p>
      )}
      <div className="project-heading-row">
        <h1 title={title}>{title}</h1>
        <span className="project-heading-due">
          <CalendarDays size={12} aria-hidden="true" />
          {dueLabel}
        </span>
      </div>
    </div>
  );
}

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
 * The workspace bar's channel: the agency's Working files | Shared with client tabs, or the
 * Working files label a designer sees in place of a switch they do not have. The client sees neither.
 */
export function ProjectChannelLead({
  role,
  channel,
  onChannel,
  disabled = false,
}: {
  role: string | undefined;
  channel: ProjectChannel;
  onChannel: (channel: ProjectChannel) => void;
  disabled?: boolean;
}) {
  if (role === "agency")
    return (
      <div className="project-channel-tabs" role="group" aria-label="Project channel">
        {(["internal", "client"] as const).map((option) => (
          <button
            key={option}
            className={channel === option ? "active" : ""}
            aria-pressed={channel === option}
            disabled={disabled}
            onClick={() => onChannel(option)}
          >
            {option === "internal" ? (
              <Lock size={13} aria-hidden="true" />
            ) : (
              <Eye size={13} aria-hidden="true" />
            )}
            {option === "internal" ? "Working files" : "Shared with client"}
          </button>
        ))}
      </div>
    );
  if (role === "designer")
    return (
      <span className="project-channel-label" title="Visible to you and the studio">
        <Lock size={12} aria-hidden="true" />
        Working files
      </span>
    );
  return null;
}
