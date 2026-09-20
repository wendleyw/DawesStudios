"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  GripHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  formatDate,
  statusLabels,
  useClients,
  useProjects,
  type Project,
  type ProjectStatus,
} from "@/features/workspace/workspace-data";
import { assertResult } from "@/lib/supabase";

import { ProjectTimeline } from "./project-timeline";
import { CampaignDialog } from "@/features/campaigns/campaign-dialog";

type BoardNode = Node<{ project: Project; campaign: string; canMove: boolean }, "project">;
type BoardView = "canvas" | "kanban" | "list" | "timeline";
const visibleStatuses: ProjectStatus[] = [
  "planned",
  "in_progress",
  "internal_review",
  "client_review",
  "changes_requested",
  "approved",
  "delivered",
];

const ProjectNode = memo(function ProjectNode({ data }: NodeProps<BoardNode>) {
  return (
    <article className="board-card">
      {data.canMove && (
        <div className="board-card-grip" title="Drag to arrange">
          <GripHorizontal size={17} />
        </div>
      )}
      <Link
        aria-label={data.project.title}
        className="nodrag board-card-body"
        href={`/projects/${data.project.id}`}
      >
        <div className="board-card-meta">
          <span>{data.campaign}</span>
          <ArrowUpRight size={16} />
        </div>
        <h2>{data.project.title}</h2>
        <p>{data.project.description || "A new idea, taking shape."}</p>
        <div className="board-card-footer">
          <span className={`status-badge ${data.project.status}`}>
            {statusLabels[data.project.status]}
          </span>
          <span>
            <CalendarDays size={13} />
            {formatDate(data.project.due_date)}
          </span>
        </div>
      </Link>
    </article>
  );
});
const nodeTypes = { project: ProjectNode };

