import { fitToContent } from "@/features/shared/canvas-fit";
/**
 * Geometry for the project canvas: one section per deliverable, each section stacking its versions
 * top to bottom, and each version reading as one horizontal line — the version's label and meta in a
 * fixed column on the left, its designs in a row beside it, and the next version as the line below.
 * It mirrors the board's calendar, where a sticky label column sits to the left of the content and
 * every row starts on the same edge.
 *
 * Every frame is sized by these pure functions instead of being measured after paint, so the canvas
 * lands in its final shape on the first render and never reflows once xyflow has drawn it. The
 * heights below mirror fixed sizes declared in projects.css; the two must be changed together.
 */

/**
 * One design tile. Measured against the card it replaces: a lone design used to take 272 px of a
 * 296 px card, so 200 px keeps a readable preview while letting several tiles sit on one line.
 */
export const TILE_W = 200;
/** Gap between tiles in the row, matching `.version-designs`. */
export const TILE_GAP = 8;
/** Padding `.version-designs` keeps around its row of tiles. */
export const ROW_PAD = 12;
/** The design's title strip under its artwork: 10 px padding twice over a 15 px line. */
export const CAPTION_H = 35;
/** `.version-card` draws a 1 px border, and border-box sizing counts it in the frame. */
export const CARD_BORDER = 2;
/**
 * The label column that opens every version line.
 *
 * Deliberately one tile wide: the line then starts on the same rhythm as the images beside it, and
 * because every section begins at x 0 the labels form a single straight rail down the canvas — the
 * thing that makes the canvas read as a list of lines rather than a stack of blocks.
 */
export const LABEL_W = TILE_W;
/** The version header inside the label column: a 32 px icon button inside 12 px of padding. */
export const HEADER_H = 56;
/**
 * The label column's footer: 10 px above a 15 px design count, a 5 px gap, a 28 px control, and 8 px
 * below. The control takes the column's full width, which a 200 px column cannot give it beside the
 * count.
 */
export const FOOTER_H = 66;
/** The release note, clamped to two 16 px lines under 8 px of padding. */
export const NOTE_H = 40;
/** Client feedback: a 70 px panel inside 10 px margins. */
export const FEEDBACK_H = 90;
/** The trailing "+N more designs" slot, wide enough for its label on two lines. */
export const MORE_W = 112;
/** The invitation shown by a version that holds no design yet, inside the row's own padding. */
export const EMPTY_H = 144;
/** The invitation spans two tile slots, so an empty line still reads as a place designs go. */
export const EMPTY_SLOTS = 2;
/** The deliverable header node: its eyebrow, a single-line name, and the format line. */
export const DELIVERABLE_HEAD_H = 64;
/**
 * The deliverable header is a label for the lines beneath it, not a band across them, so it stops at
 * the width of the narrowest complete line — the label column plus two tile slots. A five-tile
 * section would otherwise leave its "new version" control stranded 1300 px from the name.
 */
export const DELIVERABLE_HEAD_W =
  CARD_BORDER + LABEL_W + ROW_PAD * 2 + EMPTY_SLOTS * TILE_W + TILE_GAP;
/** Space under the deliverable header before its first version. */
export const HEAD_GAP = 16;
/** Space between two versions of the same deliverable, tight enough to read as one list. */
export const VERSION_GAP = 12;
/** Sections are set further apart than versions are, so each deliverable reads as one group. */
export const SECTION_GAP = 40;
/**
 * Past this the line would outgrow the canvas even on its own, so the remaining designs stay
 * reachable through the row's trailing "+N more designs" slot.
 *
 * The cap used to be set by what left room for the next deliverable column. Deliverables are now
 * stacked sections, so the limit is the line itself: five tiles plus the label column and the more
 * slot come to 1378 px, which already fills the canvas pane of a 1600 px window at roughly fit zoom.
 * A sixth tile would push every line below the zoom where an 11 px label can still be read.
 */
