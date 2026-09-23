import { describe, expect, it } from "vitest";
import {
  ARTWORK_MAX_H,
  ARTWORK_MIN_H,
  CAPTION_H,
  CARD_BORDER,
  DELIVERABLE_HEAD_H,
  DELIVERABLE_HEAD_W,
  EMPTY_H,
  EMPTY_SLOTS,
  FEEDBACK_LINK_H,
  FIT_PAD,
  FOOTER_H,
  HEAD_GAP,
  HEADER_H,
  LABEL_W,
  MAX_ROW_DESIGNS,
  MIN_FIT_ZOOM,
  MORE_W,
  ROW_PAD,
  SECTION_GAP,
  TILE_GAP,
  TILE_W,
  VERSION_GAP,
  artworkHeight,
  buildCanvas,
  canvasBounds,
  canvasFit,
  deliverableHeadWidth,
  designsWidth,
  hiddenDesigns,
  sectionWidth,
  versionCardHeight,
  versionCardWidth,
  versionLabelHeight,
  visibleDesigns,
  type CanvasFrame,
  type CanvasLayoutSection,
  type CanvasLayoutVersion,
} from "./canvas-layout";

function version(id: string, designCount: number, extra: Partial<CanvasLayoutVersion> = {}) {
  return { id, designCount, ...extra };
}
function section(
  id: string,
  versions: CanvasLayoutVersion[],
  size: { width: number | null; height: number | null } = { width: 1080, height: 1080 },
): CanvasLayoutSection {
  return { deliverable: { id, ...size }, versions };
}
function overlaps(a: CanvasFrame, b: CanvasFrame) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function overlapping(frames: CanvasFrame[]) {
  const pairs: string[] = [];
  for (let i = 0; i < frames.length; i += 1)
    for (let j = i + 1; j < frames.length; j += 1)
      if (overlaps(frames[i], frames[j])) pairs.push(`${frames[i].id} / ${frames[j].id}`);
  return pairs;
}

describe("artwork box", () => {
  it("shows a 1080 x 1080 square deliverable square", () => {
    expect(artworkHeight(1080, 1080)).toBe(TILE_W);
  });

  it("keeps the deliverable's own proportions", () => {
    // A portrait feed post, 1080 x 1350.
    expect(artworkHeight(1080, 1350)).toBe(250);
    // A landscape banner is shorter than the tile is wide.
    expect(artworkHeight(1600, 900)).toBe(ARTWORK_MIN_H);
  });

  it("clamps the extremes so one tile cannot outgrow its line", () => {
    // A 1080 x 1920 reel or story would ask for 356 px.
    expect(artworkHeight(1080, 1920)).toBe(ARTWORK_MAX_H);
    // A very wide strip would otherwise collapse to a sliver.
    expect(artworkHeight(4000, 200)).toBe(ARTWORK_MIN_H);
  });

  it("falls back to a square for deliverables that carry no dimensions", () => {
    expect(artworkHeight(null, null)).toBe(TILE_W);
    expect(artworkHeight(1080, null)).toBe(TILE_W);
    expect(artworkHeight(0, 0)).toBe(TILE_W);
  });
});

