import { describe, expect, it } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";
import {
  CARD_GAP,
  CARD_H,
  CARD_W,
  FRAME_HEAD,
  FRAME_PAD,
  MAX_COLUMN,
  STACK_GAP,
  buildStack,
  campaignDateRange,
  campaignFrameHeight,
  cardWidth,
  hasStoredPosition,
  orderCampaigns,
  planningHeight,
  slotPosition,
  type BoardCampaign,
  MAX_SPLIT,
  TWO_COLUMN_MIN,
  COLUMN_GAP,
  PLANNING_MIN_H,
  PLANNING_HEAD,
  isTwoColumn,
  campaignColumnWidth,
  MIN_ROW_CARDS,
  LANE_H,
  KANBAN_MIN_H,
  boardFit,
  planningContentHeight,
  FIT_PAD,
  MIN_FIT_ZOOM,
  PLANNING_MIN_W,
} from "./board-layout";

function project(id: string, campaignId: string | null, extra: Partial<Project> = {}): Project {
  return {
    id,
    client_id: "client",
    campaign_id: campaignId,
    briefing_id: null,
    title: `Project ${id}`,
    description: "",
    status: "planned",
    service_type: "static-ad",
    due_date: null,
    start_date: null,
    board_position: { x: 0, y: 0 },
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...extra,
  };
}
function campaign(id: string, title: string, start: string | null, end: string | null = null) {
  return { id, title, start_date: start, end_date: end } satisfies BoardCampaign;
}
// The component caps the column at MAX_COLUMN (board-page.tsx), so the fixture must model a width
// the board can actually render — at 1312 these assertions described a layout that never ships.
const base = {
  columnWidth: MAX_COLUMN,
  viewportWidth: 1600,
  planningOpen: true,
  canCreate: true,
  keepEmptyCampaigns: true,
  filtered: false,
};

