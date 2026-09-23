import { fitToContent } from "@/features/shared/canvas-fit";
import type { Project } from "@/features/workspace/workspace-data";

/**
 * Geometry for the board canvas: campaigns stacked top to bottom, each
 * campaign holding its projects in a single row.
 *
 * Every frame is sized by these pure functions instead of being measured after paint, so the
 * canvas never reflows once xyflow has rendered it and screenshots stay deterministic.
 */
export const STACK_GAP = 20;
export const FRAME_PAD = 20;
export const FRAME_HEAD = 52;
export const CARD_W = 280;
/**
 * Tall enough for the agency card, which adds a 22px drag grip above a tightened body, the version
 * and type row, and a thumbnail worth looking at. The artwork takes a 158px share rather than
 * whatever the text left over, which was a 40px sliver; this height pays for that and still clears
 * a title that wraps to a second line.
 */
export const CARD_H = 324;
export const CARD_GAP = 20;
export const NOTICE_H = 168;
export const ADD_CAMPAIGN_H = 76;
/**
 * The row width every campaign frame starts from. A campaign carries its projects plus a briefing
 * slot, so the common two-project campaign already fills this and the column reads as one straight
 * block; a busier campaign extends past it without dragging the quiet ones along.
 */
export const MIN_ROW_CARDS = 3;
export type BoardCampaign = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
};

