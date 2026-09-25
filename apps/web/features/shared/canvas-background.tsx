"use client";

import { Background, BackgroundVariant } from "@xyflow/react";
import { useId } from "react";

/** The shared dot grid: 24-unit spacing that follows pan and zoom, coloured by the theme tokens. */
export function CanvasBackground() {
  const id = useId();
  return (
    <Background
      id={id}
      variant={BackgroundVariant.Dots}
      gap={24}
      size={1.5}
      color="var(--canvas-grid)"
      bgColor="var(--canvas-background)"
    />
  );
}
