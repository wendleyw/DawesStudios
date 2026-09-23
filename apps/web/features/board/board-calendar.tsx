"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import {
  projectStatusTones,
  statusLabels,
  useDateFormat,
  type Project,
} from "@/features/workspace/workspace-data";
import { statusToneClass } from "@/features/shared/status-tone";
import { calendarDays, calendarMonthLabel, monthStart, shiftMonth } from "./calendar-model";
import { distinctTitle, longDate, sharedTitlePrefix } from "./timeline-model";
import { openLabel, projectHref, selectOrOpen } from "./project-open";

export function BoardCalendar({
  projects,
  campaignName,
  month,
  onMonth,
  selectedId,
  onSelect,
  onOpen,
}: {
  projects: Project[];
  campaignName: (id: string | null) => string;
  month: string;
  onMonth: (month: string) => void;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onOpen: (projectId: string) => void;
}) {
  const { formatDate } = useDateFormat();
  const today = new Date().toISOString().slice(0, 10);
  const days = calendarDays(month);
  const grouped = useMemo(() => {
    const dates = new Map<string, Project[]>();
    for (const project of [...projects].sort((a, b) => a.title.localeCompare(b.title))) {
      const date = project.due_date?.slice(0, 10) ?? "undated";
      dates.set(date, [...(dates.get(date) ?? []), project]);
    }
    return dates;
  }, [projects]);
  const prefix = sharedTitlePrefix(projects.map((project) => project.title));
  const datedDays = days.filter((day) => day.inMonth && grouped.has(day.date));
  const undated = grouped.get("undated") ?? [];

  function projectCard(project: Project) {
    return (
      <article
        key={project.id}
        className={`board-calendar-project ${project.id === selectedId ? "selected" : ""}`}
        aria-current={project.id === selectedId ? "true" : undefined}
        title={`${project.title} — ${statusLabels[project.status]} — ${campaignName(project.campaign_id)}`}
        {...selectOrOpen({
          onSelect: () => onSelect(project.id),
          onOpen: () => onOpen(project.id),
        })}
      >
        <strong title={project.title}>{distinctTitle(project.title, prefix)}</strong>
        <span className="board-calendar-campaign">{campaignName(project.campaign_id)}</span>
        <span className={statusToneClass(projectStatusTones[project.status])}>
          {statusLabels[project.status]}
        </span>
        <Link
          className="board-calendar-open"
          href={projectHref(project.id)}
          aria-label={`${openLabel(project.title)}, ${statusLabels[project.status]}, ${formatDate(project.due_date, "No due date")}`}
        >
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </article>
    );
  }

  return (
    <section className="board-calendar" aria-label="Project calendar">
      <header className="board-calendar-head">
        <div>
          <h2 aria-live="polite">{calendarMonthLabel(month)}</h2>
          <p>Project due dates</p>
        </div>
        <div className="board-calendar-nav" role="group" aria-label="Calendar month">
          <button
            className="icon-button"
            aria-label="Previous month"
            onClick={() => onMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <button className="button quiet" onClick={() => onMonth(monthStart(today))}>
            Today
          </button>
          <button
            className="icon-button"
            aria-label="Next month"
            onClick={() => onMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </header>
      {!datedDays.length && (
        <p className="board-calendar-empty">No project due dates this month.</p>
      )}
      <div
        className="board-calendar-grid"
        style={{ "--calendar-weeks": days.length / 7 } as CSSProperties}
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span className="board-calendar-weekday" key={day}>
            {day}
          </span>
        ))}
        {days.map((day) => (
          <section
            key={day.date}
            aria-label={longDate(day.date)}
            className={`board-calendar-day ${day.inMonth ? "" : "outside-month"}`}
          >
            <time dateTime={day.date} aria-current={day.date === today ? "date" : undefined}>
              {Number(day.date.slice(8, 10))}
            </time>
            <div className="board-calendar-events">
              {day.inMonth && grouped.get(day.date)?.map(projectCard)}
            </div>
          </section>
        ))}
      </div>
      <div className="board-calendar-agenda">
        {datedDays.map((day) => (
          <section key={day.date} aria-label={longDate(day.date)}>
            <h3>
              <time dateTime={day.date}>{formatDate(day.date)}</time>
            </h3>
            {grouped.get(day.date)!.map(projectCard)}
          </section>
        ))}
      </div>
      {undated.length > 0 && (
        <section className="board-calendar-undated" aria-label="Projects without due dates">
          <h3>
            No due date <span className="count-badge">{undated.length}</span>
          </h3>
          <div>{undated.map(projectCard)}</div>
        </section>
      )}
    </section>
  );
}
