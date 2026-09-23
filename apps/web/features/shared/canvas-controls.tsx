"use client";

import { ControlButton, Controls, useReactFlow, useStore } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const motionDuration = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;

export function CanvasControls({
  onFit,
  fitLabel = "Fit View",
  fitIcon = <Maximize size={13} />,
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
  const controls = (
    <Controls
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      className={portalTarget ? "canvas-controls-docked" : undefined}
      style={portalTarget ? { position: "static", margin: 0 } : undefined}
    >
      <ControlButton
        className="react-flow__controls-zoomin"
        title="Zoom In"
        aria-label="Zoom In"
        disabled={maxZoomReached}
        onClick={() => void zoomIn({ duration: motionDuration() })}
      >
        <Plus size={13} />
      </ControlButton>
      <ControlButton
        className="react-flow__controls-zoomout"
        title="Zoom Out"
        aria-label="Zoom Out"
        disabled={minZoomReached}
        onClick={() => void zoomOut({ duration: motionDuration() })}
      >
        <Minus size={13} />
      </ControlButton>
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
