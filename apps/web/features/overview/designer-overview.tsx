"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { PageStatus } from "@/features/shared/page-status";
import { statusToneClass } from "@/features/shared/status-tone";
import { WelcomeHeader, welcomeTitle } from "@/features/shared/welcome-header";
import {
  projectStatusTones,
  statusLabels,
  useClients,
  useDateFormat,
  useProjects,
} from "@/features/workspace/workspace-data";
import { useDesignerVersions } from "./overview-data";
import { deliveredOn, designerOverview, designerVersions, relativeAge } from "./overview-model";
import { OverviewPanel } from "./overview-panel";
import "./overview.css";

/** A designer's `/home`: their assigned work across clients, and what is waiting on them. */
export function DesignerOverview() {
  const { profile } = useAuth();
  const clients = useClients();
  const projects = useProjects();
  // Nothing on a delivered project still waits on the designer or the studio, so only active
  // projects need their versions read.
  const activeProjectIds = projects.data
    ?.filter((project) => project.status !== "delivered")
    .map((project) => project.id);
  const versions = useDesignerVersions(activeProjectIds);
  const { formatDate, formatDayKey, formatMonth, formatWeekdayDate } = useDateFormat();
  const reads = [clients, projects, versions];
  if (reads.some((read) => read.isPending)) return <PageStatus>Loading your work…</PageStatus>;
  if (reads.some((read) => read.error))
    return (
      <div className="page-content">
        <h1>We couldn’t load your work.</h1>
        <button className="button" onClick={() => reads.forEach((read) => void read.refetch())}>
          Try again
        </button>
      </div>
    );
  const now = new Date();
  const list = projects.data ?? [];
  const overview = designerOverview({
    projects: list,
    versions: designerVersions(
      versions.data?.versions ?? [],
      versions.data?.deliverables ?? [],
      list,
    ),
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
          <small>sent back for changes</small>
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
              <span className={statusToneClass(projectStatusTones[project.status])}>
                {statusLabels[project.status]}
              </span>
            </Link>
          ))}
        </OverviewPanel>
        <OverviewPanel eyebrow="Needs you" title="Your turn" empty="Nothing sent back to you.">
          {overview.yourTurnRows.map((row) => (
            <Link key={row.id} className="overview-row" href={`/projects/${row.projectId}`}>
              <strong>
                {row.title} · {row.deliverable}
              </strong>
              <span className="overview-row-meta">
                Changes requested · {relativeAge(row.date, now, formatDayKey)}
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
