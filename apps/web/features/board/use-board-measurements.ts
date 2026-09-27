"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Measures the floating header inside the board's work area and publishes its bottom edge (plus
 * the stylesheet's gap) as `--board-header-space`, so every view reserves exactly the space the
 * header currently occupies rather than a guessed breakpoint value.
 *
 * Returns a callback ref to attach to the work area element.
 */
export function useBoardHeaderSpace() {
  const [workArea, setWorkArea] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const header = workArea?.querySelector<HTMLElement>(".board-header");
    if (!workArea || !header) return;
    const observer = new ResizeObserver(() => {
      const gap = Number.parseFloat(
        getComputedStyle(workArea).getPropertyValue("--board-header-gap"),
      );
      workArea.style.setProperty(
        "--board-header-space",
        `${header.offsetTop + header.offsetHeight + (Number.isNaN(gap) ? 16 : gap)}px`,
      );
    });
    // The gap changes with the viewport height even when the header's size does not.
    observer.observe(header);
    observer.observe(workArea);
    return () => observer.disconnect();
  }, [workArea]);
  return setWorkArea;
}

/**
 * Measures the Canvas view's surface: a callback ref for its element, a callback ref for the
 * portalled zoom dock, the panel's current size, and a stable key that only changes once that
 * size reflects a real measurement — never the opening guess.
 */
export function useBoardCanvasViewport(clientId: string) {
  // A callback ref rather than a `useRef`: the canvas only exists once the board's data has
  // arrived, and an effect that reads a ref filled after its own run would observe nothing and
  // leave the board measured at the opening guess for good.
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const [zoomDock, setZoomDock] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  // The board is only fitted once the canvas has actually been measured; fitting against the
  // initial guess would frame the board for a viewport that never existed.
  const [measuredCanvas, setMeasuredCanvas] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
      setMeasuredCanvas(canvas);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvas]);
  const fitKey =
    canvas && measuredCanvas === canvas ? `${clientId}:${viewport.width}:${viewport.height}` : "";

  return { setCanvas, setZoomDock, zoomDock, viewport, fitKey };
}
