import { useMemo } from "react";
import type { Node } from "@xyflow/react";
import type { Project } from "@/features/workspace/workspace-data";
import { CARD_H, buildStack, cardWidth, slotPosition, type BoardCampaign } from "./board-layout";
import { sharedTitlePrefix } from "./timeline-model";
import { artworkFor, type ProjectArtworkMap } from "./project-thumbnail";
import type { RequesterOf } from "./project-requester";

/** The box the built nodes occupy, which is what a fit has to cover. */
function contentBounds(nodes: Node[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const node of nodes) {
    // Cards are positioned relative to their frame, so only top-level frames set the bounds.
    if (node.parentId) continue;
    const style = node.style as { width?: number; height?: number } | undefined;
    width = Math.max(width, node.position.x + (style?.width ?? 0));
    height = Math.max(height, node.position.y + (style?.height ?? 0));
  }
  return { width, height };
}

/**
 * A node that states its own size.
 *
 * xyflow keeps the measured size on the internal node it builds from the array it is given, and
 * throws it away whenever that array is rebuilt. Until the resize observer runs again the node has
 * no dimensions: it is rendered hidden and clamped to its parent's corner. On this board the array
 * is rebuilt whenever a card is selected or dragged, which is exactly when a card has to stay
 * under the pointer — the second click of a double click would otherwise land on the pane.
 * `measured` matters while dragging: xyflow reads it to keep a card inside its frame and warns
 * that the node is uninitialised when it is missing.
 */
function sized(width: number, height: number) {
  return { width, height, measured: { width, height }, style: { width, height } };
}

/**
 * Builds the board canvas's xyflow node array — notice and add-campaign
 * frames, and every campaign's project cards — from the board's filtered projects and campaigns.
 *
 * Kept as its own hook so `BoardPage` reads as page orchestration (state, effects, chrome) rather
 * than as node assembly.
 */
export function useBoardCanvasNodes(input: {
  filteredProjects: Project[];
  campaigns: BoardCampaign[] | undefined;
  canCreate: boolean;
  canMove: boolean;
  filtered: boolean;
  /** The campaign chosen from the filter, so its own frame survives even while it is empty. */
  selectedCampaignId?: string;
  /** Whether a search term is what is filtering, as opposed to only a campaign or status. */
  hasSearch: boolean;
  positions: Record<string, { x: number; y: number }>;
  /** The card being dragged, which follows the pointer instead of its grid cell. */
  dragging?: string | null;
  clearFilters: () => void;
  clientId: string;
  setCreatingCampaign: (creating: boolean) => void;
  openProject: (projectId: string) => void;
  selectedProjectId: string | null;
  artwork: ProjectArtworkMap | undefined;
  /** Absent for viewers who do not see requesters. */
  requesterOf?: RequesterOf;
  /** Present for the studio side when the widget is on the board. */
  competitorWidget?: { count: number; canEdit: boolean; removing: boolean; onRemove: () => void };
}): { nodes: Node[]; content: { width: number; height: number } } {
  const {
    filteredProjects,
    campaigns,
    canCreate,
    canMove,
    filtered,
    selectedCampaignId,
    hasSearch,
    positions,
    dragging,
    clearFilters,
    clientId,
    setCreatingCampaign,
    openProject,
    selectedProjectId,
    artwork,
    requesterOf,
    competitorWidget,
  } = input;
  return useMemo(() => {
    // Seeded titles repeat the client name the viewer is already inside, which is what pushes the
    // distinguishing tail out of a fixed-width card. The calendar drops the same head.
    const titlePrefix = sharedTitlePrefix(filteredProjects.map((item) => item.title));
    // A designer reads only the campaigns they hold work in: campaigns_read is scoped to the
    // client, so an empty frame would expose a campaign title and dates they have no part in.
    const frames = buildStack({
      projects: filteredProjects,
      campaigns: campaigns ?? [],
      canCreate,
      keepEmptyCampaigns: canCreate,
      filtered,
      selectedCampaignId,
      overrides: positions,
      dragging,
      competitorWidget: competitorWidget ? { count: competitorWidget.count } : undefined,
    });
    const built: Node[] = [];
    for (const frame of frames) {
      const shared = {
        position: { x: frame.x, y: frame.y },
        draggable: false,
        selectable: false,
        // xyflow only adds `nopan` to draggable nodes, so a non-draggable frame would let the pane
        // swallow every click on the controls inside it.
        className: "nopan",
        ...sized(frame.width, frame.height),
      };
      if (frame.kind === "notice")
        built.push({
          ...shared,
          id: frame.id,
          type: "notice",
          ariaLabel: "No matching projects",
          data: { filtered, hasSearch, onClear: clearFilters },
        });
      else if (frame.kind === "addCampaign")
        built.push({
          ...shared,
          id: frame.id,
          type: "addCampaign",
          ariaLabel: "Add a campaign",
          data: { onCreate: () => setCreatingCampaign(true) },
        });
      else if (frame.kind === "competitorAds" && competitorWidget)
        built.push({
          ...shared,
          id: frame.id,
          type: "competitorAds",
          ariaLabel: "Competitor ads",
          data: {
            clientId,
            canEdit: competitorWidget.canEdit,
            removing: competitorWidget.removing,
            onRemove: competitorWidget.onRemove,
          },
        });
      else if (frame.campaign) {
        const group = frame.campaign;
        const real = group.id !== "none";
        built.push({
          ...shared,
          id: frame.id,
          type: "campaign",
          ariaLabel: `Campaign ${group.title}`,
          data: { campaign: group, count: frame.projects?.length ?? 0 },
        });
        const width = cardWidth();
        (frame.projects ?? []).forEach((project, index) => {
          built.push({
            id: project.id,
            type: "project",
            parentId: frame.id,
            extent: "parent",
            position: frame.arrangement?.cards[project.id] ?? slotPosition(index),
            data: {
              project,
              titlePrefix,
              canMove,
              artwork: artworkFor(artwork, project.id),
              requester: requesterOf?.(project),
              onOpen: openProject,
            },
            draggable: canMove,
            dragHandle: ".board-card-grip",
            ...sized(width, CARD_H),
            selected: project.id === selectedProjectId,
            ariaLabel: project.title,
            // The node is the selectable thing, so it is the node that reports being current.
            domAttributes: project.id === selectedProjectId ? { "aria-current": true } : undefined,
          });
        });
        if (frame.briefingSlot)
          built.push({
            id: `${frame.id}:new`,
            type: "briefingSlot",
            parentId: frame.id,
            extent: "parent",
            position: frame.arrangement?.slot ?? slotPosition(frame.projects?.length ?? 0),
            draggable: false,
            selectable: false,
            className: "nopan",
            ...sized(width, CARD_H),
            data: {
              href: real
                ? `/clients/${clientId}/briefings/new?campaign=${group.id}`
                : `/clients/${clientId}/briefings/new`,
              campaign: group.title,
            },
          });
      }
    }
    return { nodes: built, content: contentBounds(built) };
  }, [
    filteredProjects,
    campaigns,
    canCreate,
    canMove,
    filtered,
    selectedCampaignId,
    hasSearch,
    positions,
    dragging,
    clearFilters,
    clientId,
    setCreatingCampaign,
    openProject,
    selectedProjectId,
    artwork,
    requesterOf,
    competitorWidget,
  ]);
}
