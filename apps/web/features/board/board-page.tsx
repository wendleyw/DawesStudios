"use client";

import { CanvasBackground } from "@/features/shared/canvas-background";
import { canvasNavigation } from "@/features/shared/canvas-navigation";

import { ReactFlow, type Node, type NodeChange } from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
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

import { FRAME_HEAD, FRAME_PAD, dropCard, orderCampaigns } from "./board-layout";
import {
  LIST_SORT_COLUMNS,
  LIST_SORT_OPTIONS,
  listSortAccessibleName,
  listSortFromOptionValue,
  listSortOptionValue,
  nextListSort,
  sortProjects,
  type ListSort,
} from "./list-sort";
import { projectHref } from "./project-open";
import { smallestScaleFor, timelineScales, type TimelineScale } from "./timeline-model";
import { mondayOf } from "./timeline-model";
import { boardNodeTypes } from "./board-nodes";
import { selectionFromChanges } from "./planning-view";
import {
  addBoardWidget,
  removeBoardWidget,
  useBoardCampaigns,
  useBoardPreferences,
  useBoardWidgets,
  useProjectArtwork,
  moveProjectPosition,
  saveBoardView,
} from "./board-data";
import type { BoardView } from "./board-views";
import { BoardToolbar } from "./board-toolbar";
import { BoardHeader } from "./board-header";
import { periodStart, projectInPeriod } from "./board-period";
import { ProjectTimeline } from "./project-timeline";
import { BoardKanban } from "./board-kanban";
import { BoardCalendar } from "./board-calendar";
import { monthStart } from "./calendar-model";
import { BoardCanvasControls } from "./board-canvas-controls";
import { useBoardCanvasNodes } from "./board-canvas-nodes";
import { CampaignDialog } from "@/features/campaigns/campaign-dialog";
import { useCompetitors } from "@/features/competitors/competitors-data";
import "./board.css";
import { FormError } from "@/features/shared/form-error";
import { PageStatus } from "@/features/shared/page-status";

export function BoardPage({ clientId }: { clientId: string }) {
  return <ClientBoard key={clientId} clientId={clientId} />;
}