describe("campaign ordering", () => {
  it("sorts by start date, then title, then id so ties stay stable", () => {
    // The seeded dataset gives every campaign the same title, so the id tiebreak is load bearing.
    const ordered = orderCampaigns([
      campaign("c", "Fall 2026", "2026-10-01"),
      campaign("a", "Fall 2026", "2026-09-01"),
      campaign("b", "Fall 2026", "2026-09-01"),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("places undated campaigns last rather than first", () => {
    const ordered = orderCampaigns([
      campaign("always", "Brand Essentials", null),
      campaign("dated", "Summer Safety", "2026-09-15"),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["dated", "always"]);
  });
});

describe("frame geometry", () => {
  it("widens the frame one card at a time so the row always fits", () => {
    expect(campaignColumnWidth(1)).toBe(FRAME_PAD * 2 + CARD_W);
    expect(campaignColumnWidth(2)).toBe(campaignColumnWidth(1) + CARD_W + CARD_GAP);
    expect(campaignColumnWidth(5)).toBe(campaignColumnWidth(1) + 4 * (CARD_W + CARD_GAP));
  });

  it("never sizes a frame below one card, even for an empty campaign", () => {
    expect(campaignColumnWidth(0)).toBe(campaignColumnWidth(1));
    expect(cardWidth()).toBe(CARD_W);
  });

  it("keeps every campaign frame exactly one card row tall", () => {
    expect(campaignFrameHeight()).toBe(FRAME_HEAD + FRAME_PAD * 2 + CARD_H);
  });

  it("grows the frame so a card dragged low still fits inside it", () => {
    // `extent: "parent"` clamps children, so a frame that ignored the override would silently drag
    // the card back up and lose the position the agency just saved.
    const grid = campaignFrameHeight();
    expect(campaignFrameHeight([400])).toBe(400 + CARD_H + FRAME_PAD);
    expect(campaignFrameHeight([10])).toBe(grid);
  });

  it("lays every auto slot out on one row, left to right", () => {
    expect(slotPosition(0)).toEqual({ x: FRAME_PAD, y: FRAME_HEAD + FRAME_PAD });
    expect(slotPosition(1)).toEqual({
      x: FRAME_PAD + CARD_W + CARD_GAP,
      y: FRAME_HEAD + FRAME_PAD,
    });
    // The fourth card stays on the row instead of wrapping under the first.
    expect(slotPosition(3)).toEqual({
      x: FRAME_PAD + 3 * (CARD_W + CARD_GAP),
      y: FRAME_HEAD + FRAME_PAD,
    });
  });

  it("treats the stored default as no override", () => {
    expect(hasStoredPosition({ x: 0, y: 0 })).toBe(false);
    expect(hasStoredPosition({ x: 0, y: 80 })).toBe(true);
  });

  it("shortens the planning frame on narrow viewports and collapses to its header", () => {
    expect(planningHeight(true, 1600)).toBe(380);
    expect(planningHeight(true, 390)).toBe(320);
    expect(planningHeight(false, 1600)).toBe(56);
  });
});

describe("campaign date range", () => {
  const format = (value: string | null) => (value ? value.slice(5) : "");
  it("describes both ends, one end, or neither", () => {
    expect(campaignDateRange(campaign("a", "A", "2026-09-15", "2026-09-30"), format)).toBe(
      "09-15 – 09-30",
    );
    expect(campaignDateRange(campaign("a", "A", "2026-09-15"), format)).toBe("From 09-15");
    expect(campaignDateRange(campaign("a", "A", null, "2026-09-30"), format)).toBe("Until 09-30");
    expect(campaignDateRange(campaign("a", "A", null), format)).toBe("No dates set");
  });
});

describe("stack assembly", () => {
  it("puts planning first and stacks the campaigns by date, add-campaign last", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1"), project("p2", "c2")],
      campaigns: [campaign("c2", "Second", "2026-10-01"), campaign("c1", "First", "2026-09-01")],
    });
    expect(frames.map((frame) => frame.id)).toEqual([
      "planning",
      "campaign:c1",
      "campaign:c2",
      "addCampaign",
    ]);
    expect(frames[0].y).toBe(0);
    // The campaigns run down their own column, each below the previous one.
    expect(frames[1].y).toBe(0);
    expect(frames[2].y).toBe(frames[1].y + frames[1].height + STACK_GAP);
    expect(frames[3].y).toBe(frames[2].y + frames[2].height + STACK_GAP);
  });

  it("groups every project under its own campaign", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1"), project("p2", "c1"), project("p3", "c2")],
      campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
    });
    const byId = Object.fromEntries(frames.map((frame) => [frame.id, frame]));
    expect(byId["campaign:c1"].projects?.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(byId["campaign:c2"].projects?.map((item) => item.id)).toEqual(["p3"]);
  });

  it("collects projects without a campaign into their own frame, last", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1"), project("loose", null)],
      campaigns: [campaign("c1", "First", "2026-09-01")],
    });
    const ids = frames.map((frame) => frame.id);
    expect(ids).toContain("campaign:none");
    expect(ids.indexOf("campaign:none")).toBeGreaterThan(ids.indexOf("campaign:c1"));
    expect(frames.find((frame) => frame.id === "campaign:none")?.briefingSlot).toBe(false);
  });

  it("keeps campaigns and the add-campaign frame on a brand new board with no projects", () => {
    // A client whose first campaign exists but holds no briefings yet must still see it, and the
    // way to add more, rather than a bare notice.
    const frames = buildStack({
      ...base,
      projects: [],
      campaigns: [campaign("c1", "First", "2026-09-01")],
    });
    expect(frames.map((frame) => frame.id)).toEqual(["planning", "campaign:c1", "addCampaign"]);
  });

  it("falls back to the notice only when there is nothing at all to render", () => {
    const frames = buildStack({ ...base, projects: [], campaigns: [] });
    expect(frames.map((frame) => frame.id)).toEqual(["planning", "notice", "addCampaign"]);
  });

  it("shows a single notice instead of empty frames when nothing matches", () => {
    const frames = buildStack({
      ...base,
      projects: [],
      campaigns: [campaign("c1", "First", "2026-09-01")],
      filtered: true,
    });
    expect(frames.map((frame) => frame.id)).toEqual(["planning", "notice"]);
  });

  it("hides campaigns with no match once a filter is applied", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
      filtered: true,
    });
    expect(frames.map((frame) => frame.id)).not.toContain("campaign:c2");
  });

  it("keeps a freshly created empty campaign visible while unfiltered", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
    });
    expect(frames.map((frame) => frame.id)).toContain("campaign:c2");
  });

  it("gives a designer no briefing slot, no add-campaign frame and no empty campaigns", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
      canCreate: false,
      keepEmptyCampaigns: false,
    });
    expect(frames.map((frame) => frame.id)).toEqual(["planning", "campaign:c1"]);
    expect(frames[1].briefingSlot).toBe(false);
  });

  it("reserves a slot for the briefing placeholder when sizing a frame", () => {
    const withSlot = buildStack({
      ...base,
      projects: [
        project("p1", "c1"),
        project("p2", "c1"),
        project("p3", "c1"),
        project("p4", "c1"),
      ],
      campaigns: [campaign("c1", "First", "2026-09-01")],
    });
    // Four cards plus the placeholder stay on one row, so the frame widens instead of growing.
    expect(withSlot[1].height).toBe(campaignFrameHeight());
    expect(withSlot[1].width).toBe(campaignColumnWidth(5));
  });

  it("sizes a frame from an unsaved drag exactly like a persisted one", () => {
    const shared = {
      ...base,
      projects: [project("p1", "c1", { board_position: { x: 20, y: 500 } })],
      campaigns: [campaign("c1", "First", "2026-09-01")],
    };
    const persisted = buildStack(shared);
    const dragged = buildStack({
      ...shared,
      projects: [project("p1", "c1")],
      overrides: { p1: { x: 20, y: 500 } },
    });
    expect(dragged[1].height).toBe(persisted[1].height);
    expect(persisted[1].height).toBeGreaterThan(campaignFrameHeight());
  });

  it("moves every frame down when planning expands in the stacked layout", () => {
    const shared = {
      ...base,
      columnWidth: TWO_COLUMN_MIN - 1,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01")],
    };
    const open = buildStack(shared);
    const closed = buildStack({ ...shared, planningOpen: false });
    expect(open[1].y - closed[1].y).toBe(380 - 56);
  });
});

