"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, ArrowUpRight, FolderKanban, Plus } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  formatDate,
  statusLabels,
  useClients,
  useProjects,
  useWorkspaceCampaigns,
} from "./workspace-data";
import { PageStatus } from "@/features/shared/page-status";

export function HomePage() {
  const { profile } = useAuth();
  const clients = useClients();
  const router = useRouter();
  useEffect(() => {
    if (profile?.role === "client" && clients.data?.length === 1)
      router.replace(`/clients/${clients.data[0].id}/board`);
  }, [profile, clients.data, router]);
  const projects = useProjects();
  const campaigns = useWorkspaceCampaigns();
  const activeProjects = projects.data?.filter((project) => project.status !== "delivered") ?? [];
  const reviewProjects = activeProjects.filter((project) =>
    ["client_review", "internal_review", "changes_requested"].includes(project.status),
  );
  const countOf = (status: string) =>
    activeProjects.filter((project) => project.status === status).length;
  // One row of figures that decomposes the work, so "needs attention" says who it is waiting on
  // rather than only that something is waiting. Its parts sum to the badge beside the table.
  const tiles = [
    { label: "Active projects", value: activeProjects.length },
    { label: statusLabels.internal_review, value: countOf("internal_review") },
    { label: statusLabels.client_review, value: countOf("client_review") },
    { label: statusLabels.changes_requested, value: countOf("changes_requested") },
    { label: statusLabels.approved, value: countOf("approved") },
    {
      label: profile?.role === "agency" ? "Client workspaces" : "Your workspaces",
      value: clients.data?.length ?? 0,
    },
  ];
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  if (
    clients.isPending ||
    projects.isPending ||
    (profile?.role === "client" && clients.data?.length === 1)
  )
    return <PageStatus>Gathering your workspace…</PageStatus>;
  if (clients.error || projects.error)
    return (
      <div className="page-content">
        <h1>We couldn’t load your work.</h1>
        <button
          className="button"
          onClick={() => {
            void clients.refetch();
            void projects.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  return (
    <div className="page-content home-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR CREATIVE WORKSPACE</span>
          <h1>
            {profile?.role === "agency"
              ? "Overview"
              : profile?.role === "designer"
                ? "My work"
                : "Your workspaces"}
          </h1>
          <p>
            {profile?.role === "agency"
              ? "Projects and next steps across your clients."
              : "Your projects and next steps."}
          </p>
        </div>
        <span className="home-date">{today}</span>
        {profile?.role === "agency" && (
          <Link className="button" href="/settings/clients">
            <Plus size={16} />
            New client
          </Link>
        )}
      </div>
      <div className="overview-stats">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
      <section className="attention-section">
        <div className="section-heading">
          <div>
            <h2>Needs attention</h2>
            <p>Work ready for its next move.</p>
          </div>
          <span className="count-badge">{reviewProjects.length}</span>
        </div>
        {reviewProjects.length ? (
          <div className="project-table">
            <div className="table-head">
              <span>PROJECT</span>
              <span>WORKSPACE</span>
              <span>STATUS</span>
              <span>DUE</span>
              <span />
            </div>
            {reviewProjects.map((project) => (
              <Link key={project.id} className="project-row" href={`/projects/${project.id}`}>
                <span className="project-title">
                  <span className="project-symbol">
                    <FolderKanban size={17} />
                  </span>
                  <strong>{project.title}</strong>
                </span>
                <span className="project-origin">
                  {clients.data?.find((client) => client.id === project.client_id)?.name}
                  {project.campaign_id && (
                    <small>
                      {campaigns.data?.find((item) => item.id === project.campaign_id)?.title}
                    </small>
                  )}
                </span>
                <span>
                  <span className={`status-badge ${project.status}`}>
                    {statusLabels[project.status]}
                  </span>
                </span>
                <span>{formatDate(project.due_date)}</span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <FolderKanban size={26} />
            <h3>Nothing waiting on you.</h3>
            <p>Your next steps will appear here as work moves forward.</p>
          </div>
        )}
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>Client workspaces</h2>
            <p>Projects, files, and brand direction for each client.</p>
          </div>
        </div>
        <div className="workspace-grid">
          {clients.data?.map((client) => {
            const clientProjects = activeProjects.filter(
              (project) => project.client_id === client.id,
            );
            return (
              <Link key={client.id} className="workspace-card" href={`/clients/${client.id}/board`}>
                <div className="workspace-card-top">
                  <span className="brand-monogram">
                    {client.initials || client.name.slice(0, 2)}
                  </span>
                  <ArrowUpRight size={17} />
                </div>
                <h3>{client.name}</h3>
                <p>{client.industry || client.description || "A space for good work."}</p>
                <div className="workspace-card-footer">
                  <span>
                    {clientProjects.length} active project{clientProjects.length === 1 ? "" : "s"}
                  </span>
                  <ArrowRight size={15} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