/** Campaigns have no ordering column, so the stack derives a stable order from their dates. */
export function orderCampaigns(campaigns: BoardCampaign[]): BoardCampaign[] {
  return [...campaigns].sort((a, b) => {
    if (a.start_date !== b.start_date) {
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return a.start_date < b.start_date ? -1 : 1;
    }
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * A campaign holds its projects in one row, so its frame is as wide as that row. Every campaign
 * frame fits its own row; frames share their left edge.
 */
export function campaignColumnWidth(maxCards: number): number {
  const cards = Math.max(1, maxCards);
  return FRAME_PAD * 2 + cards * CARD_W + (cards - 1) * CARD_GAP;
}

export function cardWidth(): number {
  return CARD_W;
}

/** The auto slot a card occupies when it carries no stored override: one row, left to right. */
export function slotPosition(index: number): { x: number; y: number } {
  return { x: FRAME_PAD + index * (CARD_W + CARD_GAP), y: FRAME_HEAD + FRAME_PAD };
}

/** A stored {x:0,y:0} keeps its existing meaning: no override, use the auto slot. */
export function hasStoredPosition(position: { x: number; y: number }): boolean {
  return Boolean(position.x || position.y);
}

export function campaignFrameHeight(
  /** Stored y overrides, so a card dragged below the auto row still fits inside its frame. */
  storedTops: number[] = [],
): number {
  const grid = FRAME_HEAD + FRAME_PAD + CARD_H + FRAME_PAD;
  // `extent: "parent"` clamps a child to its frame, so a frame that ignored an override would
  // silently drag the card back up instead of restoring where it was left.
  const deepest = storedTops.reduce((low, top) => Math.max(low, top + CARD_H + FRAME_PAD), 0);
  return Math.max(grid, deepest);
}

export function campaignDateRange(campaign: BoardCampaign, format: (v: string | null) => string) {
  if (campaign.start_date && campaign.end_date)
    return `${format(campaign.start_date)} – ${format(campaign.end_date)}`;
  if (campaign.start_date) return `From ${format(campaign.start_date)}`;
  if (campaign.end_date) return `Until ${format(campaign.end_date)}`;
  return "No dates set";
}

export type StackFrame = {
  id: string;
  kind: "notice" | "campaign" | "addCampaign";
  x: number;
  y: number;
  width: number;
  height: number;
  campaign?: BoardCampaign;
  /** Projects belonging to this campaign frame, already filtered to the caller's scope. */
  projects?: Project[];
  /** Rendered after the cards so the agency and client can start a briefing in context. */
  briefingSlot?: boolean;
};

export type StackInput = {
  projects: Project[];
  campaigns: BoardCampaign[];
  /** Only the agency and the client may start new work from the board. */
  canCreate: boolean;
  /** Designers see only campaigns they hold work in, so empty frames are dropped for them. */
  keepEmptyCampaigns: boolean;
  filtered: boolean;
  /**
   * The campaign the viewer picked from the filter, if any. Selecting a campaign is what makes
   * `filtered` true, so without this its own frame would be the one thing the filter is guaranteed
   * to hide — the viewer asked to see it and it disappeared. A search or status filter that
   * narrows to nothing is unaffected: they name no campaign, so this never rescues their frames.
   */
  selectedCampaignId?: string;
  /** Unsaved drag positions, which must size the frame exactly like persisted ones. */
  overrides?: Record<string, { x: number; y: number }>;
};

function storedTops(projects: Project[], overrides?: Record<string, { x: number; y: number }>) {
  return projects
    .map((project) => overrides?.[project.id] ?? project.board_position)
    .filter(hasStoredPosition)
    .map((position) => position.y);
}

/**
 * Lays the frames out top to bottom in a single column. Returns plain data so the geometry can be
 * unit tested without rendering xyflow.
 */
export function buildStack(input: StackInput): StackFrame[] {
  const grouped = new Map<string, Project[]>();
  for (const project of input.projects) {
    const key = project.campaign_id ?? "none";
    const bucket = grouped.get(key);
    if (bucket) bucket.push(project);
    else grouped.set(key, [project]);
  }
  const ordered = orderCampaigns(input.campaigns).filter(
    (campaign) =>
      (grouped.get(campaign.id)?.length ?? 0) > 0 ||
      (!input.filtered && input.keepEmptyCampaigns) ||
      campaign.id === input.selectedCampaignId,
  );
  const ungrouped = grouped.get("none") ?? [];

  // A frame is as wide as its own row, floored at MIN_ROW_CARDS. Sizing every frame to the busiest
  // campaign instead would leave a one-project campaign sitting in a frame several cards wide.
  const slot = input.canCreate ? 1 : 0;
  const rowWidth = (cards: number) => campaignColumnWidth(Math.max(MIN_ROW_CARDS, cards));
  const frames: StackFrame[] = [];
  let cursor = 0;
  const push = (frame: Omit<StackFrame, "y" | "x">) => {
    frames.push({ ...frame, x: 0, y: cursor });
    cursor += frame.height + STACK_GAP;
  };

  for (const campaign of ordered) {
    const projects = grouped.get(campaign.id) ?? [];
    push({
      id: `campaign:${campaign.id}`,
      kind: "campaign",
      width: rowWidth(projects.length + slot),
      height: campaignFrameHeight(storedTops(projects, input.overrides)),
      campaign,
      projects,
      briefingSlot: input.canCreate,
    });
  }

  if (ungrouped.length)
    push({
      id: "campaign:none",
      kind: "campaign",
      width: rowWidth(ungrouped.length),
      height: campaignFrameHeight(storedTops(ungrouped, input.overrides)),
      campaign: { id: "none", title: "Studio projects", start_date: null, end_date: null },
      projects: ungrouped,
      briefingSlot: false,
    });

  // A board with campaigns but no projects yet must still show them and the way to add more; only
  // a board with nothing to render at all falls back to the notice.
  if (!ordered.length && !ungrouped.length)
    push({ id: "notice", kind: "notice", width: rowWidth(MIN_ROW_CARDS), height: NOTICE_H });
  // Creating a campaign while a filter hides most of the board would be disorienting.
  if (input.canCreate && !input.filtered)
    push({
      id: "addCampaign",
      kind: "addCampaign",
      width: rowWidth(MIN_ROW_CARDS),
      height: ADD_CAMPAIGN_H,
    });

  return frames;
}

/** Breathing room kept around the board when the view is fitted to it. */
export { FIT_PAD } from "@/features/shared/canvas-fit";
/** Automatic framing keeps cards readable; manual zoom can go further, down to 10%. */
export const MIN_FIT_ZOOM = 0.4;

/**
 * The viewport that shows the whole board at once. Computed from the frames rather than measured
 * after paint, so returning to a board lands on the same view every time instead of depending on
 * whether xyflow had finished rendering when a fit was requested.
 */
export function boardFit(
  content: { width: number; height: number },
  view: { width: number; height: number },
  topInset = 0,
): { x: number; y: number; zoom: number } {
  // The board fits both axes; a ten-campaign column that will not shrink to fit pans instead.
  const fitted = fitToContent(
    content,
    { ...view, height: Math.max(0, view.height - topInset) },
    { minZoom: MIN_FIT_ZOOM, constrainHeight: true },
  );
  return { ...fitted, y: fitted.y + topInset };
}