describe("two-column split", () => {
  const split = {
    ...base,
    columnWidth: MAX_SPLIT,
    projects: [project("p1", "c1"), project("p2", "c2")],
    campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
  };

  it("puts planning beside the campaigns rather than above them", () => {
    const frames = buildStack(split);
    const planning = frames[0];
    const campaigns = frames.filter((frame) => frame.kind === "campaign");
    expect(planning.x).toBe(0);
    expect(planning.y).toBe(0);
    for (const frame of campaigns) {
      expect(frame.x).toBe(planning.width + COLUMN_GAP);
      // Beside, not below: the first campaign starts level with planning.
      expect(frame.y).toBeGreaterThanOrEqual(0);
    }
    expect(campaigns[0].y).toBe(0);
  });

  it("never overlaps the two columns", () => {
    // The columns hold their own widths and the canvas pans when they exceed the viewport, so the
    // invariant is that they do not collide — not that they fit on screen.
    for (const columnWidth of [TWO_COLUMN_MIN, 1100, MAX_SPLIT, 2200]) {
      const frames = buildStack({ ...split, columnWidth });
      const planning = frames[0];
      expect(planning.x + planning.width).toBeLessThanOrEqual(frames[1].x);
      for (const frame of frames.slice(1)) expect(frame.x).toBe(frames[1].x);
    }
  });

  it("grows planning with its lanes so the calendar shows real rows", () => {
    const heights = [6, 7, 8].map((count) => {
      const frames = buildStack({
        ...split,
        projects: Array.from({ length: count }, (_, i) => project(`p${i}`, "c1")),
      });
      return frames[0].height;
    });
    // Each extra project adds exactly one lane, rather than the frame holding a fixed height.
    expect(heights[1] - heights[0]).toBe(LANE_H);
    expect(heights[2] - heights[1]).toBe(LANE_H);
    expect(heights[0]).toBe(planningContentHeight(6));
  });

  it("stops growing at the campaign column instead of running past the board", () => {
    // A hundred lanes would make Planning far taller than everything beside it, leaving the board
    // mostly empty; past the column's height the calendar scrolls inside its own frame.
    const crowd = Array.from({ length: 100 }, (_, i) => project(`p${i}`, "c1"));
    const frames = buildStack({ ...split, projects: crowd });
    const last = frames[frames.length - 1];
    expect(frames[0].height).toBe(last.y + last.height);
    expect(frames[0].height).toBeLessThan(planningContentHeight(crowd.length));
  });

  it("does not stretch an almost empty calendar to match a taller column", () => {
    const frames = buildStack(split);
    const last = frames[frames.length - 1];
    expect(frames[0].height).toBe(PLANNING_MIN_H);
    expect(frames[0].height).toBeLessThan(last.y + last.height);
  });

  it("keeps a readable calendar when the campaign column is nearly empty", () => {
    const frames = buildStack({ ...split, projects: [], campaigns: [], canCreate: false });
    expect(frames[0].height).toBe(PLANNING_MIN_H);
  });

  it("collapses planning to its header without disturbing the campaign column", () => {
    const open = buildStack(split);
    const closed = buildStack({ ...split, planningOpen: false });
    expect(closed[0].height).toBe(PLANNING_HEAD);
    expect(closed.map((frame) => frame.y)).toEqual(open.map((frame) => frame.y).slice());
  });

  it("keeps the ordinary campaigns on one straight edge", () => {
    // Two projects plus the briefing slot is the shape of a seeded campaign, and it lands exactly
    // on the shared floor — so in practice the column reads as one block.
    const frames = buildStack({
      ...split,
      projects: [project("p1", "c1"), project("p2", "c2"), project("p3", "c2")],
    });
    const campaigns = frames.filter((frame) => frame.kind === "campaign");
    expect(campaigns.map((frame) => frame.width)).toEqual([
      campaignColumnWidth(MIN_ROW_CARDS),
      campaignColumnWidth(MIN_ROW_CARDS),
    ]);
  });

  it("lets one busy campaign extend without widening the quiet ones", () => {
    // Sizing every frame to the busiest row would leave the single-project campaign sitting in a
    // frame eight cards wide, almost all of it empty.
    const busy = Array.from({ length: 7 }, (_, i) => project(`b${i}`, "c1"));
    const frames = buildStack({ ...split, projects: [...busy, project("q1", "c2")] });
    const campaigns = frames.filter((frame) => frame.kind === "campaign");
    expect(campaigns[0].width).toBe(campaignColumnWidth(8));
    expect(campaigns[1].width).toBe(campaignColumnWidth(MIN_ROW_CARDS));
    // The column still has one straight left edge, which is what makes it read as a column.
    expect(new Set(campaigns.map((frame) => frame.x)).size).toBe(1);
  });

  it("never drops a frame below the shared floor", () => {
    const frames = buildStack({ ...split, projects: [project("p1", "c1")], canCreate: false });
    for (const frame of frames.slice(1))
      expect(frame.width).toBeGreaterThanOrEqual(campaignColumnWidth(MIN_ROW_CARDS));
  });

  it("keeps the calendar at its usable width even when the campaigns are wide", () => {
    const frames = buildStack({
      ...split,
      projects: Array.from({ length: 6 }, (_, i) => project(`p${i}`, "c1")),
      campaigns: [campaign("c1", "First", "2026-09-01")],
    });
    expect(frames[0].width).toBe(PLANNING_MIN_W);
    expect(frames[1].x).toBe(PLANNING_MIN_W + COLUMN_GAP);
  });

  it("falls back to one column when neither side would be readable", () => {
    const frames = buildStack({ ...split, columnWidth: TWO_COLUMN_MIN - 1 });
    expect(isTwoColumn(TWO_COLUMN_MIN - 1)).toBe(false);
    for (const frame of frames) expect(frame.x).toBe(0);
    expect(frames[0].width).toBe(TWO_COLUMN_MIN - 1);
    expect(frames[1].y).toBeGreaterThan(frames[0].height);
  });
});

