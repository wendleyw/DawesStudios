import { fitToContent } from "@/features/shared/canvas-fit";
import type { Project } from "@/features/workspace/workspace-data";
import { boardStatuses } from "./planning-view";

/**
 * Geometry for the board canvas: Planning on the left, the campaigns stacked down the right, each
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
export const PLANNING_HEAD = 56;
export const NOTICE_H = 168;
export const ADD_CAMPAIGN_H = 76;
/** The widest the single stack column ever gets; canvas gutters hold the floating zoom controls. */
export const MAX_COLUMN = 1160;
/** Wider cap for the two-column board, still leaving a gutter clear of the zoom controls. */
export const MAX_SPLIT = 1240;
/** Below this the two columns would both be too narrow to read, so the board stacks instead. */
export const TWO_COLUMN_MIN = 820;
export const COLUMN_GAP = 20;
/**
 * Planning keeps a floor so a board with one short campaign still shows a usable calendar. Sized to
 * a two-lane calendar plus a little slack rather than a round number, so a quiet board does not sit
 * in a frame that is mostly empty.
 */
export const PLANNING_MIN_H = 280;
/** One Kanban stage column, wide enough to hold a two-word project title on a single line. */
export const KANBAN_COLUMN_W = 176;
/** The gap between stage columns and the padding around the row, both matching the stylesheet. */
export const KANBAN_COLUMN_GAP = 12;
export const KANBAN_ROW_PAD = 16;
/** Planning's own left and right borders, which the row inside them does not get to use. */
export const PLANNING_BORDER = 2;

/**
 * How wide Planning has to be for every stage to be reachable without scrolling inside it.
 *
 * The Kanban is the widest thing Planning ever holds — seven stages against the calendar's single
 * grid — so it is what sets the frame's width. Sizing the frame to the calendar instead left the
 * last stages scrolled out of reach behind the frame's edge and squeezed every card title into
 * three broken lines.
 */
export function kanbanWidth(stages: number = boardStatuses.length): number {
  const columns = Math.max(1, stages);
  return (
    PLANNING_BORDER +
    KANBAN_ROW_PAD * 2 +
    columns * KANBAN_COLUMN_W +
    (columns - 1) * KANBAN_COLUMN_GAP
  );
}

/** The width Planning holds to, which is what the Kanban needs; the calendar gets the same room. */
export const PLANNING_MIN_W = kanbanWidth();
/**
 * The row width every campaign frame starts from. A campaign carries its projects plus a briefing
 * slot, so the common two-project campaign already fills this and the column reads as one straight
 * block; a busier campaign extends past it without dragging the quiet ones along.
 */
export const MIN_ROW_CARDS = 3;
/** One project lane in the calendar, measured against the rendered frame. */
export const LANE_H = 56;
/**
 * Planning's own furniture above the lanes, measured at 151.19 px and rounded up: the frame border,
 * its head, the body border, padding, the scroll region's borders, and the calendar header — which
 * now carries the period and the day scale on one sticky row instead of two.
 */
export const PLANNING_CHROME = 152;

/**
 * Planning's floor in Kanban mode.
 *
 * Kanban is columns of cards, not lanes, so the calendar's measurement does not describe it: a
 * two-project board gave Planning 280 px while a column needed 299, which cut the second card in
 * half. Measured against the rendered board, a column spends 24 px of padding and a 36 px sticky
 * heading before its cards, with 10 px between them. A card carries its campaign above a title
 * that wraps, so on the seeded workspaces it measures 90 to 110 px rather than the 79 px this
 * floor was first derived from: a three-card column needed 383 px against the 327 px it was given.
 * This floor clears heading plus three of the taller cards, so the board always shows whole cards
 * and a partial fourth signals the scroll.
 */
export const KANBAN_MIN_H = 480;

/** How tall Planning has to be to show every lane without scrolling inside itself. */
export function planningContentHeight(lanes: number): number {
  return PLANNING_CHROME + Math.max(1, lanes) * LANE_H;
}

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

export function planningHeight(open: boolean, viewportWidth: number): number {
  if (!open) return PLANNING_HEAD;
  return viewportWidth < 640 ? 320 : 380;
}

/** Two columns only when both can be read; otherwise the board keeps the single stacked column. */
export function isTwoColumn(columnWidth: number): boolean {
  return columnWidth >= TWO_COLUMN_MIN;
}

