"use client";

import { getViewportForBounds, useReactFlow, useStore } from "@xyflow/react";
import { useEffect } from "react";

/** Reframe only when the usable canvas or selection changes, never for content edits. */
export function PlaygroundViewport({ selectedId }: { selectedId: string | null }) {
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const ready = useStore((state) => !!state.panZoom);
  const nodeCount = useStore((state) => state.nodes.length);
  const { getNodes, getNode, getNodesBounds, getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    if (!ready || width <= 0 || height <= 0 || nodeCount === 0) return;
    const node = selectedId ? getNode(selectedId) : undefined;
    const viewport = getViewport();
    if (node) {
      const left = node.position.x * viewport.zoom + viewport.x;
      const top = node.position.y * viewport.zoom + viewport.y;
      const right = left + (node.measured?.width ?? node.width ?? 0) * viewport.zoom;
      const bottom = top + (node.measured?.height ?? node.height ?? 0) * viewport.zoom;
      // Opening an inspector must not move an already visible item under the drag pointer.
      if (left >= 12 && top >= 12 && right <= width - 12 && bottom <= height - 12) return;
    }
    const bounds = getNodesBounds(node ? [node] : getNodes().filter((item) => !item.hidden));
    if (bounds.width <= 0 || bounds.height <= 0) return;
    // Controlled items already have explicit dimensions. Recreating them drops xyflow's
    // measured flag, so waiting for useNodesInitialized can block a resize indefinitely.
    void setViewport(
      getViewportForBounds(bounds, width, height, 0.15, Math.min(viewport.zoom, 1), 0.15),
      { duration: 0 },
    );
  }, [
    ready,
    width,
    height,
    nodeCount,
    selectedId,
    getNodes,
    getNode,
    getNodesBounds,
    getViewport,
    setViewport,
  ]);

  return null;
}
