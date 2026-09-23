"use client";

import { useReactFlow, useStore } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { fitToContent } from "@/features/shared/canvas-fit";
import { canvasFit } from "./canvas-layout";
import { CanvasControls } from "@/features/shared/canvas-controls";

function projectViewport(
  content: { width: number; height: number },
  view: { width: number; height: number },
  topInset: number,
) {
  const viewport = canvasFit(content, {
    width: view.width,
    height: Math.max(1, view.height - topInset),
  });
  return { ...viewport, y: viewport.y + topInset };
}

export function ProjectCanvasControls({
  content,
  view,
  topInset,
}: {
  content: { width: number; height: number };
  view: { width: number; height: number };
  topInset: number;
}) {
  const { setViewport } = useReactFlow();
  return (
    <CanvasControls
      onFit={(duration) => {
        const viewport = fitToContent(
          content,
          { width: view.width, height: Math.max(1, view.height - topInset) },
          { minZoom: 0.2, constrainHeight: true },
        );
        void setViewport({ ...viewport, y: viewport.y + topInset }, { duration });
      }}
    />
  );
}

/**
 * Places the opening view once the canvas knows how wide it is.
 *
 * xyflow's own Fit View is not used on load: a project with several deliverables is a tall list, and
 * fitting its full height would centre it at a scale where nothing can be read and hide its first
 * version above the pane. The view is computed from the frames instead, so it does not depend on
 * xyflow having finished rendering. A header-height change reapplies it; a pane resize such as
 * opening the conversation panel must not drag the canvas out from under the viewer. The Fit View control
 * remains for anyone who does want the whole project at once.
 */
export function CanvasOpeningView({
  content,
  view,
  topInset,
}: {
  content: { width: number; height: number };
  view: { width: number; height: number };
  topInset: number;
}) {
  const { setViewport } = useReactFlow();
  // Setting a viewport before the pan/zoom instance exists is silently dropped.
  const ready = useStore((state) => !!state.panZoom);
  const placed = useRef<number | null>(null);
  useEffect(() => {
    if (
      !ready ||
      placed.current === topInset ||
      topInset <= 0 ||
      view.width <= 0 ||
      content.width <= 0
    )
      return;
    placed.current = topInset;
    void setViewport(projectViewport(content, view, topInset));
  }, [ready, content, view, topInset, setViewport]);
  return null;
}