/**
 * A campaign holds its projects in one row, so its frame is as wide as that row. Every campaign
 * frame takes the width of the busiest one, which is what keeps the column edge straight.
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
  kind: "planning" | "notice" | "campaign" | "addCampaign";
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
  columnWidth: number;
  viewportWidth: number;
  planningOpen: boolean;
  /** Which view Planning is showing, since a calendar and a Kanban need different room. */
  planningKanban?: boolean;
  /** Only the agency and the client may start new work from the board. */
  canCreate: boolean;
  /** Designers see only campaigns they hold work in, so empty frames are dropped for them. */
  keepEmptyCampaigns: boolean;
  filtered: boolean;
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
  const split = isTwoColumn(input.columnWidth);

  const grouped = new Map<string, Project[]>();
  for (const project of input.projects) {
    const key = project.campaign_id ?? "none";
    const bucket = grouped.get(key);
    if (bucket) bucket.push(project);
    else grouped.set(key, [project]);
  }
  const ordered = orderCampaigns(input.campaigns).filter(
    (campaign) =>
      (grouped.get(campaign.id)?.length ?? 0) > 0 || (!input.filtered && input.keepEmptyCampaigns),
  );
  const ungrouped = grouped.get("none") ?? [];

  // A frame is as wide as its own row, floored at MIN_ROW_CARDS. Sizing every frame to the busiest
  // campaign instead would leave a one-project campaign sitting in a frame several cards wide.
  const slot = input.canCreate ? 1 : 0;
  const rowWidth = (cards: number) => campaignColumnWidth(Math.max(MIN_ROW_CARDS, cards));
  // Planning never shrinks below what its calendar grid needs; a viewport narrower than both
  // columns pans instead, which keeps the timeline readable rather than crushing it.
  const planningWidth = split
    ? Math.max(PLANNING_MIN_W, input.columnWidth - rowWidth(MIN_ROW_CARDS) - COLUMN_GAP)
    : input.columnWidth;
  const campaignX = split ? planningWidth + COLUMN_GAP : 0;

  const frames: StackFrame[] = [];
  // Stacked, the two columns share one cursor; split, the campaigns run down their own.
  // Stacked, Planning's height decides where the campaigns start, so it is measured before them.
  // Split, it sits in its own column and can be measured afterwards against the campaigns.
  const stackedH = !input.planningOpen
    ? PLANNING_HEAD
    : Math.max(planningHeight(true, input.viewportWidth), input.planningKanban ? KANBAN_MIN_H : 0);
  let cursor = split ? 0 : stackedH + STACK_GAP;
  const push = (frame: Omit<StackFrame, "y" | "x">) => {
    frames.push({ ...frame, x: campaignX, y: cursor });
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

  // Planning is measured last so that, beside the campaigns, it can take their full height — which
  // is what lets the calendar show a lane per project instead of scrolling inside a fixed box.
  const campaignTotal = cursor > 0 ? cursor - STACK_GAP : 0;
  // Beside the campaigns, Planning grows to show its lanes — up to the campaign column's height,
  // past which it scrolls internally. It does not stretch to match a tall column it cannot fill,
  // which is what otherwise leaves a calendar of two projects sitting in an empty frame.
  // Kanban scrolls inside a fixed working height; a calendar grows with its lanes until the
  // campaign column runs out, past which it scrolls too.
  const planningH = !split
    ? stackedH
    : !input.planningOpen
      ? PLANNING_HEAD
      : input.planningKanban
        ? KANBAN_MIN_H
        : Math.max(
            PLANNING_MIN_H,
            Math.min(planningContentHeight(input.projects.length), campaignTotal),
          );
  frames.unshift({
    id: "planning",
    kind: "planning",
    x: 0,
    y: 0,
    width: planningWidth,
    height: planningH,
  });
  return frames;
}

/** Breathing room kept around the board when the view is fitted to it. */
export { FIT_PAD } from "@/features/shared/canvas-fit";
/** Matches the canvas `minZoom`, so a fit never asks for a zoom the canvas would refuse. */
export const MIN_FIT_ZOOM = 0.4;

/**
 * The viewport that shows the whole board at once. Computed from the frames rather than measured
 * after paint, so returning to a board lands on the same view every time instead of depending on
 * whether xyflow had finished rendering when a fit was requested.
 */
export function boardFit(
  content: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number; zoom: number } {
  // The board fits both axes; a ten-campaign column that will not shrink to fit pans instead.
  return fitToContent(content, view, { minZoom: MIN_FIT_ZOOM, constrainHeight: true });
}
