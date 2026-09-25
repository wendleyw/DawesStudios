"use client";

import { ControlButton, Controls, useReactFlow, useStore } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const motionDuration = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;

/**
 * The zoom pill every canvas shares: zoom out, the live zoom level, zoom in and fit, in one
 * horizontal card at the bottom left. Its look lives in `app/globals.css` (`.canvas-zoom`).
 */
export function CanvasControls({
  onFit,
  fitLabel = "Fit View",
  fitIcon = <Maximize size={16} />,
  portalTarget,
}: {
  onFit?: (duration: number) => void;
  fitLabel?: string;
  fitIcon?: ReactNode;
  /** A dock outside the canvas can host the controls while retaining the xyflow context. */
  portalTarget?: HTMLElement | null;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoomReached = useStore((state) => state.transform[2] <= state.minZoom);
  const maxZoomReached = useStore((state) => state.transform[2] >= state.maxZoom);
  const zoomLevel = useStore((state) => Math.round(state.transform[2] * 100));
  const controls = (
    <Controls
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      orientation="horizontal"
      position="bottom-left"
      className={portalTarget ? "canvas-zoom canvas-controls-docked" : "canvas-zoom"}
      style={portalTarget ? { position: "static", margin: 0 } : undefined}
    >
      <ControlButton
        className="react-flow__controls-zoomout"
        title="Zoom Out"
        aria-label="Zoom Out"
        disabled={minZoomReached}
        onClick={() => void zoomOut({ duration: motionDuration() })}
      >
        <Minus size={16} />
      </ControlButton>
      <span className="canvas-zoom-level">
        <span className="visually-hidden">Zoom </span>
        {zoomLevel}%
      </span>
      <ControlButton
        className="react-flow__controls-zoomin"
        title="Zoom In"
        aria-label="Zoom In"
        disabled={maxZoomReached}
        onClick={() => void zoomIn({ duration: motionDuration() })}
      >
        <Plus size={16} />
      </ControlButton>
      <span className="canvas-zoom-divider" aria-hidden="true" />
      <ControlButton
        className="react-flow__controls-fitview"
        title={fitLabel}
        aria-label={fitLabel}
        onClick={() => {
          const duration = motionDuration();
          if (onFit) onFit(duration);
          else void fitView({ duration });
        }}
      >
        {fitIcon}
      </ControlButton>
    </Controls>
  );
  if (portalTarget === null) return null;
  return portalTarget ? createPortal(controls, portalTarget) : controls;
}
