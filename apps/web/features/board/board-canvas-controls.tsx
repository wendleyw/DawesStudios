"use client";

import { useReactFlow, useStore } from "@xyflow/react";
import { CornerUpLeft } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { CanvasControls } from "@/features/shared/canvas-controls";
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
  portalTarget,
}: {
  content: { width: number; height: number };
  view: { width: number; height: number };
  /** Identifies the board and its measured viewport size; content edits do not change this key. */
  fitKey: string;
  portalTarget: HTMLElement | null;
}) {
  const { setViewport } = useReactFlow();
  const canvas = useStore((state) => state.domNode);
  const fit = useCallback(
    (duration = 0) => {
      if (content.width <= 0 || view.width <= 0) return;
      // Keep the opening content below the floating identity/profile cards and beside the tool
      // dock, while the grid stays full bleed.
      const style = canvas ? getComputedStyle(canvas) : null;
      const inset = (name: string, fallback: number) => {
        const value = Number.parseFloat(style?.getPropertyValue(name) ?? "");
        return Number.isFinite(value) ? value : fallback;
      };
      const topInset = inset("--board-header-space", 88) || 88;
      const leftInset = inset("--board-rail-space", 0);
      void setViewport(boardFit(content, view, topInset, leftInset), { duration });
    },
    [content, view, canvas, setViewport],
  );
  // Entering a board — or returning to one — shows all of it. Refitting on every geometry change
  // would fight the viewer, so only board entry, viewport resizing or an explicit request refits.
  // The pan/zoom instance is created in its own effect, and setting a viewport before it exists is
  // silently dropped — which left a board wider than the canvas opening clipped at the far left.
  const ready = useStore((state) => !!state.panZoom);
  const fitted = useRef("");
  useEffect(() => {
    if (!ready || !fitKey || fitted.current === fitKey || content.width <= 0 || view.width <= 0)
      return;
    fitted.current = fitKey;
    fit();
  }, [ready, fitKey, content.width, view.width, fit]);
  return (
    <CanvasControls
      onFit={fit}
      fitLabel="Fit board to view"
      fitIcon={<CornerUpLeft size={16} />}
      portalTarget={portalTarget}
    />
  );
}