export const MAX_ROW_DESIGNS = 5;
/** A very wide deliverable still needs a preview worth looking at. */
export const ARTWORK_MIN_H = 140;
/** A story or a poster would otherwise make a tile taller than the line can show. */
export const ARTWORK_MAX_H = 300;
/** Deliverables such as a brand kit carry no dimensions, so their previews stay square. */
export const DEFAULT_ARTWORK_RATIO = 1;

/**
 * The artwork box for one deliverable, in its own proportions: a 1080 x 1080 square is shown
 * square, a 1080 x 1920 story tall. Every version of the deliverable uses the same box, so the
 * section keeps one rhythm.
 */
export function artworkHeight(width: number | null, height: number | null): number {
  const ratio = width && height && width > 0 && height > 0 ? height / width : DEFAULT_ARTWORK_RATIO;
  return Math.round(Math.min(ARTWORK_MAX_H, Math.max(ARTWORK_MIN_H, TILE_W * ratio)));
}

/** How many designs the row itself shows; the rest sit behind the "+N more designs" slot. */
export function visibleDesigns(count: number): number {
  return Math.min(Math.max(0, count), MAX_ROW_DESIGNS);
}

/** How many designs the row hides behind that slot. */
export function hiddenDesigns(count: number): number {
  return Math.max(0, count - MAX_ROW_DESIGNS);
}

/**
 * The strip beside the label column: its padding, one slot per shown design, and the trailing more
 * slot when the row hides any. A version with no design yet shows the invitation instead.
 */
export function designsWidth(count: number): number {
  const slots = count > 0 ? visibleDesigns(count) : EMPTY_SLOTS;
  const more = hiddenDesigns(count) > 0 ? TILE_GAP + MORE_W : 0;
  return ROW_PAD * 2 + slots * TILE_W + (slots - 1) * TILE_GAP + more;
}

/** A version line is its label column plus its strip of designs, inside the card's border. */
export function versionCardWidth(count: number): number {
  return CARD_BORDER + LABEL_W + designsWidth(count);
}

export type CanvasLayoutVersion = {
  id: string;
  designCount: number;
  /** A release note is optional, and it takes a fixed two-line block when present. */
  hasNote: boolean;
  /** Client feedback is optional, and it takes a fixed panel when present. */
  hasFeedback: boolean;
};

/** The label column's own height: its header and footer, plus whichever blocks the version carries. */
export function versionLabelHeight(version: CanvasLayoutVersion): number {
  return (
    HEADER_H + (version.hasNote ? NOTE_H : 0) + (version.hasFeedback ? FEEDBACK_H : 0) + FOOTER_H
  );
}

/**
 * The line is as tall as its taller half. The designs usually win, which is the point of the shape:
 * the meta no longer stacks above the images, so a version costs one artwork box of height instead
 * of an artwork box and a card's worth of chrome.
 */
export function versionCardHeight(version: CanvasLayoutVersion, artwork: number): number {
  const designs = ROW_PAD * 2 + (version.designCount > 0 ? artwork + CAPTION_H : EMPTY_H);
  return CARD_BORDER + Math.max(versionLabelHeight(version), designs);
}

/**
 * A section is as wide as its widest version line, which is what the canvas has to fit and what the
 * deliverable header measures itself against.
 */
export function sectionWidth(versions: CanvasLayoutVersion[]): number {
  if (!versions.length) return versionCardWidth(0);
  return versions.reduce(
    (widest, version) => Math.max(widest, versionCardWidth(version.designCount)),
    0,
  );
}

/** The header never outgrows its cap, and shrinks with a section narrower than that cap. */
export function deliverableHeadWidth(versions: CanvasLayoutVersion[]): number {
  return Math.min(sectionWidth(versions), DELIVERABLE_HEAD_W);
}

export type CanvasLayoutDeliverable = {
  id: string;
  width: number | null;
  height: number | null;
};

