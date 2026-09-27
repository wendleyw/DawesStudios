"use client";

import type { Project } from "@/features/workspace/workspace-data";
import { ProjectTimeline } from "./project-timeline";
import { BoardKanban } from "./board-kanban";
import { timelineScales, type TimelineScale } from "./timeline-model";

/** The board's Timeline and Kanban views, sharing one header and, for Timeline, its scale control. */
export function BoardPlanningPanel({
  mode,
  projects,
  campaignName,
  campaignOrder,
  period,
  onPeriod,
  scale,
  onScale,
  selectedId,
  onSelect,
  onOpen,
}: {
  mode: "timeline" | "kanban";
  projects: Project[];
  campaignName: (id: string | null) => string;
  campaignOrder: string[];
  period: number;
  onPeriod: (period: number) => void;
  scale: TimelineScale;
  onScale: (scale: TimelineScale) => void;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onOpen: (projectId: string) => void;
}) {
  return (
    <section
      className="board-planning-view"
      aria-label={`${mode === "timeline" ? "Timeline" : "Kanban"} view`}
    >
      <header className="board-planning-head">
        <h2>{mode === "timeline" ? "Timeline" : "Kanban"}</h2>
        {mode === "timeline" && (
          <div className="segmented-control" role="group" aria-label="Timeline scale">
            {timelineScales.map((item) => (
              <button
                key={item.id}
                aria-pressed={item.id === scale}
                onClick={() => onScale(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>
      {mode === "timeline" ? (
        <ProjectTimeline
          projects={projects}
          campaignName={campaignName}
          campaignOrder={campaignOrder}
          start={period}
          onStart={onPeriod}
          scale={scale}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ) : (
        <BoardKanban
          projects={projects}
          campaignName={campaignName}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      )}
    </section>
  );
}