describe("row of designs", () => {
  it("shows every design up to the row cap and hides the rest", () => {
    expect(visibleDesigns(0)).toBe(0);
    expect(visibleDesigns(3)).toBe(3);
    expect(visibleDesigns(MAX_ROW_DESIGNS)).toBe(MAX_ROW_DESIGNS);
    expect(visibleDesigns(9)).toBe(MAX_ROW_DESIGNS);
    expect(hiddenDesigns(MAX_ROW_DESIGNS)).toBe(0);
    expect(hiddenDesigns(9)).toBe(9 - MAX_ROW_DESIGNS);
  });

  it("gives one design exactly one slot, with no phantom slot beside it", () => {
    // The line is a list row, not a card with a spare tile: the right edge is allowed to be ragged.
    expect(designsWidth(1)).toBe(ROW_PAD * 2 + TILE_W);
    expect(versionCardWidth(1)).toBe(CARD_BORDER + LABEL_W + ROW_PAD * 2 + TILE_W);
  });

  it("widens the line one tile at a time so the designs stay on one row", () => {
    expect(designsWidth(3)).toBe(designsWidth(2) + TILE_W + TILE_GAP);
    expect(versionCardWidth(5)).toBe(versionCardWidth(2) + 3 * (TILE_W + TILE_GAP));
  });

  it("spans the invitation across two slots when the version holds no design", () => {
    expect(designsWidth(0)).toBe(ROW_PAD * 2 + EMPTY_SLOTS * TILE_W + (EMPTY_SLOTS - 1) * TILE_GAP);
  });

  it("stops widening at the row cap and adds one slot for the more control", () => {
    expect(versionCardWidth(MAX_ROW_DESIGNS + 1)).toBe(
      versionCardWidth(MAX_ROW_DESIGNS) + TILE_GAP + MORE_W,
    );
    expect(versionCardWidth(12)).toBe(versionCardWidth(MAX_ROW_DESIGNS + 1));
  });

  it("keeps the widest possible line inside the canvas pane of a 1600 px window", () => {
    // The pane measures 1368 px there; the cap exists so one line never needs more than fit zoom.
    expect(versionCardWidth(MAX_ROW_DESIGNS + 1)).toBeLessThan(1400);
  });
});

describe("version line height", () => {
  const artwork = artworkHeight(1080, 1080);
  const designs = ROW_PAD * 2 + artwork + CAPTION_H;

  it("is the row of artwork inside its padding, not a header stacked above it", () => {
    expect(versionCardHeight(version("v1", 1), artwork)).toBe(CARD_BORDER + designs);
    // A second design joins the row, so the line grows sideways and not down.
    expect(versionCardHeight(version("v1", 2), artwork)).toBe(
      versionCardHeight(version("v1", 1), artwork),
    );
  });

  it("does not depend on any measurement of the rendered node", () => {
    // Five designs and one design make a line of the same height; only the width differs.
    expect(versionCardHeight(version("v1", 5), artwork)).toBe(
      versionCardHeight(version("v1", 1), artwork),
    );
    expect(versionCardWidth(5)).toBeGreaterThan(versionCardWidth(1));
  });

  it("keeps the more control on the line instead of adding a row under it", () => {
    expect(versionCardHeight(version("v1", MAX_ROW_DESIGNS + 1), artwork)).toBe(
      versionCardHeight(version("v1", MAX_ROW_DESIGNS), artwork),
    );
  });

  it("keeps room for the invitation when the version holds no design", () => {
    expect(versionCardHeight(version("v1", 0), artwork)).toBe(CARD_BORDER + ROW_PAD * 2 + EMPTY_H);
  });

  it("fits the compact feedback shortcut beside landscape artwork and empty invitations", () => {
    expect(versionLabelHeight()).toBe(HEADER_H + FEEDBACK_LINK_H + FOOTER_H);
    expect(versionLabelHeight()).toBeLessThan(ROW_PAD * 2 + ARTWORK_MIN_H + CAPTION_H);
    expect(versionLabelHeight()).toBeLessThan(ROW_PAD * 2 + EMPTY_H);
    expect(versionCardHeight(version("v1", 1), ARTWORK_MIN_H)).toBe(
      CARD_BORDER + ROW_PAD * 2 + ARTWORK_MIN_H + CAPTION_H,
    );
  });

  it("follows the deliverable's proportions, so a reel line is taller than a square one", () => {
    const reel = artworkHeight(1080, 1920);
    expect(versionCardHeight(version("v1", 1), reel)).toBe(
      versionCardHeight(version("v1", 1), artwork) + (reel - artwork),
    );
  });
});

describe("section width", () => {
  it("takes the widest version line in the section", () => {
    expect(sectionWidth([version("v1", 4), version("v2", 1)])).toBe(versionCardWidth(4));
  });

  it("keeps the invitation's width for a deliverable with no version yet", () => {
    expect(sectionWidth([])).toBe(versionCardWidth(0));
  });

  it("caps the deliverable header so its control stays beside the name", () => {
    expect(deliverableHeadWidth([version("v1", 5)])).toBe(DELIVERABLE_HEAD_W);
    expect(deliverableHeadWidth([version("v1", 1)])).toBe(versionCardWidth(1));
    expect(DELIVERABLE_HEAD_W).toBe(versionCardWidth(EMPTY_SLOTS));
  });
});