describe("fitting the view to the board", () => {
  const view = { width: 1400, height: 900 };

  it("shows the whole board when it is larger than the view", () => {
    const content = { width: 2800, height: 1200 };
    const fit = boardFit(content, view);
    expect(content.width * fit.zoom).toBeLessThanOrEqual(view.width - FIT_PAD * 2 + 1);
    expect(content.height * fit.zoom).toBeLessThanOrEqual(view.height - FIT_PAD * 2 + 1);
  });

  it("constrains on whichever axis overflows first", () => {
    // Tall and narrow: height decides, and the extra width is spent on centring.
    const fit = boardFit({ width: 600, height: 2000 }, view);
    expect(fit.zoom).toBeCloseTo((view.height - FIT_PAD * 2) / 2000, 5);
    expect(fit.x).toBeGreaterThan(FIT_PAD);
  });

  it("keeps a full board legible instead of shrinking it to fit the height", () => {
    // Ten campaigns stacked beside the calendar are far taller than any laptop viewport. Fitting
    // that height literally would render a 280px card at ~90px, so the fit stops at the legible
    // floor, shows both columns across, and leaves the rest to vertical panning.
    const tall = { width: 1520, height: 2900 };
    const fit = boardFit(tall, view);
    expect(fit.zoom).toBe(MIN_FIT_ZOOM);
    expect(tall.width * fit.zoom).toBeLessThanOrEqual(view.width - FIT_PAD * 2);
    expect(fit.y).toBe(FIT_PAD);
  });

  it("never magnifies a small board past its natural size", () => {
    const fit = boardFit({ width: 400, height: 300 }, view);
    expect(fit.zoom).toBe(1);
    expect(fit.x).toBe(Math.round((view.width - 400) / 2));
  });

  it("stops at the zoom the canvas itself allows", () => {
    expect(boardFit({ width: 40000, height: 40000 }, view).zoom).toBe(MIN_FIT_ZOOM);
  });

  it("keeps the board on screen rather than pushing it off to centre it", () => {
    const fit = boardFit({ width: 20000, height: 400 }, view);
    expect(fit.x).toBeGreaterThanOrEqual(FIT_PAD);
    expect(fit.y).toBe(FIT_PAD);
  });

  it("returns a usable viewport before the board has been measured", () => {
    expect(boardFit({ width: 0, height: 0 }, view)).toEqual({ x: FIT_PAD, y: FIT_PAD, zoom: 1 });
  });
});

