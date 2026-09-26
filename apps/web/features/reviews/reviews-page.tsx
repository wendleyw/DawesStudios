"use client";

import { ArrowUpRight, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useClients, useDateFormat, versionStatusLabel } from "@/features/workspace/workspace-data";
import "./reviews.css";
import { PageStatus } from "@/features/shared/page-status";
import { statusToneClass, type StatusTone } from "@/features/shared/status-tone";
import { personName, reviewDecisionLabel } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import { inReviewTab, useReviews } from "./review-data";

/** Badge tone for a version status: waiting on a person reads as attention, approved as complete. */
const versionStatusTones: Record<string, StatusTone> = {
  submitted: "active",
  pending: "attention",
  changes_requested: "attention",
  approved: "complete",
};

export function ReviewsPage({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const clients = useClients();
  const { formatDate } = useDateFormat();
  const [filter, setFilter] = useState("waiting");
  const data = useReviews(clientId);
  const people = useClientPeople(clientId);
  if (data.isPending || clients.isPending) return <PageStatus>Loading reviews…</PageStatus>;
  if (data.error || !clients.data?.some((client) => client.id === clientId))
    return (
      <div className="page-content">
        <h1>Reviews unavailable.</h1>
        <button className="button" onClick={() => void data.refetch()}>
          Try again
        </button>
      </div>
    );
  const rows = data.data ?? [];
  const visible = rows.filter((row) => inReviewTab(filter, row, profile?.role));
  return (
    <div className="page-content">
      <header className="page-heading client-page-heading">
        <div>
          <h1>Reviews</h1>
          <p>
            {profile?.role === "designer"
              ? "Keep track of work sent to the studio."
              : "Thoughtful feedback keeps good work moving."}
          </p>
        </div>
        <div className="review-filters segmented-control client-page-tools">
          {[
            {
              id: "waiting",
              label:
                profile?.role === "client"
                  ? "Waiting for you"
                  : profile?.role === "designer"
                    ? "In progress"
                    : "In review",
            },
            ...(profile?.role === "agency" ? [{ id: "studio", label: "Studio review" }] : []),
            ...(profile?.role === "client"
              ? [{ id: "with-studio", label: "With the studio" }]
              : []),
            { id: "approved", label: "Approved" },
          ].map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      {visible.length ? (
        <div className="review-list">
          {visible.map((row) => {
            // A decided version names who decided in the note column; its release note moves to
            // the tooltip. Older reviews without a recorded reviewer keep the note.
            const decision =
              row.reviewedBy && row.reviewedAt
                ? reviewDecisionLabel(
                    row.status,
                    personName(row.reviewedBy, people.data, profile?.role),
                    formatDate(row.reviewedAt),
                  )
                : null;
            return (
              <Link
                key={row.id}
                href={`/projects/${row.projectId}?channel=${row.internal ? "internal" : "client"}`}
                className="review-card"
              >
                <h2>{row.title}</h2>
                <span className="review-row-deliverable">
                  {row.deliverable} · V{row.version}
                </span>
                <span className="review-row-note" title={row.note ?? undefined}>
                  {decision ?? row.note}
                </span>
                <span className={statusToneClass(versionStatusTones[row.status])}>
                  {versionStatusLabel(row.status)}
                </span>
                <span className="review-date">{formatDate(row.date)}</span>
                <ArrowUpRight size={16} />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <CheckCheck size={30} />
          <h2>All clear here.</h2>
          <p>Versions will appear as work moves through review.</p>
        </div>
      )}
    </div>
  );
}
