import { describe, expect, it } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";
import {
  CARD_GAP,
  CARD_H,
  CARD_W,
  FRAME_HEAD,
  FRAME_PAD,
  STACK_GAP,
  buildStack,
  campaignDateRange,
  campaignFrameHeight,
  cardWidth,
  hasStoredPosition,
  orderCampaigns,
  slotPosition,
  arrangeFrame,
  dropCard,
  type BoardCampaign,
  campaignColumnWidth,
  competitorWidgetHeight,
  MIN_ROW_CARDS,
  boardFit,
  FIT_PAD,
  MIN_FIT_ZOOM,
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
    delivered_at: null,
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
const base = {
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

  it("puts cards saved off the grid back on it, keeping the gap even", () => {
    const width = campaignColumnWidth(3);
    const { cards, slot } = arrangeFrame(
      [
        project("p1", "c1", { board_position: { x: 0, y: 73.6 } }),
        project("p2", "c1", { board_position: { x: 310.7, y: 72 } }),
      ],
      { width, briefingSlot: true },
    );
    expect(cards).toEqual({ p1: slotPosition(0), p2: slotPosition(1) });
    expect(slot).toEqual(slotPosition(2));
  });

  it("never stacks two cards in one cell", () => {
    const { cards } = arrangeFrame(
      [project("p1", "c1", { board_position: { x: 330, y: 80 } }), project("p2", "c1")],
      { width: campaignColumnWidth(3), briefingSlot: false },
    );
    // p1 was saved on p2's auto slot, so p2 takes the nearest free cell.
    expect(cards.p1).toEqual(slotPosition(1));
    expect(cards.p2).toEqual(slotPosition(0));
  });

  it("lets the dragged card follow the pointer until it is dropped", () => {
    const { cards } = arrangeFrame([project("p1", "c1")], {
      width: campaignColumnWidth(3),
      briefingSlot: false,
      overrides: { p1: { x: 137, y: 95 } },
      dragging: "p1",
    });
    expect(cards.p1).toEqual({ x: 137, y: 95 });
  });

  it("settles a drop on the cell beneath it", () => {
    expect(
      dropCard({
        id: "p1",
        drop: { x: slotPosition(1).x + 37, y: 95 },
        origin: slotPosition(0),
        frameWidth: campaignColumnWidth(3),
        cards: { p1: slotPosition(0) },
        slot: null,
      }),
    ).toEqual({ p1: slotPosition(1) });
  });

  it("swaps two cards when one is dropped on the other", () => {
    expect(
      dropCard({
        id: "p1",
        drop: { x: slotPosition(1).x - 30, y: 60 },
        origin: slotPosition(0),
        frameWidth: campaignColumnWidth(3),
        cards: { p1: slotPosition(0), p2: slotPosition(1) },
        slot: slotPosition(2),
      }),
    ).toEqual({ p1: slotPosition(1), p2: slotPosition(0) });
  });

  it("moves a card dropped on the briefing slot to the nearest free cell instead", () => {
    const row2 = {
      x: FRAME_PAD + 2 * (CARD_W + CARD_GAP),
      y: FRAME_HEAD + FRAME_PAD + CARD_H + CARD_GAP,
    };
    expect(
      dropCard({
        id: "p1",
        drop: slotPosition(2),
        origin: slotPosition(0),
        frameWidth: campaignColumnWidth(3),
        cards: { p1: slotPosition(0), p2: slotPosition(1) },
        slot: slotPosition(2),
      }),
      // Its own old cell is equally free, but the cell below is nearer to where it was let go.
    ).toEqual({ p1: row2 });
  });

  it("treats the stored default as no override", () => {
    expect(hasStoredPosition({ x: 0, y: 0 })).toBe(false);
    expect(hasStoredPosition({ x: 0, y: 80 })).toBe(true);
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
  it("stacks only campaigns by date, with add-campaign last", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1"), project("p2", "c2")],
      campaigns: [campaign("c2", "Second", "2026-10-01"), campaign("c1", "First", "2026-09-01")],
    });
    expect(frames.map((frame) => frame.id)).toEqual(["campaign:c1", "campaign:c2", "addCampaign"]);
    expect(frames[0].y).toBe(0);
    expect(frames[1].y).toBe(frames[0].height + STACK_GAP);
    expect(frames[2].y).toBe(frames[1].y + frames[1].height + STACK_GAP);
    expect(frames.every((frame) => frame.x === 0)).toBe(true);
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
    expect(frames.map((frame) => frame.id)).toEqual(["campaign:c1", "addCampaign"]);
  });

  it("falls back to the notice only when there is nothing at all to render", () => {
    const frames = buildStack({ ...base, projects: [], campaigns: [] });
    expect(frames.map((frame) => frame.id)).toEqual(["notice", "addCampaign"]);
  });

  it("shows a single notice instead of empty frames when nothing matches", () => {
    const frames = buildStack({
      ...base,
      projects: [],
      campaigns: [campaign("c1", "First", "2026-09-01")],
      filtered: true,
    });
    expect(frames.map((frame) => frame.id)).toEqual(["notice"]);
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

  it("keeps the just-selected campaign visible even though selecting it is what filtered the board", () => {
    // Reproduces defect D-1: `CampaignDialog`'s `onCreated` sets the campaign filter to the
    // campaign just made, which is what turns `filtered` on. Its own frame must survive that.
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
      filtered: true,
      selectedCampaignId: "c2",
    });
    expect(frames.map((frame) => frame.id)).toContain("campaign:c2");
  });

  it("still collapses an unselected empty campaign when a search matches nothing", () => {
    // The selected-campaign escape hatch must not blunt the existing search/status behaviour: a
    // search that narrows the board to nothing still hides every empty frame it does not name.
    const frames = buildStack({
      ...base,
      projects: [],
      campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
      filtered: true,
      selectedCampaignId: "c2",
    });
    expect(frames.map((frame) => frame.id)).toEqual(["campaign:c2"]);
  });

  it("gives a designer no briefing slot, no add-campaign frame and no empty campaigns", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
      canCreate: false,
      keepEmptyCampaigns: false,
    });
    expect(frames.map((frame) => frame.id)).toEqual(["campaign:c1"]);
    expect(frames[0].briefingSlot).toBe(false);
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
    expect(withSlot[0].height).toBe(campaignFrameHeight());
    expect(withSlot[0].width).toBe(campaignColumnWidth(5));
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
    expect(dragged[0].height).toBe(persisted[0].height);
    expect(persisted[0].height).toBeGreaterThan(campaignFrameHeight());
  });
});

