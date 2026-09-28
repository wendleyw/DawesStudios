import { fitToContent } from "@/features/board/canvas-fit";
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
const NOTICE_H = 168;
const ADD_CAMPAIGN_H = 76;
/** The competitor widget's tiles: four to a row, each as tall as a short card. */
export const WIDGET_TILE_H = 88;
export const WIDGET_TILE_GAP = 12;
export const WIDGET_COLUMNS = 4;

/** Its head, then one row per four competitors, one row even when empty for its message. */
export function competitorWidgetHeight(count: number): number {
  const rows = Math.max(1, Math.ceil(count / WIDGET_COLUMNS));
  return FRAME_HEAD + rows * WIDGET_TILE_H + (rows - 1) * WIDGET_TILE_GAP + FRAME_PAD;
}
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

type Point = { x: number; y: number };
type Cell = { column: number; row: number };

const COLUMN_PITCH = CARD_W + CARD_GAP;
const ROW_PITCH = CARD_H + CARD_GAP;
const cellKey = ({ column, row }: Cell) => `${column}:${row}`;

/** How many card columns a frame of this width holds; `extent: "parent"` keeps cards inside. */
export function gridColumns(frameWidth: number): number {
  return Math.max(1, Math.floor((frameWidth - FRAME_PAD * 2 + CARD_GAP) / COLUMN_PITCH));
}

function cellOf(position: Point, columns = Infinity): Cell {
  return {
    column: Math.min(columns - 1, Math.max(0, Math.round((position.x - FRAME_PAD) / COLUMN_PITCH))),
    row: Math.max(0, Math.round((position.y - FRAME_HEAD - FRAME_PAD) / ROW_PITCH)),
  };
}

function cellPosition({ column, row }: Cell): Point {
  return { x: FRAME_PAD + column * COLUMN_PITCH, y: FRAME_HEAD + FRAME_PAD + row * ROW_PITCH };
}

/**
 * The free cell nearest to a point. One row below the deepest occupied one is always open, so a
 * full grid still has somewhere to put a card.
 */
function nearestFreeCell(target: Point, occupied: Set<string>, columns: number): Cell {
  const deepest = [...occupied].reduce((low, key) => Math.max(low, Number(key.split(":")[1])), 0);
  const rows = Math.max(deepest, cellOf(target).row) + 1;
  let best: Cell = { column: 0, row: rows };
  let bestDistance = Infinity;
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column < columns; column++) {
      if (occupied.has(cellKey({ column, row }))) continue;
      const candidate = cellPosition({ column, row });
      const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
      if (distance < bestDistance) {
        best = { column, row };
        bestDistance = distance;
      }
    }
  return best;
}

export type FrameArrangement = {
  /** Where each project card sits, relative to its frame. */
  cards: Record<string, Point>;
  /** The briefing placeholder's slot, when the frame carries one. */
  slot: Point | null;
};

/**
 * Puts every card of a frame on its grid: one card width plus CARD_GAP per column, one card height
 * plus CARD_GAP per row. A stored position (or unsaved drag) settles in the nearest free cell, so
 * positions saved before the board snapped still line up; a card without one keeps its auto slot.
 * The card being dragged is left exactly where the pointer holds it and reserves no cell.
 */
export function arrangeFrame(
  projects: Project[],
  input: {
    width: number;
    briefingSlot: boolean;
    overrides?: Record<string, Point>;
    dragging?: string | null;
  },
): FrameArrangement {
  const columns = gridColumns(input.width);
  const occupied = new Set<string>();
  const place = (target: Point) => {
    const free = occupied.has(cellKey(cellOf(target, columns)))
      ? nearestFreeCell(target, occupied, columns)
      : cellOf(target, columns);
    occupied.add(cellKey(free));
    return cellPosition(free);
  };
  const slot = input.briefingSlot ? place(slotPosition(projects.length)) : null;
  const cards: Record<string, Point> = {};
  const stored = (project: Project) => input.overrides?.[project.id] ?? project.board_position;
  for (const project of projects) {
    if (project.id === input.dragging) cards[project.id] = stored(project);
    else if (hasStoredPosition(stored(project))) cards[project.id] = place(stored(project));
  }
  projects.forEach((project, index) => {
    if (!cards[project.id]) cards[project.id] = place(slotPosition(index));
  });
  return { cards, slot };
}

