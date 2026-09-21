"use client";

import { useReactFlow, useStore } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { canvasFit } from "./canvas-layout";

/**
 * Places the opening view once the canvas knows how wide it is.
 *
 * xyflow's own Fit View is not used on load: a project with several deliverables is a tall list, and
 * fitting its full height would centre it at a scale where nothing can be read and hide its first
 * version above the pane. The view is computed from the frames instead, so it does not depend on
 * xyflow having finished rendering, and it is applied once — a later resize, such as opening the
 * conversation panel, must not drag the canvas out from under the viewer. The Fit View control
 * remains for anyone who does want the whole project at once.
 */
export function CanvasOpeningView({
  content,
  view,
}: {
  content: { width: number; height: number };
  view: { width: number; height: number };
}) {
  const { setViewport } = useReactFlow();
  // Setting a viewport before the pan/zoom instance exists is silently dropped.
  const ready = useStore((state) => !!state.panZoom);
  const placed = useRef(false);
  useEffect(() => {
    if (!ready || placed.current || view.width <= 0 || content.width <= 0) return;
    placed.current = true;
    void setViewport(canvasFit(content, view));
  }, [ready, content, view, setViewport]);
  return null;
}
