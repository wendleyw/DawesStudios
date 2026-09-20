"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { formatDate, useClients } from "@/features/workspace/workspace-data";
import { useBriefings, useCampaigns } from "./briefing-data";
import { briefingStatusLabels, services } from "./briefing-model";
import "./briefings.css";

export function BriefingsPage({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const clients = useClients();
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const [tab, setTab] = useState("all");
  if (briefings.isPending || clients.isPending || campaigns.isPending)
    return (
      <div className="page-content" role="status">
        Loading briefings…
      </div>
    );
  const client = clients.data?.find((item) => item.id === clientId);
  if (briefings.error || campaigns.error || !client)
    return (
      <div className="page-content">
        <h1>Briefings unavailable.</h1>
        <p className="form-error" role="alert">
          We could not load this workspace. Please try again.
        </p>
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
      <header className="page-heading">
        <div>
          <h1>Briefings</h1>
          <p>A clear starting point for your next project.</p>
        </div>
        {profile?.role !== "designer" && (
          <Link href={`/clients/${clientId}/briefings/new`} className="button primary">
            <Plus size={16} />
            New briefing
          </Link>
        )}
      </header>
      {profile?.role !== "designer" && (
        <nav className="briefing-tabs" aria-label="Filter briefings">
          {[
            ["all", "All briefings"],
            ["draft", "Draft"],
            ["awaiting_review", "Awaiting review"],
            ["accepted", "In progress"],
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
      {visible.length === 0 ? (
        <div className="empty-state">
          <h2>No briefings here yet.</h2>
          <p>
            {profile?.role === "designer"
              ? "Accepted briefs for your assigned projects will appear here."
              : tab === "all"
                ? "Choose a service and tell us what you have in mind."
                : "Your briefings will appear here as they move forward."}
          </p>
        </div>
      ) : (
        <div className="briefing-list">
          {visible.map((item) => (
            <Link
              key={item.id}
              className="briefing-list-row"
              href={`/clients/${clientId}/briefings/${item.id}`}
            >
              <div>
                <span className="eyebrow">
                  {campaigns.data?.find((campaign) => campaign.id === item.campaign_id)?.title ??
                    "Campaign not chosen"}
                </span>
                <h2>{item.title || "Untitled briefing"}</h2>
                <p>
                  {services.find((service) => service.id === item.service_type)?.name ??
                    item.service_type}{" "}
                  · {item.requested_deliverables.length} deliverable
                  {item.requested_deliverables.length === 1 ? "" : "s"}
                </p>
              </div>
              <span className={`status-badge ${item.status}`}>
                {briefingStatusLabels[item.status]}
              </span>
              <span className="briefing-list-date">{formatDate(item.due_date)}</span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
