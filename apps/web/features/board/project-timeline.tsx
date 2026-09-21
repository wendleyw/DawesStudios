"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { openLabel, projectHref, selectOrOpen } from "./project-open";
import { useMemo, type CSSProperties } from "react";
import { statusLabels, type Project } from "@/features/workspace/workspace-data";
import {
  timelineColumns,
  timelineScaleSpan,
  timelineScaleSpec,
  scaleInterval,
  scalePeriodLabel,
  type TimelineScale,
  dateNumber,
  distinctTitle,
  mondayOf,
  scheduleLabel,
  sharedTitlePrefix,
} from "./timeline-model";
import "./timeline.css";

/** Below this span a bar is too narrow for its status to read, so it carries only the dot. */
/** Columns, not days: below this a bar has no room for a word, whatever the scale. */
const LABELLED_BAR_COLUMNS = 2;

/**
 * A fortnight of project bars with a fixed identity column.
 *
 * Every in-scope project keeps a lane whether or not it has a bar in this window, so paging through
 * the calendar shows what is *not* scheduled rather than silently dropping the row. The period
 * control sits in the calendar's own corner instead of on a row above it: Planning shares the
 * canvas with the campaign column, so a row of chrome costs a lane of work.
 */
export function ProjectTimeline({
  projects,
  campaignName,
  campaignOrder,
  start,
  onStart,
  scale,
  selectedId,
  onSelect,
  onOpen,
}: {
  projects: Project[];
  campaignName: (id: string | null) => string;
  campaignOrder: string[];
  start: number;
  onStart: (start: number) => void;
  scale: TimelineScale;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onOpen: (projectId: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const columns = useMemo(
    () => timelineColumns(start, scale, dateNumber(today)),
    [start, scale, today],
  );
  const rows = useMemo(() => {
    const rank = new Map(campaignOrder.map((id, index) => [id, index]));
    const ordered = [...projects].sort((a, b) => {
      const byCampaign =
        (rank.get(a.campaign_id ?? "") ?? campaignOrder.length) -
        (rank.get(b.campaign_id ?? "") ?? campaignOrder.length);
      return byCampaign || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
    });
    const prefix = sharedTitlePrefix(ordered.map((project) => project.title));
    return ordered.map((project) => ({
      project,
      label: distinctTitle(project.title, prefix),
      interval: scaleInterval(project.start_date, project.due_date, start, scale),
    }));
  }, [projects, campaignOrder, start, scale]);
  const period = scalePeriodLabel(start, scale);
  const span = timelineScaleSpan(scale);

  return (
    <section className="project-timeline" aria-label="Project timeline">
      <div
        className="timeline-scroll nowheel nopan"
        tabIndex={0}
        role="group"
        aria-label="Schedule grid"
      >
        <div
          className="timeline-calendar"
          style={{ "--timeline-columns": columns.length } as CSSProperties}
        >
          {/* The head row stays put while the lanes scroll under it, so the period control and the
              weekday it belongs to are never scrolled out of the frame. */}
          <div className="timeline-lane timeline-lane-head">
            <header className="timeline-label timeline-period">
              <strong>{period}</strong>
              <div className="timeline-period-nav">
                <button
                  className="icon-button"
                  aria-label={`Previous ${timelineScaleSpec(scale).label.toLowerCase()}`}
                  onClick={() => onStart(start - span)}
                >
                  <ChevronLeft size={15} />
                </button>
                <button className="button quiet" onClick={() => onStart(mondayOf(today))}>
                  Today
                </button>
                <button
                  className="icon-button"
                  aria-label={`Next ${timelineScaleSpec(scale).label.toLowerCase()}`}
                  onClick={() => onStart(start + span)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </header>
            {columns.map((day) => (
              <span
                key={day.day}
                className={`timeline-day ${day.today ? "today" : ""} ${day.weekend ? "weekend" : ""}`}
              >
                <small>{day.caption}</small>
                {day.heading}
              </span>
            ))}
          </div>
          {rows.length ? (
            rows.map(({ project, label, interval }) => (
              <div
                className={`timeline-lane ${project.id === selectedId ? "selected" : ""}`}
                key={project.id}
                aria-current={project.id === selectedId ? "true" : undefined}
                {...selectOrOpen({
                  onSelect: () => onSelect(project.id),
                  onOpen: () => onOpen(project.id),
                })}
              >
                <div className="timeline-label">
                  {/* The lane is named by what tells it apart; the full title stays the accessible
                      name and the hover title. One link per lane carries the whole description the
                      bar used to repeat, so a screen reader hears the row once rather than twice. */}
                  <strong title={project.title}>{label}</strong>
                  <span>{campaignName(project.campaign_id)}</span>
                  <Link
                    className="timeline-open"
                    href={projectHref(project.id)}
                    aria-label={`${openLabel(project.title)}, ${statusLabels[project.status]}, ${scheduleLabel(project.start_date, project.due_date)}`}
                  >
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </div>
                {columns.map((day) => (
                  <span
                    key={day.day}
                    className={`timeline-cell ${day.today ? "today" : ""} ${day.weekend ? "weekend" : ""}`}
                  />
                ))}
                {/* The bar is the lane drawn on the grid, not a second control: the lane's own
                    link already names this project, so a duplicate would be read twice. */}
                {interval ? (
                  <span
                    className={`timeline-project-bar ${project.status} ${interval.clippedStart ? "clipped-start" : ""} ${interval.clippedEnd ? "clipped-end" : ""}`}
                    style={{ gridColumn: `${interval.left + 2} / span ${interval.width}` }}
                    title={`${project.title} — ${statusLabels[project.status]} — ${scheduleLabel(project.start_date, project.due_date)}`}
                  >
                    <span className="timeline-status-dot" aria-hidden="true" />
                    {/* The lane already carries the title, so the bar spends its width on the one
                        thing the grid cannot show: where the work has got to. */}
                    {interval.width >= LABELLED_BAR_COLUMNS && (
                      <span className="timeline-bar-status">{statusLabels[project.status]}</span>
                    )}
                  </span>
                ) : (
                  <span className="timeline-unscheduled">
                    {project.start_date || project.due_date
                      ? "Outside this window"
                      : "No dates set"}
                  </span>
                )}
              </div>
            ))
          ) : (
            <p className="timeline-no-work">No projects in scope.</p>
          )}
        </div>
      </div>
    </section>
  );
}
