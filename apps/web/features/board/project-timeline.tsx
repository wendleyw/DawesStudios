"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { openLabel, projectHref, selectOrOpen } from "./project-open";
import { ProjectRequester, type RequesterOf } from "./project-requester";
import { useMemo, type CSSProperties } from "react";
import { projectStatusLabel, type Project } from "@/features/workspace/workspace-data";
import {
  timelineColumns,
  timelineScaleSpan,
  timelineScaleSpec,
  scaleInterval,
  scalePeriodLabel,
  scalePointer,
  type TimelinePointer,
  type TimelineScale,
  dateNumber,
  distinctTitle,
  mondayOf,
  scheduleLabel,
  sharedTitlePrefix,
  shortDate,
} from "./timeline-model";
import "./timeline.css";

/** Below this span a bar is too narrow for its status to read, so it carries only the dot. */
/** Columns, not days: below this a bar has no room for a word, whatever the scale. */
const LABELLED_BAR_COLUMNS = 2;

/** The word a pointer button leads with, keyed by what its date actually is. */
const POINTER_VERB: Record<TimelinePointer["kind"], string> = {
  due: "Due",
  started: "Started",
  starts: "Starts",
};

/**
 * Project schedules at Fortnight, Month and Quarter scales with a fixed identity column.
 * Every in-scope project keeps a lane. Work that overlaps the window draws a bar; work whose dates
 * fall entirely before or after it shows a quiet button pointing at where it is instead, naming the
 * nearest known date and jumping the window to it on click. Work with no dates at all stays plain
 * text. The sticky header keeps period navigation available while the work area scrolls.
 */
export function ProjectTimeline({
  projects,
  campaignName,
  campaignOrder,
  requesterOf,
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
  requesterOf?: RequesterOf;
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
      pointer: scalePointer(project.start_date, project.due_date, start, scale),
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
            rows.map(({ project, label, interval, pointer }) => (
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
                  {requesterOf?.(project) && (
                    <ProjectRequester name={requesterOf(project)!} compact />
                  )}
                  <Link
                    className="timeline-open"
                    href={projectHref(project.id)}
                    aria-label={`${openLabel(project.title)}, ${projectStatusLabel(project)}, ${scheduleLabel(project.start_date, project.due_date)}`}
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
                    title={`${project.title} — ${projectStatusLabel(project)} — ${scheduleLabel(project.start_date, project.due_date)}`}
                  >
                    <span className="timeline-status-dot" aria-hidden="true" />
                    {/* The lane already carries the title, so the bar spends its width on the one
                        thing the grid cannot show: where the work has got to. */}
                    {interval.width >= LABELLED_BAR_COLUMNS && (
                      <span className="timeline-bar-status">{projectStatusLabel(project)}</span>
                    )}
                  </span>
                ) : pointer ? (
                  <button
                    type="button"
                    className="timeline-pointer"
                    onClick={() => onStart(pointer.jumpTo)}
                    onDoubleClick={(event) => {
                      // A double click here must jump, not open: stop it reaching the lane's own
                      // double-click handler, which is what opens the project.
                      event.stopPropagation();
                    }}
                    aria-label={`Show ${project.title}: ${POINTER_VERB[pointer.kind].toLowerCase()} ${shortDate(pointer.date)}`}
                  >
                    {pointer.direction === "before" && <ArrowLeft size={13} aria-hidden="true" />}
                    {POINTER_VERB[pointer.kind]} {shortDate(pointer.date)}
                    {pointer.direction === "after" && <ArrowRight size={13} aria-hidden="true" />}
                  </button>
                ) : (
                  <span className="timeline-unscheduled">No dates set</span>
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
