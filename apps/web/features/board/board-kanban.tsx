"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { openLabel, projectHref, selectOrOpen } from "./project-open";
import { useMemo } from "react";
import { formatDate, statusLabels, type Project } from "@/features/workspace/workspace-data";
import { distinctTitle, sharedTitlePrefix } from "./timeline-model";
import { boardStatuses } from "./planning-view";

/**
 * Groups the same filtered projects by status inside the Planning frame.
 *
 * Cards navigate but do not change status: `status` is absent from the only column grant on
 * public.projects and no RPC accepts an arbitrary target status, so a drag-to-transition control
 * would fail against the database rather than being refused in the interface.
 */
export function BoardKanban({
  projects,
  campaignName,
  selectedId,
  onSelect,
  onOpen,
}: {
  projects: Project[];
  campaignName: (id: string | null) => string;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onOpen: (projectId: string) => void;
}) {
  // Every card here belongs to the workspace the viewer is already in, so the part of the title
  // that all of them repeat is dropped from the card and kept in its accessible name.
  const prefix = useMemo(
    () => sharedTitlePrefix(projects.map((project) => project.title)),
    [projects],
  );
  // The seven stages need more width than the frame has, so the row scrolls sideways. It is a
  // labelled, focusable region for the same reason the calendar's grid is: without a tab stop, a
  // stage that is off-screen can only be reached with a pointer.
  return (
    <div
      className="kanban-board nowheel nopan nodrag"
      tabIndex={0}
      role="group"
      aria-label="Projects by status"
    >
      {boardStatuses.map((column) => {
        const inColumn = projects.filter((project) => project.status === column);
        return (
          <section className="kanban-column" key={column}>
            <div className="kanban-heading">
              <h3>{statusLabels[column]}</h3>
              <span className="count-badge">{inColumn.length}</span>
            </div>
            {inColumn.length ? (
              inColumn.map((project) => (
                <article
                  key={project.id}
                  className={`board-card ${project.id === selectedId ? "selected" : ""}`}
                  aria-current={project.id === selectedId ? "true" : undefined}
                >
                  <div
                    className="board-card-body"
                    {...selectOrOpen({
                      onSelect: () => onSelect(project.id),
                      onOpen: () => onOpen(project.id),
                    })}
                  >
                    <span className="eyebrow">{campaignName(project.campaign_id)}</span>
                    <h4 title={project.title}>{distinctTitle(project.title, prefix)}</h4>
                    <p>{formatDate(project.due_date)}</p>
                    <Link
                      className="board-card-open"
                      href={projectHref(project.id)}
                      aria-label={`${openLabel(project.title)}, ${campaignName(project.campaign_id)}, ${formatDate(project.due_date)}`}
                    >
                      <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <p className="kanban-empty">No projects</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
