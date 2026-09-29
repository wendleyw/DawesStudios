import {
  projectStatusTone,
  projectStatusLabel,
  type Project,
} from "@/features/workspace/workspace-data";
import type { StatusTone } from "@/features/shared/status-tone";

/**
 * The List view's two groups: everything still moving, then the delivered projects. Order inside a
 * group is the order the caller passes in (the List sort), so grouping never re-sorts.
 */
export type ListGroupKey = "active" | "delivered";

export type ListGroup = { key: ListGroupKey; label: string; projects: Project[] };

export function groupProjects(projects: Project[]): ListGroup[] {
  return [
    {
      key: "active",
      label: "Active",
      projects: projects.filter((project) => project.status !== "delivered"),
    },
    {
      key: "delivered",
      label: "Delivered",
      projects: projects.filter((project) => project.status === "delivered"),
    },
  ];
}

/** A dated, undelivered project whose due day (`YYYY-MM-DD`) is before `todayKey`. */
export function isOverdue(project: Project, todayKey: string): boolean {
  return (
    project.status !== "delivered" && Boolean(project.due_date) && project.due_date! < todayKey
  );
}

export type StatusSegment = { label: string; tone: StatusTone; count: number };

/**
 * One segment per status label the group holds, in first-seen order, for the summary bar. Labels
 * rather than raw statuses, because two statuses can share one public label.
 */
export function statusSegments(projects: Project[]): StatusSegment[] {
  const segments = new Map<string, StatusSegment>();
  for (const project of projects) {
    const label = projectStatusLabel(project);
    const segment = segments.get(label);
    if (segment) segment.count += 1;
    else segments.set(label, { label, tone: projectStatusTone(project), count: 1 });
  }
  return [...segments.values()];
}

/** The earliest and latest due day in the group, or `null` when no project has a date. */
export function dueRange(projects: Project[]): { from: string; to: string } | null {
  const dates = projects
    .map((project) => project.due_date)
    .filter((date): date is string => Boolean(date))
    .sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}
