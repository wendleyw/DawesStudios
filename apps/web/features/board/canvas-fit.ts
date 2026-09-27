/**
 * Fits the client board to its measured content before paint. The minimum zoom, optional height
 * constraint and padding keep the board legible while leaving larger content available to pan.
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
    /** Room kept around the content; FIT_PAD unless a surface wants more. */
    pad?: number;
  },
): Viewport {
  const pad = options.pad ?? FIT_PAD;
  // Called before anything has been measured, which happens on the first render of every canvas.
  if (content.width <= 0 || view.width <= 0) return { x: pad, y: pad, zoom: 1 };
  const room = Math.max(1, view.width - pad * 2);
  const byHeight =
    options.constrainHeight && content.height > 0
      ? Math.max(1, view.height - pad * 2) / content.height
      : Infinity;
  // Never magnify past 1: small content at natural size reads better than content blown up.
  const zoom = Math.max(options.minZoom, Math.min(1, room / content.width, byHeight));
  return {
    x: Math.max(pad, Math.round((view.width - content.width * zoom) / 2)),
    y: pad,
    zoom,
  };
}