export function BoardPage({ clientId }: { clientId: string }) {
  const { database, profile, session } = useAuth();
  const queryClient = useQueryClient();
  const clients = useClients();
  const projects = useProjects(clientId);
  const [narrowScreen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches,
  );
  const [view, setView] = useState<BoardView>(narrowScreen ? "list" : "canvas");
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const campaigns = useQuery({
    queryKey: ["campaigns", session?.user.id, clientId],
    queryFn: async () =>
      assertResult(
        await database
          .from("campaigns")
          .select("id, title")
          .eq("client_id", clientId)
          .order("title"),
      ) as { id: string; title: string }[],
  });
  const client = clients.data?.find((item) => item.id === clientId);
  const canMove = profile?.role === "agency";
  const moveProject = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: { x: number; y: number } }) =>
      assertResult(
        await database
          .from("projects")
          .update({ board_position: position })
          .eq("id", id)
          .select("id")
          .single(),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: (_error, variables) =>
      setPositions((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      }),
  });
  const filteredProjects = useMemo(
    () =>
      (projects.data ?? []).filter(
        (project) =>
          (!search ||
            `${project.title} ${project.description}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!campaign || project.campaign_id === campaign) &&
          (!status || project.status === status),
      ),
    [projects.data, search, campaign, status],
  );
  const campaignName = (id: string | null) =>
    campaigns.data?.find((item) => item.id === id)?.title ?? "Studio project";
  const nodes: BoardNode[] = filteredProjects.map((project, index) => ({
    id: project.id,
    type: "project",
    position:
      positions[project.id] ??
      (project.board_position.x || project.board_position.y
        ? project.board_position
        : { x: (index % 3) * 312, y: Math.floor(index / 3) * 240 }),
    data: { project, campaign: campaignName(project.campaign_id), canMove },
    draggable: canMove,
    dragHandle: ".board-card-grip",
    style: { width: 280 },
    ariaLabel: project.title,
  }));

  function changeNodes(changes: NodeChange<BoardNode>[]) {
    if (!canMove) return;
    if (!changes.some((change) => change.type === "position" && change.position)) return;
    setPositions((current) => {
      const next = { ...current };
      for (const change of changes)
        if (change.type === "position" && change.position) next[change.id] = change.position;
      return next;
    });
  }
  if (clients.isPending || projects.isPending)
    return (
      <div className="page-content" role="status">
        Opening the board…
      </div>
    );
  if (!client || projects.error)
    return (
      <div className="page-content">
        <h1>Board unavailable.</h1>
        <p>This workspace is unavailable or you do not have access.</p>
        <Link href="/home" className="button">
          Back to your work
        </Link>
      </div>
    );

  return (
    <div className="board-page">
      <div className="board-header">
        <div>
          <span className="eyebrow">{client.industry || "YOUR WORKSPACE"}</span>
          <h1>
            {client.name}
            <span className="subtle-count">{projects.data?.length}</span>
          </h1>
        </div>
        <div className="board-header-actions">
          <label className="visually-hidden" htmlFor="board-view">
            Board view
          </label>
          <select
            id="board-view"
            value={view}
            onChange={(event) => setView(event.target.value as BoardView)}
          >
            <option value="canvas">Canvas view</option>
            <option value="kanban">Kanban view</option>
            <option value="list">List view</option>
            <option value="timeline">Timeline view</option>
          </select>
          {profile?.role !== "designer" && (
            <Link href={`/clients/${clientId}/briefings/new`} className="button primary">
              <Plus size={16} />
              New briefing
            </Link>
          )}
        </div>
      </div>
      <div className="board-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search projects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a project…"
          />
        </label>
        <button
          className={`button quiet ${filtersOpen ? "selected" : ""}`}
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal size={15} />
          Filters{(campaign || status) && <span className="filter-indicator" />}
        </button>
        <span className="board-result-count">
          {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}
        </span>
      </div>
      {filtersOpen && (
        <div className="board-filters">
          <label>
            Campaign
            <select value={campaign} onChange={(event) => setCampaign(event.target.value)}>
              <option value="">All campaigns</option>
              {campaigns.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {visibleStatuses.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button quiet"
            onClick={() => {
              setCampaign("");
              setStatus("");
              setSearch("");
            }}
          >
            Clear filters
          </button>
          {profile?.role === "agency" && (
            <button className="button quiet" onClick={() => setCreatingCampaign(true)}>
              <Plus size={14} />
              New campaign
            </button>
          )}
        </div>
      )}
      {moveProject.error && (
        <p className="form-error" role="alert">
          The new position could not be saved. Please try again.
        </p>
      )}
      {filteredProjects.length === 0 ? (
        <div className="empty-state">
          <h2>
            {projects.data?.length ? "No projects match." : "A fresh space for your next idea."}
          </h2>
          <p>
            {projects.data?.length
              ? "Try a different search or clear your filters."
              : "Start with a briefing. We’ll take it from there."}
          </p>
        </div>
      ) : view === "canvas" ? (
        <div className="board-canvas" aria-label="Project canvas">
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={nodeTypes}
            onNodesChange={changeNodes}
            onNodeDragStop={(_event, node) =>
              moveProject.mutate({ id: node.id, position: node.position })
            }
            fitView
            fitViewOptions={{
              padding: 0.22,
              maxZoom: 1,
              ...(narrowScreen && nodes[0] ? { minZoom: 0.8, nodes: [{ id: nodes[0].id }] } : {}),
            }}
            minZoom={0.25}
            maxZoom={1.5}
            nodesConnectable={false}
            deleteKeyCode={null}
            panOnScroll
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4d4d0" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      ) : view === "kanban" ? (
        <div className="kanban-board">
          {visibleStatuses.map((column) => (
            <section className="kanban-column" key={column}>
              <div className="kanban-heading">
                <h2>{statusLabels[column]}</h2>
                <span>
                  {filteredProjects.filter((project) => project.status === column).length}
                </span>
              </div>
              {filteredProjects
                .filter((project) => project.status === column)
                .map((project) => (
                  <article key={project.id} className="board-card">
                    <Link href={`/projects/${project.id}`} className="board-card-body">
                      <span className="eyebrow">{campaignName(project.campaign_id)}</span>
                      <h3>{project.title}</h3>
                      <p>{formatDate(project.due_date)}</p>
                    </Link>
                  </article>
                ))}
            </section>
          ))}
        </div>
      ) : view === "timeline" ? (
        <ProjectTimeline projects={filteredProjects} />
      ) : (
        <div className="board-list project-table">
          <div className="table-head">
            <span>PROJECT</span>
            <span>CAMPAIGN</span>
            <span>STATUS</span>
            <span>DUE</span>
            <span />
          </div>
          {filteredProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="project-row">
              <strong>{project.title}</strong>
              <span>{campaignName(project.campaign_id)}</span>
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
      )}
      {creatingCampaign && (
        <CampaignDialog
          clientId={clientId}
          onClose={() => setCreatingCampaign(false)}
          onCreated={setCampaign}
        />
      )}
    </div>
  );
}
