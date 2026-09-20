/**
 * How a canvas frames its own content.
 *
 * Both xyflow surfaces — the client board and the project canvas — open by fitting the view to the
 * work rather than asking xyflow to measure it after paint, which is what made the board open at an
 * unreadable scale or not at all. The rule is the same in both places, so it lives here once: a
 * canvas that changed this padding or started magnifying small content in one surface and not the
 * other would be a difference nobody chose.
 *
 * The two surfaces differ in exactly two ways, which are the parameters: how far they may zoom out
 * before the content stops being legible, and whether height constrains the fit at all. The board
 * fits both axes and lets the remainder pan. The project canvas is a tall list of version rows, so
 * constraining by height would shrink it to nothing; it fits the width and pins the top.
 */

/** Breathing room kept around the content on every canvas. */
export const FIT_PAD = 24;

export type Viewport = { x: number; y: number; zoom: number };

export function fitToContent(
  content: { width: number; height: number },
  view: { width: number; height: number },
  options: {
    /** The scale below which this surface's content stops being worth showing. */
    minZoom: number;
    /** False when the content is a list that is meant to scroll rather than shrink. */
    constrainHeight: boolean;
  },
): Viewport {
  // Called before anything has been measured, which happens on the first render of every canvas.
  if (content.width <= 0 || view.width <= 0) return { x: FIT_PAD, y: FIT_PAD, zoom: 1 };
  const room = Math.max(1, view.width - FIT_PAD * 2);
  const byHeight =
    options.constrainHeight && content.height > 0
      ? Math.max(1, view.height - FIT_PAD * 2) / content.height
      : Infinity;
  // Never magnify past 1: small content at natural size reads better than content blown up.
  const zoom = Math.max(options.minZoom, Math.min(1, room / content.width, byHeight));
  return {
    x: Math.max(FIT_PAD, Math.round((view.width - content.width * zoom) / 2)),
    y: FIT_PAD,
    zoom,
  };
}
