"use client";

import { Background, BackgroundVariant } from "@xyflow/react";
import { useId } from "react";

export function CanvasBackground() {
  const id = useId();
  return (
    <Background
      id={id}
      variant={BackgroundVariant.Lines}
      gap={24}
      lineWidth={0.75}
      color="var(--canvas-grid)"
      bgColor="var(--canvas-background)"
    />
  );
}
