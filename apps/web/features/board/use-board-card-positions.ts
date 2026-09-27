"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Node, NodeChange } from "@xyflow/react";
import type { SupabaseDatabase } from "@/lib/supabase";
import { FRAME_HEAD, FRAME_PAD, dropCard } from "./board-layout";
import { moveProjectPosition } from "./board-data";

/**
 * A card's canvas position: the viewer's optimistic override, the card currently being dragged,
 * and the write that persists a drop. Kept apart from node assembly (`board-canvas-nodes.ts`)
 * because dragging and saving a position have nothing to do with building the node array itself.
 */
export function useBoardCardPositions({
  database,
  invalidateWorkspace,
}: {
  database: SupabaseDatabase;
  invalidateWorkspace: () => void;
}) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  // The card under the pointer and the grid cell it left, so a drop onto another card can swap them.
  const [dragging, setDragging] = useState<{ id: string; origin: { x: number; y: number } } | null>(
    null,
  );
  const moveProject = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: { x: number; y: number } }) =>
      moveProjectPosition(database, { id, position }),
    onSuccess: () => invalidateWorkspace(),
    onError: (_error, variables) =>
      setPositions((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      }),
  });

  /** Applies a batch of xyflow position changes, ignored entirely when nothing moved. */
  function applyPositionChanges(changes: NodeChange<Node>[]) {
    if (!changes.some((change) => change.type === "position" && change.position)) return;
    setPositions((current) => {
      const next = { ...current };
      for (const change of changes)
        if (change.type === "position" && change.position)
          next[change.id] = {
            x: Math.max(FRAME_PAD, change.position.x),
            y: Math.max(FRAME_HEAD + FRAME_PAD, change.position.y),
          };
      return next;
    });
  }

  function startDrag(id: string, origin: { x: number; y: number }) {
    setDragging({ id, origin });
  }

  /** Settles a dropped card on its frame's grid, swapping with a card it lands on, and saves it. */
  function settleCard(dropped: Node, nodes: Node[]) {
    const origin = dragging?.id === dropped.id ? dragging.origin : dropped.position;
    setDragging(null);
    const frame = nodes.find((node) => node.id === dropped.parentId);
    const siblings = nodes.filter((node) => node.parentId === dropped.parentId);
    const moves = dropCard({
      id: dropped.id,
      drop: dropped.position,
      origin,
      frameWidth: frame?.width ?? 0,
      cards: Object.fromEntries(
        siblings.filter((node) => node.type === "project").map((node) => [node.id, node.position]),
      ),
      slot: siblings.find((node) => node.type === "briefingSlot")?.position ?? null,
    });
    setPositions((current) => ({ ...current, ...moves }));
    for (const [id, position] of Object.entries(moves)) moveProject.mutate({ id, position });
  }

  return {
    positions,
    draggingId: dragging?.id ?? null,
    moveError: moveProject.error,
    applyPositionChanges,
    startDrag,
    settleCard,
  };
}