function ClientBoard({ clientId }: { clientId: string }) {
  const { database, profile } = useAuth();
  const { formatDate } = useDateFormat();
  const invalidateWorkspace = useInvalidateWorkspace();
  const router = useRouter();
  const clients = useClients();
  const projects = useProjects(clientId);
  const preferences = useBoardPreferences(clientId);
  const [pendingView, setPendingView] = useState<BoardView | null>(null);
  const persistView = useMutation({
    mutationFn: async (view: BoardView) => saveBoardView(database, { clientId, view }),
    onSuccess: async () => {
      await preferences.refetch();
    },
    onSettled: () => setPendingView(null),
  });
  // A viewer who has never chosen a view opens the board as a list, on every screen size.
  const layout = pendingView ?? preferences.data ?? "list";
  const chooseLayout = (view: BoardView) => {
    setPendingView(view);
    persistView.mutate(view);
  };
  const viewsDisabled = preferences.isPending || !!preferences.error || pendingView !== null;
  // A callback ref rather than a `useRef`: the canvas only exists once the board's data has
  // arrived, and an effect that reads a ref filled after its own run would observe nothing and
  // leave the board measured at the opening guess for good.
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const [zoomDock, setZoomDock] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  // The board is only fitted once the canvas has actually been measured; fitting against the
  // initial guess would frame the board for a viewport that never existed.
  const [measuredCanvas, setMeasuredCanvas] = useState<HTMLDivElement | null>(null);
  // Which card is selected is board state; opening one leaves the board for the project's own
  // canvas, so there is nothing else to remember.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Each planning view keeps its period while the viewer switches views.
  const [month, setMonth] = useState(() => monthStart(new Date().toISOString().slice(0, 10)));
  const [period, setPeriod] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));
  // Null means the viewer has not chosen, so the board follows the work. Deriving this rather than
  // syncing state to it in an effect keeps the opening scale correct on the very first render.
  const [chosenScale, setChosenScale] = useState<TimelineScale | null>(null);
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState("");
  const [quarter, setQuarter] = useState("");
  // List view column sort: `null` keeps today's (`filteredProjects`) order until a header is
  // clicked. It lives here like the period filter — kept for the board visit, surviving view
  // switches, untouched by Clear filters, and reset only when switching clients remounts the board.
  const [listSort, setListSort] = useState<ListSort>(null);
  const listSortSelectId = useId();
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  // The card under the pointer and the grid cell it left, so a drop onto another card can swap them.
  const [dragging, setDragging] = useState<{ id: string; origin: { x: number; y: number } } | null>(
    null,
  );

  // The floating header wraps differently at every width and with every client name, so the
  // space the views reserve beneath it is measured rather than guessed: its bottom edge plus the
  // stylesheet's `--board-header-gap` (16px, like the other client pages; 12px on short screens).
  // The stylesheet's breakpoint values remain the first-paint fallback.
  const [workArea, setWorkArea] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const header = workArea?.querySelector<HTMLElement>(".board-header");
    if (!workArea || !header) return;
    const observer = new ResizeObserver(() => {
      const gap = Number.parseFloat(
        getComputedStyle(workArea).getPropertyValue("--board-header-gap"),
      );
      workArea.style.setProperty(
        "--board-header-space",
        `${header.offsetTop + header.offsetHeight + (Number.isNaN(gap) ? 16 : gap)}px`,
      );
    });
    // The gap changes with the viewport height even when the header's size does not.
    observer.observe(header);
    observer.observe(workArea);
    return () => observer.disconnect();
  }, [workArea]);

  useEffect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
      setMeasuredCanvas(canvas);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvas]);

  const campaigns = useBoardCampaigns(clientId);
  const client = clients.data?.find((item) => item.id === clientId);
  const canMove = profile?.role === "agency";
  const canCreate = profile?.role !== "designer";
  // Only the studio side reads widgets or competitors; a client's board never asks.
  const studioSide = profile?.role === "agency" || profile?.role === "designer";
  const widgets = useBoardWidgets(clientId, studioSide);
  const competitorWidgetPlaced = !!widgets.data?.includes("competitor_ads");
  const competitors = useCompetitors(clientId, studioSide && competitorWidgetPlaced);
  const competitorCount = competitors.data?.length ?? 0;
  const toggleWidget = useMutation({
    mutationFn: async (placed: boolean) =>
      placed
        ? removeBoardWidget(database, { clientId, kind: "competitor_ads" })
        : addBoardWidget(database, { clientId, kind: "competitor_ads" }),
    onSuccess: () => widgets.refetch(),
  });
  const { mutate: setWidgetPlaced } = toggleWidget;
  const removeCompetitorWidget = useCallback(() => setWidgetPlaced(true), [setWidgetPlaced]);
  const competitorWidget = useMemo(
    () =>
      competitorWidgetPlaced
        ? {
            count: competitorCount,
            canEdit: canMove,
            removing: toggleWidget.isPending,
            onRemove: removeCompetitorWidget,
          }
        : undefined,
    [
      competitorWidgetPlaced,
      competitorCount,
      canMove,
      toggleWidget.isPending,
      removeCompetitorWidget,
    ],
  );
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
  const currentYear = new Date().getUTCFullYear();
  const periodYears = [
    ...new Set([
      currentYear - 1,
      currentYear,
      currentYear + 1,
      ...(projects.data ?? []).flatMap((project) =>
        [project.start_date, project.due_date]
          .filter((date): date is string => !!date)
          .map((date) => Number(date.slice(0, 4))),
      ),
    ]),
  ].sort((a, b) => a - b);
  function choosePeriod(value: string) {
    setQuarter(value);
    const start = periodStart(value);
    if (start) {
      setMonth(start);
      setPeriod(mondayOf(start));
      setChosenScale("quarter");
    }
  }
  const filtered = Boolean(search || campaign || status || quarter);
  const filteredProjects = useMemo(
    () =>
      (projects.data ?? []).filter(
        (project) =>
          (!search ||
            `${project.title} ${project.description}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!campaign || project.campaign_id === campaign) &&
          (!status || project.status === status) &&
          projectInPeriod(project, quarter),
      ),
    [projects.data, search, campaign, status, quarter],
  );
  const campaignName = useCallback(
    (id: string | null) =>
      campaigns.data?.find((item) => item.id === id)?.title ?? "Studio projects",
    [campaigns.data],
  );
  // Only the List view reads this; other views keep reading `filteredProjects` directly.
  const sortedProjects = useMemo(
    () => sortProjects(filteredProjects, listSort, campaignName),
    [filteredProjects, listSort, campaignName],
  );
  const campaignOrder = useMemo(
    () => orderCampaigns(campaigns.data ?? []).map((item) => item.id),
    [campaigns.data],
  );
  const clearFilters = useCallback(() => {
    setCampaign("");
    setStatus("");
    setSearch("");
    setQuarter("");
  }, []);

  // Both records are resolved against the board's own scope rather than trusted from state, so
  // moving to another workspace cannot leave a stranger's project selected. Filters
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

  const { nodes, content } = useBoardCanvasNodes({
    filteredProjects,
    campaigns: campaigns.data,
    canCreate,
    canMove,
    filtered,
    selectedCampaignId: campaign || undefined,
    hasSearch: Boolean(search),
    positions,
    dragging: dragging?.id ?? null,
    clearFilters,
    clientId,
    setCreatingCampaign,
    openProject,
    selectedProjectId,
    artwork: artwork.data,
    competitorWidget,
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

  /** Settles a dropped card on its frame's grid, swapping with a card it lands on, and saves it. */
  function settleCard(dropped: Node) {
    const origin = dragging?.id === dropped.id ? dragging.origin : dropped.position;
    setDragging(null);
    const frame = nodes.find((node) => node.id === dropped.parentId);
    const siblings = nodes.filter((node) => node.parentId === dropped.parentId);
    const moves = dropCard({
      id: dropped.id,
      drop: dropped.position,
      origin,
      frameWidth: frame?.width ?? 0,
      cards: Object.fromEntries(
        siblings.filter((node) => node.type === "project").map((node) => [node.id, node.position]),
      ),
      slot: siblings.find((node) => node.type === "briefingSlot")?.position ?? null,
    });
    setPositions((current) => ({ ...current, ...moves }));
    for (const [id, position] of Object.entries(moves)) moveProject.mutate({ id, position });
  }

  // Campaign frames determine the opening bounds; fitting before they arrive uses an empty stack.
  if (clients.isPending || projects.isPending || campaigns.isPending)
    return <PageStatus>Loading the board…</PageStatus>;
  if (!client || clients.error || projects.error || campaigns.error)
    return (
      <div className="page-content">
        <h1>Board unavailable.</h1>
        <p>This client is unavailable or you do not have access.</p>
        <button
          className="button"
          onClick={() => {
            void clients.refetch();
            void projects.refetch();
            void campaigns.refetch();
          }}
        >
          Try again
        </button>
        <Link href="/home" className="button">
          Back to your work
        </Link>
      </div>
    );
  if (preferences.isPending) return <PageStatus>Loading the board…</PageStatus>;

  return (
    <div className={`board-page shows-${layout}`}>
      <div className="board-work-area" ref={setWorkArea}>
        <BoardHeader
          client={client}
          viewer={profile}
          period={quarter}
          years={periodYears}
          onPeriod={choosePeriod}
        />
        <div className="board-tool-dock">
          <BoardToolbar
            clientId={clientId}
            view={layout}
            onView={chooseLayout}
            disabled={viewsDisabled}
            canCreate={canCreate}
            search={search}
            onSearch={setSearch}
            campaign={campaign}
            onCampaign={setCampaign}
            status={status}
            onStatus={setStatus}
            campaigns={campaigns.data ?? []}
            resultCount={filteredProjects.length}
            onClear={clearFilters}
            widgets={
              canMove && layout === "canvas"
                ? {
                    placed: competitorWidgetPlaced,
                    pending: toggleWidget.isPending || widgets.isPending,
                    error: toggleWidget.error?.message ?? null,
                    onToggle: () => setWidgetPlaced(competitorWidgetPlaced),
                  }
                : undefined
            }
          />
          {layout === "canvas" && <div className="board-zoom-dock" ref={setZoomDock} />}
        </div>
        {/* A click selects and a double click leaves the board, so selection is the only outcome
          that stays here to be announced. */}
        <p className="visually-hidden" role="status">
          {selectedProject ? `${selectedProject.title} selected.` : ""}
        </p>
        {(moveProject.error || preferences.error || persistView.error) && (
          <div className="board-notices">
            {moveProject.error && (
              <FormError>The new position could not be saved. Please try again.</FormError>
            )}
            {preferences.error && (
              <FormError>
                Your board view could not be loaded.{" "}
                <button className="button quiet" onClick={() => void preferences.refetch()}>
                  Try again
                </button>
              </FormError>
            )}
            {persistView.error && (
              <FormError>
                Your board view could not be saved.{" "}
                <button
                  className="button quiet"
                  disabled={persistView.isPending}
                  onClick={() => persistView.variables && chooseLayout(persistView.variables)}
                >
                  Try again
                </button>
              </FormError>
            )}
          </div>
        )}
        <p className="visually-hidden" role="status">
          {persistView.isPending ? "Saving board view…" : ""}
        </p>
        {layout === "canvas" ? (
          <div className="board-canvas" aria-label="Project canvas" ref={setCanvas}>
            <ReactFlow
              {...canvasNavigation}
              nodes={nodes}
              edges={[]}
              nodeTypes={boardNodeTypes}
              proOptions={{ hideAttribution: true }}
              onNodesChange={changeNodes}
              onNodeDragStart={(_event, node) =>
                setDragging({ id: node.id, origin: node.position })
              }
              onNodeDragStop={(_event, node) => settleCard(node)}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              minZoom={0.1}
              maxZoom={1.5}
              nodeDragThreshold={4}
              nodesConnectable={false}
              deleteKeyCode={null}
            >
              <CanvasBackground />
              <BoardCanvasControls
                content={content}
                view={viewport}
                portalTarget={zoomDock}
                fitKey={
                  canvas && measuredCanvas === canvas
                    ? `${clientId}:${viewport.width}:${viewport.height}`
                    : ""
                }
              />
            </ReactFlow>
          </div>
        ) : layout === "list" ? (
          <div className="board-list project-table">
            {/* Phones hide `.table-head` below (globals.css); this compact control keeps sorting
              reachable there, reading and writing the same `listSort` state as the header buttons. */}
            <div className="board-list-sort-mobile">
              <label htmlFor={listSortSelectId} className="visually-hidden">
                Sort by
              </label>
              <select
                id={listSortSelectId}
                value={listSortOptionValue(listSort)}
                onChange={(event) => setListSort(listSortFromOptionValue(event.target.value))}
              >
                {LIST_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="table-head">
              {LIST_SORT_COLUMNS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="board-list-sort-button"
                  onClick={() => setListSort((current) => nextListSort(current, key))}
                  aria-label={listSortAccessibleName(key, listSort)}
                >
                  {label.toUpperCase()}
                  {listSort?.key === key &&
                    (listSort.direction === "asc" ? (
                      <ArrowUp size={14} aria-hidden="true" />
                    ) : (
                      <ArrowDown size={14} aria-hidden="true" />
                    ))}
                </button>
              ))}
              <span />
            </div>
            {/* The head stays put when nothing matches, so a filtered table still reads as the same
              table rather than as a different screen. */}
            {sortedProjects.length === 0 && (
              <div className="empty-state board-list-empty">
                <h2>{filtered ? "No projects match." : "A fresh space for your next idea."}</h2>
                <p>
                  {filtered
                    ? search
                      ? "Try a different search or clear your filters."
                      : "Try a different filter or clear your filters."
                    : "Start with a briefing. We’ll take it from there."}
                </p>
                {filtered && (
                  <button className="button" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
            {sortedProjects.map((project: Project) => (
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
        ) : layout === "calendar" ? (
          <BoardCalendar
            projects={filteredProjects}
            campaignName={campaignName}
            month={month}
            onMonth={setMonth}
            selectedId={selectedProjectId}
            onSelect={setSelectedProjectId}
            onOpen={openProject}
          />
        ) : (
          <section
            className="board-planning-view"
            aria-label={`${layout === "timeline" ? "Timeline" : "Kanban"} view`}
          >
            <header className="board-planning-head">
              <h2>{layout === "timeline" ? "Timeline" : "Kanban"}</h2>
              {layout === "timeline" && (
                <div className="segmented-control" role="group" aria-label="Timeline scale">
                  {timelineScales.map((item) => (
                    <button
                      key={item.id}
                      aria-pressed={item.id === scale}
                      onClick={() => setChosenScale(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </header>
            {layout === "timeline" ? (
              <ProjectTimeline
                projects={filteredProjects}
                campaignName={campaignName}
                campaignOrder={campaignOrder}
                start={period}
                onStart={setPeriod}
                scale={scale}
                selectedId={selectedProjectId}
                onSelect={setSelectedProjectId}
                onOpen={openProject}
              />
            ) : (
              <BoardKanban
                projects={filteredProjects}
                campaignName={campaignName}
                selectedId={selectedProjectId}
                onSelect={setSelectedProjectId}
                onOpen={openProject}
              />
            )}
          </section>
        )}
      </div>
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
