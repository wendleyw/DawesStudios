"use client";
import type { Client } from "@/features/workspace/workspace-data";
import type { Profile } from "@/lib/supabase";
import { CanvasHeader } from "@/features/workspace/canvas-header";
import { BoardPeriodPicker } from "./board-period-picker";

export function BoardHeader({
  client,
  viewer,
  period,
  years,
  onPeriod,
}: {
  client: Client;
  viewer: Profile | null;
  period: string;
  years: number[];
  onPeriod: (period: string) => void;
}) {
  return (
    <CanvasHeader
      client={client}
      viewer={viewer}
      heading
      context={
        <>
          <span className="board-header-divider" aria-hidden="true" />
          <BoardPeriodPicker value={period} years={years} onChange={onPeriod} />
        </>
      }
    />
  );
}
