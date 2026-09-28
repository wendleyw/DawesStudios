"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useBriefings, useCampaigns } from "@/features/briefings/briefing-data";
import { initialDraft } from "@/features/briefings/briefing-model";
import { BriefingSummary } from "@/features/briefings/briefing-summary";
import { BriefingAttachments } from "@/features/briefings/briefing-attachments";
import "@/features/briefings/briefings.css";

/** The existing authorized briefing read also limits designers to their assigned projects. */
export function ProjectBriefing({
  clientId,
  briefingId,
}: {
  clientId: string;
  briefingId: string;
}) {
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  if (briefings.isPending) return <p role="status">Loading briefing…</p>;
  if (briefings.error)
    return (
      <div role="alert">
        <p>We couldn’t load the briefing.</p>
        <button className="button" onClick={() => void briefings.refetch()}>
          Try again
        </button>
      </div>
    );
  const briefing = briefings.data?.find((item) => item.id === briefingId);
  if (!briefing) return <p>This briefing is no longer available.</p>;

  return (
    <div className="project-briefing">
      <BriefingSummary
        draft={initialDraft(briefing, {})}
        campaignName={campaigns.data?.find((item) => item.id === briefing.campaign_id)?.title}
        showTitle={false}
        compact
      />
      <BriefingAttachments briefingId={briefingId} />
      <Link className="button quiet" href={`/clients/${clientId}/briefings/${briefingId}`}>
        View full briefing <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