describe("campaign widths", () => {
  const split = {
    ...base,
    projects: [project("p1", "c1"), project("p2", "c2")],
    campaigns: [campaign("c1", "First", "2026-09-01"), campaign("c2", "Second", "2026-10-01")],
  };

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

describe("competitor ads widget frame", () => {
  it("sits first in the stack, as wide as a three-card row, and pushes the campaigns down", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01")],
      competitorWidget: { count: 5 },
    });
    expect(frames.map((frame) => frame.id)).toEqual([
      "widget:competitor-ads",
      "campaign:c1",
      "addCampaign",
    ]);
    expect(frames[0]).toMatchObject({
      kind: "competitorAds",
      x: 0,
      y: 0,
      width: campaignColumnWidth(3),
    });
    expect(frames[0].height).toBe(competitorWidgetHeight(5));
    expect(frames[1].y).toBe(frames[0].height + STACK_GAP);
  });

  it("grows by one row per four competitors, and keeps one row when empty", () => {
    expect(competitorWidgetHeight(0)).toBe(FRAME_HEAD + 88 + FRAME_PAD);
    expect(competitorWidgetHeight(4)).toBe(FRAME_HEAD + 88 + FRAME_PAD);
    expect(competitorWidgetHeight(5)).toBe(FRAME_HEAD + 88 * 2 + 12 + FRAME_PAD);
    expect(competitorWidgetHeight(12)).toBe(FRAME_HEAD + 88 * 3 + 12 * 2 + FRAME_PAD);
  });

  it("adds no frame when the widget is not on the board", () => {
    const frames = buildStack({
      ...base,
      projects: [],
      campaigns: [campaign("c1", "First", "2026-09-01")],
    });
    expect(frames.some((frame) => frame.kind === "competitorAds")).toBe(false);
  });
});
