"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Node, NodeChange } from "@xyflow/react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  useClients,
  useInvalidateWorkspace,
  useProjects,
} from "@/features/workspace/workspace-data";

import { orderCampaigns } from "./board-layout";
import { nextListSort, sortProjects, type ListSort } from "./list-sort";
import { projectHref } from "./project-open";
import { smallestScaleFor } from "./timeline-model";
import { selectionFromChanges } from "./planning-view";
import { useBoardCampaigns, useProjectArtwork } from "./board-data";
import { BoardToolbar } from "./board-toolbar";
import { BoardHeader } from "./board-header";
import { BoardCalendar } from "./board-calendar";
import { useBoardCanvasNodes } from "./board-canvas-nodes";
import { useBoardView } from "./use-board-view";
import { useBoardHeaderSpace, useBoardCanvasViewport } from "./use-board-measurements";
import { useBoardCompetitorWidget } from "./use-board-competitor-widget";
import { useBoardCardPositions } from "./use-board-card-positions";
import { useBoardFilters } from "./use-board-filters";
import { BoardListView } from "./board-list-view";
import type { ListGroupKey } from "./list-groups";
import { useRequesterOf } from "./project-requester";
import { useBoardCollapsedCampaigns } from "./use-board-collapsed-campaigns";
import { BoardCanvasView } from "./board-canvas-view";
import { BoardPlanningPanel } from "./board-planning-panel";
import { BoardNotices } from "./board-notices";
import { CampaignDialog } from "@/features/campaigns/campaign-dialog";
import "./board.css";
import { PageStatus } from "@/features/shared/page-status";

export function BoardPage({ clientId }: { clientId: string }) {
  return <ClientBoard key={clientId} clientId={clientId} />;
}

