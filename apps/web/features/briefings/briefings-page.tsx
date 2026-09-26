"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useClients, useDateFormat } from "@/features/workspace/workspace-data";
import { personName, requesterLabel } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import { useBriefings, useCampaigns } from "./briefing-data";
import { briefingStatusLabels, briefingStatusTones, services } from "./briefing-model";
import { statusToneClass } from "@/features/shared/status-tone";
import "./briefings.css";
import { PageStatus } from "@/features/shared/page-status";

export function BriefingsPage({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const clients = useClients();
  const { formatDate } = useDateFormat();
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const people = useClientPeople(clientId);
  const [tab, setTab] = useState("all");
  if (briefings.isPending || clients.isPending || campaigns.isPending)
    return <PageStatus>Loading briefings…</PageStatus>;
  const client = clients.data?.find((item) => item.id === clientId);
  if (briefings.error || campaigns.error || !client)
    return (
      <div className="page-content">
        <h1>Briefings unavailable.</h1>
        <p>These briefings are unavailable or you do not have access.</p>
        <button
          className="button"
          onClick={() => {
            void briefings.refetch();
            void campaigns.refetch();
            void clients.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  const visible = (briefings.data ?? []).filter(
    (item) =>
      tab === "all" ||
      (tab === "awaiting_review"
        ? ["awaiting_review", "budget_confirmed"].includes(item.status)
        : item.status === tab),
  );
  return (
    <div className="page-content briefings-page">
      <header className="page-heading client-page-heading">
        <div>
          <h1>Briefings</h1>
          <p>A clear starting point for your next project.</p>
        </div>
        <div className="page-actions">
          {profile?.role !== "designer" && (
            <Link href={`/clients/${clientId}/briefings/new`} className="button primary">
              <Plus size={16} />
              New briefing
            </Link>
          )}
        </div>
        {profile?.role !== "designer" && (
          <nav
            className="briefing-tabs section-tabs client-page-tools"
            aria-label="Filter briefings"
          >
            {[
              ["all", "All briefings"],
              ["draft", briefingStatusLabels.draft],
              ["awaiting_review", "With the studio"],
              ["accepted", briefingStatusLabels.accepted],
            ].map(([value, label]) => (
              <button
                className={tab === value ? "active" : ""}
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>
      {visible.length === 0 ? (
        <div className="empty-state">
          <h2>No briefings here yet.</h2>
          <p>
            {profile?.role === "designer"
              ? "Accepted briefings for your assigned projects will appear here."
              : tab === "all"
                ? "Choose a service and tell us what you have in mind."
                : "Your briefings will appear here as they move forward."}
          </p>
        </div>
      ) : (
        <div className={`briefing-list${profile?.role === "designer" ? " no-requester" : ""}`}>
          {visible.map((item) => (
            <Link
              key={item.id}
              className="briefing-list-row"
              href={`/clients/${clientId}/briefings/${item.id}`}
            >
              <h2>{item.title || "Untitled briefing"}</h2>
              <span className="briefing-list-campaign">
                {campaigns.data?.find((campaign) => campaign.id === item.campaign_id)?.title ??
                  "Campaign not chosen"}
              </span>
              {profile?.role !== "designer" && (
                <span className="briefing-list-requester">
                  {requesterLabel(personName(item.requested_by, people.data, profile?.role))}
                </span>
              )}
              <span className="briefing-list-service">
                {services.find((service) => service.id === item.service_type)?.name ??
                  item.service_type}{" "}
                · {item.requested_deliverables.length} deliverable
                {item.requested_deliverables.length === 1 ? "" : "s"}
              </span>
              <span className={statusToneClass(briefingStatusTones[item.status])}>
                {briefingStatusLabels[item.status]}
              </span>
              <span className="briefing-list-date">{formatDate(item.due_date, "No due date")}</span>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
