"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { PageStatus } from "@/features/shared/page-status";
import { statusToneClass } from "@/features/shared/status-tone";
import { WelcomeHeader, welcomeTitle } from "@/features/shared/welcome-header";
import {
  projectStatusTone,
  projectStatusLabel,
  useClients,
  useDateFormat,
  useProjects,
} from "@/features/workspace/workspace-data";
import { useDesignerRounds } from "./overview-data";
import { deliveredOn, designerOverview, designerRounds, relativeAge } from "./overview-model";
import { OverviewPanel } from "./overview-panel";
import "./overview.css";

/** A designer's `/home`: their assigned work across clients, and what is waiting on them. */
export function DesignerOverview() {
  const { profile } = useAuth();
  const clients = useClients();
  const projects = useProjects();
  // Nothing on a delivered project still waits on the designer or the studio, so only active
  // projects need their rounds read.
  const activeProjectIds = projects.data
    ?.filter((project) => project.status !== "delivered" && project.activity !== "backlog")
    .map((project) => project.id);
  const rounds = useDesignerRounds(activeProjectIds);
  const { formatDate, formatDayKey, formatMonth, formatWeekdayDate } = useDateFormat();
  const reads = [clients, projects, rounds];
  // Checked before `isPending`: when `projects` fails, `activeProjectIds` stays undefined and
  // `rounds` stays disabled (so pending) forever, which used to hide this error behind an
  // unending "Loading your work…" with no retry.
  if (reads.some((read) => read.error))
    return (
      <div className="page-content">
        <h1>We couldn’t load your work.</h1>
        <button className="button" onClick={() => reads.forEach((read) => void read.refetch())}>
          Try again
        </button>
      </div>
    );
  if (reads.some((read) => read.isPending)) return <PageStatus>Loading your work…</PageStatus>;
  const now = new Date();
  const list = projects.data ?? [];
  const overview = designerOverview({
    projects: list,
    activeBoardProjectIds: rounds.data?.boards.map((board) => board.project_id) ?? [],
    rounds: designerRounds(rounds.data?.rounds ?? [], rounds.data?.boards ?? [], list),
    now,
    formatMonth,
  });
  const clientName = (id: string) => clients.data?.find((client) => client.id === id)?.name ?? "";
  return (
    <div className="page-content home-content overview-page">
      <WelcomeHeader
        eyebrow="My work"
        title={welcomeTitle(profile?.display_name)}
        subtitle="Your assigned projects and next steps."
        actions={
          <div className="home-actions">
            <span className="home-date">{formatWeekdayDate(now.toISOString())}</span>
          </div>
        }
      />
      <div className="overview-stats">
        <div>
          <strong>{overview.active}</strong>
          <span>Active projects</span>
          <small>assigned to you</small>
        </div>
        <div>
          <strong>{overview.yourTurn}</strong>
          <span>Your turn</span>
          <small>ready for your work</small>
        </div>
        <div>
          <strong>{overview.inStudioReview}</strong>
          <span>In studio review</span>
          <small>waiting on the studio</small>
        </div>
        <div>
          <strong>{overview.deliveredThisMonth}</strong>
          <span>Delivered this month</span>
          <small>shipped to clients</small>
        </div>
      </div>
      <div className="overview-columns">
        <OverviewPanel
          eyebrow="Assigned projects"
          title="What's moving"
          empty="No active assignments."
        >
          {overview.moving.map((project) => (
            <Link key={project.id} className="overview-row" href={`/projects/${project.id}`}>
              <strong>{project.title}</strong>
              <span className="overview-row-meta">
                {clientName(project.client_id)} · Due {formatDate(project.due_date, "not set")}
              </span>
              <span className={statusToneClass(projectStatusTone(project))}>
                {projectStatusLabel(project)}
              </span>
            </Link>
          ))}
        </OverviewPanel>
        <OverviewPanel eyebrow="Needs you" title="Your turn" empty="No work waiting on you.">
          {overview.yourTurnRows.map((row) => (
            <Link
              key={row.id}
              className="overview-row"
              href={`/projects/${row.projectId}?channel=internal&board=${row.boardId}`}
            >
              <strong>
                {row.title} · {row.label}
              </strong>
              <span className="overview-row-meta">
                {row.status === "changes_requested" ? "Changes requested" : "Ready to start"} ·
                assigned {relativeAge(row.date, now, formatDayKey)}
              </span>
            </Link>
          ))}
        </OverviewPanel>
        <OverviewPanel
          eyebrow="Delivered"
          title="Recently delivered"
          empty="Delivered work will appear here."
        >
          {overview.delivered.map((project) => (
            <Link key={project.id} className="overview-row" href={`/projects/${project.id}`}>
              <strong>{project.title}</strong>
              <span className="overview-row-meta">
                {clientName(project.client_id)} · {formatDate(deliveredOn(project))}
              </span>
            </Link>
          ))}
        </OverviewPanel>
      </div>
    </div>
  );
}