describe("canvas", () => {
  it("reserves creation cards beside artwork and below each editable section without overlap", () => {
    const sections = [
      { ...section("empty", []), canAddVersion: true },
      {
        ...section("square", [
          version("v1", 7, { canAddDesign: true }),
          version("v2", 0, { canAddDesign: true }),
        ]),
        canAddVersion: true,
      },
      section("readonly", [version("v3", 1)]),
    ];
    const frames = buildCanvas(sections);
    const creates = frames.filter((frame) => frame.kind === "addVersion");
    expect(creates.map((frame) => frame.deliverableId)).toEqual(["empty", "square"]);
    const lastVersion = frames.find((frame) => frame.id === "v2")!;
    expect(creates[1].y).toBeGreaterThanOrEqual(lastVersion.y + lastVersion.height + VERSION_GAP);
    expect(creates[1].width).toBeGreaterThanOrEqual(lastVersion.width);
    expect(overlapping(frames)).toEqual([]);
    expect(canvasBounds(frames).height).toBeGreaterThan(creates[1].y + creates[1].height);
  });

  it("fits one creation tile in an empty editable row and appends it after existing designs", () => {
    const [, empty, filled] = buildCanvas([
      section("square", [
        version("empty", 0, { canAddDesign: true }),
        version("filled", 2, { canAddDesign: true }),
      ]),
    ]);
    expect(empty.width).toBe(versionCardWidth(1));
    expect(empty.height).toBe(versionCardHeight(version("artwork", 1), TILE_W));
    expect(filled.width).toBe(versionCardWidth(3));
  });

  it("stacks the versions of a deliverable under its header, in order, on one left edge", () => {
    const frames = buildCanvas([
      section("square", [version("v1", 3), version("v2", 1), version("v3", 0)]),
    ]);
    expect(frames.map((frame) => frame.id)).toEqual(["deliverable-square", "v1", "v2", "v3"]);
    const [head, v1, v2, v3] = frames;
    expect(head.y).toBe(0);
    expect(head.height).toBe(DELIVERABLE_HEAD_H);
    expect(v1.y).toBe(DELIVERABLE_HEAD_H + HEAD_GAP);
    expect(v2.y).toBe(v1.y + v1.height + VERSION_GAP);
    expect(v3.y).toBe(v2.y + v2.height + VERSION_GAP);
    // The label column of every line starts on the same edge, header included.
    expect(frames.every((frame) => frame.x === 0)).toBe(true);
  });

  it("gives each line its own width and the header the capped one", () => {
    const frames = buildCanvas([section("square", [version("v1", 4), version("v2", 1)])]);
    expect(frames[0].width).toBe(DELIVERABLE_HEAD_W);
    expect(frames[1].width).toBe(versionCardWidth(4));
    expect(frames[2].width).toBe(versionCardWidth(1));
  });

  it("stacks the next deliverable under the last line of the one above", () => {
    const frames = buildCanvas([
      section("square", [version("v1", 2), version("v2", 1)]),
      section("reel", [version("v3", 1)], { width: 1080, height: 1920 }),
    ]);
    const [head, v1, v2, reelHead, v3] = frames;
    expect(head.y).toBe(0);
    expect(reelHead.y).toBe(v2.y + v2.height + SECTION_GAP);
    expect(v3.y).toBe(reelHead.y + DELIVERABLE_HEAD_H + HEAD_GAP);
    expect(v1.y).toBeLessThan(v2.y);
  });

  it("does not open a version gap under a deliverable that has no version yet", () => {
    const frames = buildCanvas([section("empty", []), section("square", [version("v1", 1)])]);
    expect(frames.map((frame) => frame.id)).toEqual([
      "deliverable-empty",
      "deliverable-square",
      "v1",
    ]);
    expect(frames[1].y).toBe(DELIVERABLE_HEAD_H + SECTION_GAP);
  });

  it("never lets two frames overlap, whatever the sections hold", () => {
    const frames = buildCanvas([
      section("square", [version("v1", 5), version("v2", 1)]),
      section("reel", [version("v3", 2), version("v4", 0)], {
        width: 1080,
        height: 1920,
      }),
      section("loose", [version("v5", 9)], {
        width: null,
        height: null,
      }),
      section("pending", []),
    ]);
    expect(overlapping(frames)).toEqual([]);
  });

  it("uses one artwork box for every version of a deliverable", () => {
    const frames = buildCanvas([
      section("square", [version("v1", 2), version("v2", 1)]),
      section("reel", [version("v3", 1)], { width: 1080, height: 1920 }),
    ]);
    expect(frames.map((frame) => frame.artworkHeight)).toEqual([
      TILE_W,
      TILE_W,
      TILE_W,
      ARTWORK_MAX_H,
      ARTWORK_MAX_H,
    ]);
  });

  it("reports what the row shows and what the more control hides", () => {
    const frames = buildCanvas([section("square", [version("v1", 7), version("v2", 2)])]);
    expect(frames[1]).toMatchObject({ visible: MAX_ROW_DESIGNS, hidden: 7 - MAX_ROW_DESIGNS });
    expect(frames[2]).toMatchObject({ visible: 2, hidden: 0 });
  });

  it("returns nothing for a canvas with no deliverable in scope", () => {
    expect(buildCanvas([])).toEqual([]);
  });

  it("lays a filtered canvas out as a single section at the origin", () => {
    // The deliverable filter hands buildCanvas one section, which must start at y 0 rather than
    // keeping the offset it had while every deliverable was shown.
    const frames = buildCanvas([
      section("reel", [version("v1", 1)], { width: 1080, height: 1920 }),
    ]);
    expect(frames[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe("opening view", () => {
  const frames = buildCanvas([
    section("reel", [version("v1", 2), version("v2", 1)], { width: 1080, height: 1920 }),
    section("feed", [version("v3", 1)], { width: 1080, height: 1350 }),
  ]);

  it("measures the box the frames occupy", () => {
    const bounds = canvasBounds(frames);
    expect(bounds.width).toBe(versionCardWidth(2));
    const last = frames.at(-1) as CanvasFrame;
    expect(bounds.height).toBe(last.y + last.height);
    expect(canvasBounds([])).toEqual({ width: 0, height: 0 });
  });

  it("pins the list to the top of the canvas instead of centring it", () => {
    // The list is taller than the pane, so centring would hide its first version above the edge.
    const view = { width: 1360, height: 760 };
    expect(canvasBounds(frames).height).toBeGreaterThan(view.height);
    expect(canvasFit(canvasBounds(frames), view).y).toBe(FIT_PAD);
  });

  it("fits the width, never magnifies, and stops at the readable floor", () => {
    const wide = { width: 1378, height: 400 };
    // A pane that can show the widest line keeps the canvas at natural size.
    expect(canvasFit(wide, { width: 1600, height: 900 }).zoom).toBe(1);
    // A narrower pane scales down to the width it does have.
    expect(canvasFit(wide, { width: 1200, height: 900 }).zoom).toBeCloseTo(
      (1200 - FIT_PAD * 2) / 1378,
      5,
    );
    // A phone cannot show the line at the floor either, and the canvas stops there and pans.
    expect(canvasFit(wide, { width: 390, height: 540 }).zoom).toBe(MIN_FIT_ZOOM);
    expect(MIN_FIT_ZOOM).toBe(ARTWORK_MIN_H / TILE_W);
  });

  it("centres the content across the pane without pulling it off the left edge", () => {
    expect(canvasFit({ width: 634, height: 400 }, { width: 1360, height: 760 }).x).toBe(
      Math.round((1360 - 634) / 2),
    );
    expect(canvasFit({ width: 1378, height: 400 }, { width: 390, height: 540 }).x).toBe(FIT_PAD);
  });

  it("falls back to the origin before the canvas has a size", () => {
    expect(canvasFit({ width: 0, height: 0 }, { width: 1360, height: 760 })).toEqual({
      x: FIT_PAD,
      y: FIT_PAD,
      zoom: 1,
    });
    expect(canvasFit({ width: 634, height: 400 }, { width: 0, height: 0 })).toEqual({
      x: FIT_PAD,
      y: FIT_PAD,
      zoom: 1,
    });
  });
});
