"use client";

import { ControlButton, Controls, useReactFlow, useStore } from "@xyflow/react";
import { CornerUpLeft } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { boardFit } from "./board-layout";

/**
 * The built-in Fit View is dropped: on a tall document-like stack, fitting everything on screen
 * always lands at an unreadable scale — the defect recorded in the frontend review. `onFitView` is
 * only a notification (xyflow runs its own fitView first), so the button is replaced by a fit
 * computed from the frame geometry, which does not depend on xyflow having finished rendering.
 */
export function BoardCanvasControls({
  content,
  view,
  fitKey,
}: {
  content: { width: number; height: number };
  view: { width: number; height: number };
  /** Changes whenever the board being shown changes, which is when the view is fitted again. */
  fitKey: string;
}) {
  const { setViewport } = useReactFlow();
  const fit = useCallback(
    (animate: boolean) => {
      if (content.width <= 0 || view.width <= 0) return;
      void setViewport(boardFit(content, view), animate ? { duration: 200 } : undefined);
    },
    [content.width, content.height, view.width, view.height, setViewport],
  );
  // Entering a board — or returning to one — shows all of it. Refitting on every geometry change
  // would fight the viewer, so this runs once per board and then only on request.
  // The pan/zoom instance is created in its own effect, and setting a viewport before it exists is
  // silently dropped — which left a board wider than the canvas opening clipped at the far left.
  const ready = useStore((state) => !!state.panZoom);
  const fitted = useRef("");
  useEffect(() => {
    if (!ready || !fitKey || fitted.current === fitKey || content.width <= 0 || view.width <= 0)
      return;
    fitted.current = fitKey;
    fit(false);
  }, [ready, fitKey, content.width, view.width, fit]);
  return (
    <Controls showInteractive={false} showFitView={false}>
      <ControlButton
        onClick={() => fit(true)}
        title="Fit board to view"
        aria-label="Fit board to view"
      >
        <CornerUpLeft size={13} />
      </ControlButton>
    </Controls>
  );
}