export type CanvasLayoutSection = {
  deliverable: CanvasLayoutDeliverable;
  /** In version order, oldest first, exactly as the canvas stacks them. */
  versions: CanvasLayoutVersion[];
};

export type CanvasFrame = {
  id: string;
  kind: "deliverable" | "version";
  deliverableId: string;
  /** Set on version frames only. */
  versionId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The artwork box every tile in this section uses. */
  artworkHeight: number;
  /** Designs the row shows. */
  visible: number;
  /** Designs the row hides behind its "+N more designs" slot. */
  hidden: number;
};

/**
 * Lays the sections out top to bottom, each one stacking its versions under its header. Every frame
 * starts at x 0, so the label columns line up down the whole canvas and no two frames can overlap.
 * Returns plain frames so the geometry can be unit tested without rendering xyflow.
 */
export function buildCanvas(sections: CanvasLayoutSection[]): CanvasFrame[] {
  const frames: CanvasFrame[] = [];
  let y = 0;
  for (const section of sections) {
    if (frames.length) y += SECTION_GAP;
    const artwork = artworkHeight(section.deliverable.width, section.deliverable.height);
    frames.push({
      id: `deliverable-${section.deliverable.id}`,
      kind: "deliverable",
      deliverableId: section.deliverable.id,
      x: 0,
      y,
      width: deliverableHeadWidth(section.versions),
      height: DELIVERABLE_HEAD_H,
      artworkHeight: artwork,
      visible: 0,
      hidden: 0,
    });
    y += DELIVERABLE_HEAD_H;
    // A deliverable with no version yet ends at its header, so the next section does not inherit the
    // gap that would have opened above a first version.
    if (section.versions.length) y += HEAD_GAP;
    for (const [index, version] of section.versions.entries()) {
      const height = versionCardHeight(version, artwork);
      frames.push({
        id: version.id,
        kind: "version",
        deliverableId: section.deliverable.id,
        versionId: version.id,
        x: 0,
        y,
        width: versionCardWidth(version.designCount),
        height,
        artworkHeight: artwork,
        visible: visibleDesigns(version.designCount),
        hidden: hiddenDesigns(version.designCount),
      });
      y += height;
      if (index < section.versions.length - 1) y += VERSION_GAP;
    }
  }
  return frames;
}

/** The box the frames occupy, which is what the opening view has to place. */
export function canvasBounds(frames: CanvasFrame[]): { width: number; height: number } {
  return frames.reduce(
    (bounds, frame) => ({
      width: Math.max(bounds.width, frame.x + frame.width),
      height: Math.max(bounds.height, frame.y + frame.height),
    }),
    { width: 0, height: 0 },
  );
}

/** Padding between the canvas edge and the content when the canvas opens. */
export { FIT_PAD } from "@/features/shared/canvas-fit";
/**
 * The zoom the opening view never falls below.
 *
 * TILE_W times this floor is ARTWORK_MIN_H, the same size below which the module refuses to draw a
 * preview at all: a view that shows every version of a many-deliverable project at once is a view in
 * which none of them can be read. Past the floor the list scrolls instead, the way a document does.
 */
export const MIN_FIT_ZOOM = ARTWORK_MIN_H / TILE_W;

/**
 * The viewport a project opens with: the list pinned to the top of the canvas, centred across it,
 * at a zoom that fits the width but never magnifies and never shrinks past the floor.
 *
 * Computed from the frames rather than from a rendered canvas, so a project opens on the same view
 * every time. It follows `boardFit` in `features/board/board-layout.ts`, which answers the same
 * problem for the board's tall stack with its own floor and padding; a shared helper would have to
 * be extracted by whoever owns both, so this one stays local and is reported as a duplicate.
 */
export function canvasFit(
  content: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number; zoom: number } {
  // Version rows stack into a tall list, so height must not constrain the fit: the top is pinned
  // and the rest scrolls, rather than the whole canvas shrinking to make the list fit.
  return fitToContent(content, view, { minZoom: MIN_FIT_ZOOM, constrainHeight: false });
}
