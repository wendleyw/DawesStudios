"use client";

import {
  Background,
  BackgroundVariant,
  PanOnScrollMode,
  ReactFlow,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import {
  projectStatusTones,
  statusLabels,
  useDateFormat,
  useClients,
  useInvalidateWorkspace,
  useProjects,
  type Project,
} from "@/features/workspace/workspace-data";
import { statusToneClass } from "@/features/shared/status-tone";

import {
  FRAME_HEAD,
  FRAME_PAD,
  MAX_COLUMN,
  MAX_SPLIT,
  isTwoColumn,
  orderCampaigns,
} from "./board-layout";
import { projectHref } from "./project-open";
import { smallestScaleFor, type TimelineScale } from "./timeline-model";
import { mondayOf } from "./timeline-model";
import { boardNodeTypes } from "./board-nodes";
import { boardStatuses, selectionFromChanges, type PlanningMode } from "./planning-view";
import { useBoardCampaigns, useProjectArtwork, moveProjectPosition } from "./board-data";
import { BoardCanvasControls } from "./board-canvas-controls";
import { useBoardCanvasNodes } from "./board-canvas-nodes";
import { CampaignDialog } from "@/features/campaigns/campaign-dialog";
import { ClientMark } from "@/features/workspace/client-mark";
import { NotificationsBell } from "@/features/workspace/notifications-bell";
import "./board.css";
import { FormError } from "@/features/shared/form-error";
import { PageStatus } from "@/features/shared/page-status";
import { SearchField } from "@/features/shared/search-field";

type BoardLayout = "canvas" | "list";
const GUTTER = 24;

export function BoardPage({ clientId }: { clientId: string }) {
  const { database, profile } = useAuth();
  const { formatDate } = useDateFormat();
  const invalidateWorkspace = useInvalidateWorkspace();
  const router = useRouter();
  const clients = useClients();
  const projects = useProjects(clientId);
  // A callback ref rather than a `useRef`: the canvas only exists once the board's data has
  // arrived, and an effect that reads a ref filled after its own run would observe nothing and
  // leave the board measured at the opening guess for good.
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  // The board is only fitted once the canvas has actually been measured; fitting against the
  // initial guess would frame the board for a viewport that never existed.
  const [measured, setMeasured] = useState(false);
  const [layout, setLayout] = useState<BoardLayout>("canvas");
  // Screen width picks the opening layout; once the viewer chooses one it stands, so crossing the
  // breakpoint and back no longer discards the choice and Canvas stays reachable on a phone.
  const layoutChosen = useRef(false);
  const chooseLayout = (next: BoardLayout) => {
    layoutChosen.current = true;
    setLayout(next);
  };
  const [planningOpen, setPlanningOpen] = useState(true);
  const [planningMode, setPlanningMode] = useState<PlanningMode>("timeline");
  // Which card is selected is board state; opening one leaves the board for the project's own
  // canvas, so there is nothing else to remember.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // The period lives here so switching to Kanban and back does not silently jump to today.
  const [period, setPeriod] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));
  // Null means the viewer has not chosen, so the board follows the work. Deriving this rather than
  // syncing state to it in an effect keeps the opening scale correct on the very first render.
  const [chosenScale, setChosenScale] = useState<TimelineScale | null>(null);
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterMenu = useRef<HTMLDivElement>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // The board opens as a table on phones, where a pannable stack is the wrong reading surface.
  // The breakpoint matches the stylesheet rather than the old 720px value it disagreed with.
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 640px)");
    const apply = () => {
      if (!layoutChosen.current) setLayout(narrow.matches ? "list" : "canvas");
    };
    apply();
    narrow.addEventListener("change", apply);
    return () => narrow.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
      setMeasured(true);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvas]);

  const campaigns = useBoardCampaigns(clientId);
  const client = clients.data?.find((item) => item.id === clientId);
  const canMove = profile?.role === "agency";
  const canCreate = profile?.role !== "designer";
  const moveProject = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: { x: number; y: number } }) =>
      moveProjectPosition(database, { id, position }),
    onSuccess: () => invalidateWorkspace(),
    onError: (_error, variables) =>
      setPositions((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      }),
  });
  useEffect(() => {
    if (!filtersOpen) return;
    function dismiss(event: Event) {
      if (event.target instanceof globalThis.Node && !filterMenu.current?.contains(event.target))
        setFiltersOpen(false);
    }
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", close);
    };
  }, [filtersOpen]);

  const filtered = Boolean(search || campaign || status);
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
  const campaignName = useCallback(
    (id: string | null) =>
      campaigns.data?.find((item) => item.id === id)?.title ?? "Studio projects",
    [campaigns.data],
  );
  const campaignOrder = useMemo(
    () => orderCampaigns(campaigns.data ?? []).map((item) => item.id),
    [campaigns.data],
  );
  const clearFilters = useCallback(() => {
    setCampaign("");
    setStatus("");
    setSearch("");
  }, []);

  // Both records are resolved against the board's own scope rather than trusted from state, so
  // moving to another workspace cannot leave a stranger's project open inside Planning. Filters
  // narrow what is drawn, not what may be open, so hiding a card does not close it.
  const scope = useMemo(() => projects.data ?? [], [projects.data]);
  const selectedProject = useMemo(
    () => scope.find((item) => item.id === selectedProjectId) ?? null,
    [scope, selectedProjectId],
  );
  // One rule for every surface on the board: a click selects, a double click opens the project's
  // own canvas. `project-open.ts` states it; this is where the board acts on it.
  const openProject = useCallback(
    (projectId: string) => router.push(projectHref(projectId)),
    [router],
  );
  // The board opens on the smallest scale that contains its work, so a project running past a
  // fortnight is visible without the viewer first finding the control. Their own choice then wins.
  const scale = chosenScale ?? smallestScaleFor(scope);
  const projectIds = useMemo(() => scope.map((item) => item.id), [scope]);
  const artwork = useProjectArtwork(projectIds);

  // Two columns need more room than a single reading column, so the cap is raised once the board
  // is wide enough to split — while still leaving a gutter the zoom controls sit clear of.
  const usable = viewport.width - GUTTER * 2;
  const column = Math.max(320, Math.min(isTwoColumn(usable) ? MAX_SPLIT : MAX_COLUMN, usable));
  const { nodes, content } = useBoardCanvasNodes({
    filteredProjects,
    campaigns: campaigns.data,
    column,
    viewportWidth: viewport.width,
    planningOpen,
    planningMode,
    period,
    setPeriod,
    scale,
    setChosenScale,
    setPlanningOpen,
    setPlanningMode,
    campaignOrder,
    canCreate,
    canMove,
    filtered,
    positions,
    campaignName,
    clearFilters,
    clientId,
    setCreatingCampaign,
    openProject,
    selectedProjectId,
    setSelectedProjectId,
    artwork: artwork.data,
  });

  function changeNodes(changes: NodeChange<Node>[]) {
    // Selection is controlled, so xyflow reports the click and the board records it; a selection
    // it does not record is thrown away the next time the node array is rebuilt. Recording it
    // here — after the click, never on hover — also keeps the array stable while a pointer is
    // down, which is what a card needs to receive the click at all.
    setSelectedProjectId((current) => selectionFromChanges(changes, current));
    if (!canMove) return;
    if (!changes.some((change) => change.type === "position" && change.position)) return;
    setPositions((current) => {
      const next = { ...current };
      for (const change of changes)
        if (change.type === "position" && change.position)
          next[change.id] = {
            x: Math.max(FRAME_PAD, change.position.x),
            y: Math.max(FRAME_HEAD + FRAME_PAD, change.position.y),
          };
      return next;
    });
  }

  if (clients.isPending || projects.isPending) return <PageStatus>Loading the board…</PageStatus>;
  if (!client || projects.error)
    return (
      <div className="page-content">
        <h1>Board unavailable.</h1>
        <p>This client is unavailable or you do not have access.</p>
        <Link href="/home" className="button">
          Back to your work
        </Link>
      </div>
    );

  return (
    <div className={`board-page ${layout === "canvas" ? "shows-canvas" : ""}`}>
      {/* The board opens on whose work it is: the client's own mark and name, large enough to read
          as the title of the surface below it, with the board's own controls on the same row. The
          topbar above carries nothing but the global actions. */}
      <header className="board-identity">
        <div className="board-identity-name">
          <ClientMark client={client} className="board-identity-mark" />
          <div className="board-identity-text">
            <h1>{client.name}</h1>
            <p>Project board</p>
          </div>
        </div>
        <div className="board-tools">
          <SearchField
            label="Search projects"
            value={search}
            onChange={setSearch}
            placeholder="Find a project…"
            iconSize={16}
          />
          <div className="board-filter-menu" ref={filterMenu}>
            <button
              className={`button quiet ${filtersOpen ? "selected" : ""}`}
              onClick={() => setFiltersOpen(!filtersOpen)}
              aria-expanded={filtersOpen}
              aria-label="Filters"
            >
              <SlidersHorizontal size={15} />
              <span className="button-label">Filters</span>
              {(campaign || status) && <span className="filter-indicator" />}
            </button>
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
                    {boardStatuses.map((item) => (
                      <option key={item} value={item}>
                        {statusLabels[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="board-filter-actions">
                  <button className="button quiet" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>
          <span className="board-result-count">
            {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}
          </span>
          <div className="segmented-control" role="group" aria-label="Board layout">
            <button aria-pressed={layout === "canvas"} onClick={() => chooseLayout("canvas")}>
              Canvas view
            </button>
            <button aria-pressed={layout === "list"} onClick={() => chooseLayout("list")}>
              List view
            </button>
          </div>
          {canCreate && (
            <Link
              href={`/clients/${clientId}/briefings/new`}
              className="button primary"
              aria-label="New briefing"
            >
              <Plus size={16} />
              <span className="button-label">New briefing</span>
            </Link>
          )}
          {/* The board takes the top of the workspace, so it also carries the global marker the
              topbar would have held. Below 901px the topbar is still there and hides this one. */}
          <NotificationsBell className="page-bell" />
        </div>
      </header>
      {/* A click selects and a double click leaves the board, so selection is the only outcome
          that stays here to be announced. */}
      <p className="visually-hidden" role="status">
        {selectedProject ? `${selectedProject.title} selected.` : ""}
      </p>
      {moveProject.error && (
        <FormError>The new position could not be saved. Please try again.</FormError>
      )}
      {layout === "canvas" ? (
        <div className="board-canvas" aria-label="Project canvas" ref={setCanvas}>
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={boardNodeTypes}
            proOptions={{ hideAttribution: true }}
            onNodesChange={changeNodes}
            onNodeDragStop={(_event, node) =>
              moveProject.mutate({ id: node.id, position: node.position })
            }
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.4}
            maxZoom={1.5}
            nodeDragThreshold={4}
            nodesConnectable={false}
            deleteKeyCode={null}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Vertical}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4d4d0" />
            <BoardCanvasControls
              content={content}
              view={viewport}
              fitKey={measured ? clientId : ""}
            />
          </ReactFlow>
        </div>
      ) : (
        <div className="board-list project-table">
          <div className="table-head">
            <span>PROJECT</span>
            <span>CAMPAIGN</span>
            <span>STATUS</span>
            <span>DUE</span>
            <span />
          </div>
          {/* The head stays put when nothing matches, so a filtered table still reads as the same
              table rather than as a different screen. */}
          {filteredProjects.length === 0 && (
            <div className="empty-state board-list-empty">
              <h2>{filtered ? "No projects match." : "A fresh space for your next idea."}</h2>
              <p>
                {filtered
                  ? "Try a different search or clear your filters."
                  : "Start with a briefing. We’ll take it from there."}
              </p>
              {filtered && (
                <button className="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
          {filteredProjects.map((project: Project) => (
            <Link key={project.id} href={projectHref(project.id)} className="project-row">
              <strong title={project.title}>{project.title}</strong>
              <span>{campaignName(project.campaign_id)}</span>
              <span>
                <span className={statusToneClass(projectStatusTones[project.status])}>
                  {statusLabels[project.status]}
                </span>
              </span>
              <span>{formatDate(project.due_date, "No due date")}</span>
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