describe("Planning sized for the view it holds", () => {
  const two = {
    ...base,
    columnWidth: MAX_SPLIT,
    projects: [project("p1", "c1"), project("p2", "c1")],
    campaigns: [campaign("c1", "A", "2026-09-01")],
  };

  it("gives Kanban the room a column of cards needs, not a calendar's", () => {
    // Sizing Kanban from the lane count gave a two-project board 280px while its column needed
    // 299, which cut the second card in half.
    const calendar = buildStack(two);
    const kanban = buildStack({ ...two, planningKanban: true });
    expect(calendar[0].height).toBeLessThan(KANBAN_MIN_H);
    expect(kanban[0].height).toBe(KANBAN_MIN_H);
  });

  it("keeps Kanban at its working height rather than following a tall campaign column", () => {
    const campaigns = Array.from({ length: 10 }, (_, i) =>
      campaign(`c${i}`, `C${i}`, `2026-0${(i % 9) + 1}-01`),
    );
    const crowd = campaigns.map((c, i) => project(`p${i}`, c.id));
    const frames = buildStack({ ...two, campaigns, projects: crowd, planningKanban: true });
    const last = frames[frames.length - 1];
    expect(last.y + last.height).toBeGreaterThan(KANBAN_MIN_H);
    expect(frames[0].height).toBe(KANBAN_MIN_H);
  });

  it("reserves the same room in the stacked layout, pushing the campaigns down", () => {
    const narrow = { ...two, columnWidth: TWO_COLUMN_MIN - 1 };
    const calendar = buildStack(narrow);
    const kanban = buildStack({ ...narrow, planningKanban: true });
    expect(kanban[0].height).toBe(KANBAN_MIN_H);
    expect(kanban[1].y).toBeGreaterThan(calendar[1].y);
    expect(kanban[1].y).toBeGreaterThanOrEqual(kanban[0].height);
  });

  it("still collapses to the header when Planning is shut", () => {
    const frames = buildStack({ ...two, planningKanban: true, planningOpen: false });
    expect(frames[0].height).toBe(PLANNING_HEAD);
  });
});