/**
 * Where cards end up when one is dropped: on the cell under the drop point. Dropping on another
 * card swaps the two, so a row can be reordered one move at a time; dropping on the briefing
 * placeholder takes the nearest free cell instead. Returns every card that moves.
 */
export function dropCard(input: {
  id: string;
  drop: Point;
  /** The dragged card's cell before the drag started. */
  origin: Point;
  frameWidth: number;
  /** The frame's other cards, already on their cells. */
  cards: Record<string, Point>;
  slot: Point | null;
}): Record<string, Point> {
  const columns = gridColumns(input.frameWidth);
  const target = cellOf(input.drop, columns);
  const others = Object.entries(input.cards).filter(([id]) => id !== input.id);
  const occupant = others.find(([, position]) => cellKey(cellOf(position)) === cellKey(target));
  if (occupant) return { [input.id]: cellPosition(target), [occupant[0]]: input.origin };
  if (!input.slot || cellKey(cellOf(input.slot)) !== cellKey(target))
    return { [input.id]: cellPosition(target) };
  const occupied = new Set(
    [input.slot, ...others.map(([, position]) => position)].map((p) => cellKey(cellOf(p))),
  );
  return { [input.id]: cellPosition(nearestFreeCell(input.drop, occupied, columns)) };
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

type StackFrame = {
  id: string;
  kind: "notice" | "campaign" | "addCampaign" | "competitorAds";
  x: number;
  y: number;
  width: number;
  height: number;
  campaign?: BoardCampaign;
  /** Projects belonging to this campaign frame, already filtered to the caller's scope. */
  projects?: Project[];
  /** Rendered after the cards so the agency and client can start a briefing in context. */
  briefingSlot?: boolean;
  /** Every card's cell and the briefing slot's, for campaign frames. */
  arrangement?: FrameArrangement;
};

type StackInput = {
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
  /** The card under the pointer, which follows it freely until it is dropped. */
  dragging?: string | null;
  /** Present when the studio placed the Competitor ads widget on this board. */
  competitorWidget?: { count: number };
};

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
  const rowWidth = (cards: number) => campaignColumnWidth(Math.max(MIN_ROW_CARDS, cards));
  const frames: StackFrame[] = [];
  let cursor = 0;
  const push = (frame: Omit<StackFrame, "y" | "x">) => {
    frames.push({ ...frame, x: 0, y: cursor });
    cursor += frame.height + STACK_GAP;
  };

  if (input.competitorWidget)
    push({
      id: "widget:competitor-ads",
      kind: "competitorAds",
      width: rowWidth(MIN_ROW_CARDS),
      height: competitorWidgetHeight(input.competitorWidget.count),
    });

  const campaignFrame = (
    id: string,
    campaign: BoardCampaign,
    projects: Project[],
    briefingSlot: boolean,
  ) => {
    const width = rowWidth(projects.length + (briefingSlot ? 1 : 0));
    const arrangement = arrangeFrame(projects, {
      width,
      briefingSlot,
      overrides: input.overrides,
      dragging: input.dragging,
    });
    push({
      id,
      kind: "campaign",
      width,
      height: campaignFrameHeight(Object.values(arrangement.cards).map((card) => card.y)),
      campaign,
      projects,
      briefingSlot,
      arrangement,
    });
  };

  for (const campaign of ordered)
    campaignFrame(
      `campaign:${campaign.id}`,
      campaign,
      grouped.get(campaign.id) ?? [],
      input.canCreate,
    );

  if (ungrouped.length)
    campaignFrame(
      "campaign:none",
      { id: "none", title: "Studio projects", start_date: null, end_date: null },
      ungrouped,
      false,
    );

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
export { FIT_PAD } from "@/features/board/canvas-fit";
/**
 * Automatic framing keeps card text readable (a 280px card shows at 210px); a board taller or wider
 * than that pans instead of shrinking further. Manual zoom can still go down to 10%.
 */
export const MIN_FIT_ZOOM = 0.75;

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
