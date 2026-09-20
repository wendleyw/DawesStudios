"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDate, statusLabels, type Project } from "@/features/workspace/workspace-data";
import { dateLabel, dateNumber, mondayOf, timelineInterval } from "./timeline-model";
import "./timeline.css";

export function ProjectTimeline({ projects }: { projects: Project[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(() => mondayOf(today));
  const days = Array.from({ length: 14 }, (_, index) => start + index);
  const rows = projects
    .map((project) => ({
      project,
      interval: timelineInterval(project.start_date, project.due_date, start, days.length),
    }))
    .filter((row) => row.interval !== null);
  const unscheduled = projects.filter((project) => !project.start_date && !project.due_date);
  return (
    <section className="project-timeline" aria-label="Project timeline">
      <header>
        <strong>
          {formatDate(dateLabel(start))} — {formatDate(dateLabel(start + 13))}
        </strong>
        <div>
          <button
            className="icon-button"
            aria-label="Previous two weeks"
            onClick={() => setStart(start - 14)}
          >
            <ChevronLeft size={17} />
          </button>
          <button className="button quiet" onClick={() => setStart(mondayOf(today))}>
            Today
          </button>
          <button
            className="icon-button"
            aria-label="Next two weeks"
            onClick={() => setStart(start + 14)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </header>
      <div className="timeline-scroll">
        <div className="timeline-calendar">
          <div className="timeline-day-row">
            {days.map((day) => (
              <span key={day} className={day === dateNumber(today) ? "today" : ""}>
                <small>
                  {new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
                    new Date(dateLabel(day)),
                  )}
                </small>
                {dateLabel(day).slice(-2)}
              </span>
            ))}
          </div>
          {rows.map(({ project, interval }) => (
            <div className="timeline-project-row" key={project.id}>
              <Link
                className={`timeline-project-bar ${project.status}`}
                style={{ gridColumn: `${interval!.left + 1} / span ${interval!.width}` }}
                href={`/projects/${project.id}`}
                title={`${project.title} · ${statusLabels[project.status]} · ${formatDate(project.start_date)} to ${formatDate(project.due_date)}`}
              >
                <strong>{project.title}</strong>
                <span>{statusLabels[project.status]}</span>
              </Link>
            </div>
          ))}
          {!rows.length && (
            <p className="timeline-no-work">No projects scheduled in these two weeks.</p>
          )}
        </div>
      </div>
      {unscheduled.length > 0 && (
        <details className="unscheduled-projects">
          <summary>
            {unscheduled.length} unscheduled project{unscheduled.length === 1 ? "" : "s"}
          </summary>
          {unscheduled.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              {project.title}
            </Link>
          ))}
        </details>
      )}
    </section>
  );
}