function ClientBoard({ clientId }: { clientId: string }) {
  const { database, profile } = useAuth();
  const invalidateWorkspace = useInvalidateWorkspace();
  const router = useRouter();
  const clients = useClients();
  const projects = useProjects(clientId);
  const view = useBoardView(database, clientId);
  const {
    setCanvas,
    setZoomDock,
    zoomDock,
    viewport: canvasViewportSize,
    fitKey: canvasFitKey,
  } = useBoardCanvasViewport(clientId);
  // The floating header wraps differently at every width and with every client name, so the
  // space the views reserve beneath it is measured rather than guessed. See `use-board-measurements.ts`.
  const workArea = useBoardHeaderSpace();
  // Which card is selected is board state; opening one leaves the board for the project's own
  // canvas, so there is nothing else to remember.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // List view column sort: `null` keeps today's (`filteredProjects`) order until a header is
  // clicked. It lives here — kept for the board visit, surviving view switches, untouched by
  // Clear filters, and reset only when switching clients remounts the board.
  const [listSort, setListSort] = useState<ListSort>(null);
  // List groups folded for this visit; Delivered starts folded, like a finished group in a tracker.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<ListGroupKey>>(
    () => new Set(["delivered"]),
  );
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const cardPositions = useBoardCardPositions({ database, invalidateWorkspace });

  const campaigns = useBoardCampaigns(clientId);
  const requesterOf = useRequesterOf(clientId);
  const folds = useBoardCollapsedCampaigns(clientId);
  const client = clients.data?.find((item) => item.id === clientId);
  const canMove = profile?.role === "agency";
  const canCreate = profile?.role !== "designer";
  // Only the studio side reads widgets or competitors; a client's board never asks.
  const studioSide = profile?.role === "agency" || profile?.role === "designer";
  const competitor = useBoardCompetitorWidget({ database, clientId, canMove, studioSide });
  const filters = useBoardFilters(projects.data ?? []);

  const campaignName = useCallback(
    (id: string | null) =>
      campaigns.data?.find((item) => item.id === id)?.title ?? "Studio projects",
    [campaigns.data],
  );
  // Only the List view reads this; other views keep reading `filters.filteredProjects` directly.
  const sortedProjects = useMemo(
    () => sortProjects(filters.filteredProjects, listSort, campaignName, requesterOf),
    [filters.filteredProjects, listSort, campaignName, requesterOf],
  );
  const campaignOrder = useMemo(
    () => orderCampaigns(campaigns.data ?? []).map((item) => item.id),
    [campaigns.data],
  );

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
  const scale = filters.chosenScale ?? smallestScaleFor(scope);
  const projectIds = useMemo(() => scope.map((item) => item.id), [scope]);
  const artwork = useProjectArtwork(projectIds);

  const { nodes, content } = useBoardCanvasNodes({
    filteredProjects: filters.filteredProjects,
    campaigns: campaigns.data,
    canCreate,
    canMove,
    filtered: filters.filtered,
    selectedCampaignId: filters.campaign || undefined,
    hasSearch: Boolean(filters.search),
    positions: cardPositions.positions,
    dragging: cardPositions.draggingId,
    clearFilters: filters.clearFilters,
    clientId,
    setCreatingCampaign,
    openProject,
    selectedProjectId,
    artwork: artwork.data,
    requesterOf,
    collapsedCampaigns: folds.collapsed,
    onToggleCampaign: folds.toggle,
    competitorWidget: competitor.competitorWidget,
  });

  function changeNodes(changes: NodeChange<Node>[]) {
    // Selection is controlled, so xyflow reports the click and the board records it; a selection
    // it does not record is thrown away the next time the node array is rebuilt. Recording it
    // here — after the click, never on hover — also keeps the array stable while a pointer is
    // down, which is what a card needs to receive the click at all.
    setSelectedProjectId((current) => selectionFromChanges(changes, current));
    if (!canMove) return;
    cardPositions.applyPositionChanges(changes);
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
  if (view.isPending) return <PageStatus>Loading the board…</PageStatus>;

  return (
    <div className={`board-page shows-${view.layout}`}>
      <div className="board-work-area" ref={workArea}>
        <BoardHeader
          client={client}
          viewer={profile}
          period={filters.quarter}
          years={filters.periodYears}
          onPeriod={filters.choosePeriod}
        />
        <div className="board-tool-dock">
          <BoardToolbar
            clientId={clientId}
            view={view.layout}
            onView={view.chooseLayout}
            disabled={view.disabled}
            canCreate={canCreate}
            search={filters.search}
            onSearch={filters.setSearch}
            campaign={filters.campaign}
            onCampaign={filters.setCampaign}
            status={filters.status}
            onStatus={filters.setStatus}
            activity={filters.activity}
            onActivity={filters.setActivity}
            campaigns={campaigns.data ?? []}
            resultCount={filters.filteredProjects.length}
            onClear={filters.clearFilters}
            widgets={canMove && view.layout === "canvas" ? competitor.widgetsPanel : undefined}
          />
          {view.layout === "canvas" && <div className="board-zoom-dock" ref={setZoomDock} />}
        </div>
        <BoardNotices
          selectedProjectTitle={selectedProject?.title ?? null}
          moveError={!!cardPositions.moveError}
          foldError={!!folds.saveError}
          preferencesError={!!view.preferencesError}
          onRetryPreferences={view.retryPreferences}
          saveError={!!view.saveError}
          savePending={view.savePending}
          onRetrySave={view.retrySave}
        />
        {view.layout === "canvas" ? (
          <BoardCanvasView
            canvasRef={setCanvas}
            nodes={nodes}
            onNodesChange={changeNodes}
            onDragStart={cardPositions.startDrag}
            onDragStop={(node) => cardPositions.settleCard(node, nodes)}
            content={content}
            viewport={canvasViewportSize}
            zoomDockTarget={zoomDock}
            fitKey={canvasFitKey}
          />
        ) : view.layout === "list" ? (
          <BoardListView
            projects={sortedProjects}
            listSort={listSort}
            onHeaderSort={(key) =>
              setListSort((current) =>
                nextListSort(
                  current,
                  key,
                  filters.filteredProjects.map((project) => project.status),
                ),
              )
            }
            onSelectSort={setListSort}
            filtered={filters.filtered}
            hasSearch={Boolean(filters.search)}
            onClearFilters={filters.clearFilters}
            campaignName={campaignName}
            requesterOf={requesterOf}
            collapsedGroups={collapsedGroups}
            onToggleGroup={(key) =>
              setCollapsedGroups((current) => {
                const next = new Set(current);
                if (!next.delete(key)) next.add(key);
                return next;
              })
            }
          />
        ) : view.layout === "calendar" ? (
          <BoardCalendar
            projects={filters.filteredProjects}
            campaignName={campaignName}
            requesterOf={requesterOf}
            month={filters.month}
            onMonth={filters.setMonth}
            selectedId={selectedProjectId}
            onSelect={setSelectedProjectId}
            onOpen={openProject}
          />
        ) : (
          <BoardPlanningPanel
            mode={view.layout === "timeline" ? "timeline" : "kanban"}
            projects={filters.filteredProjects}
            campaignName={campaignName}
            campaignOrder={campaignOrder}
            requesterOf={requesterOf}
            period={filters.period}
            onPeriod={filters.setPeriod}
            scale={scale}
            onScale={filters.setChosenScale}
            selectedId={selectedProjectId}
            onSelect={setSelectedProjectId}
            onOpen={openProject}
          />
        )}
      </div>
      {creatingCampaign && (
        <CampaignDialog
          clientId={clientId}
          onClose={() => setCreatingCampaign(false)}
          onCreated={filters.setCampaign}
        />
      )}
    </div>
  );
}
