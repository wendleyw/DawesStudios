import {
  statusLabels,
  publicProjectStatuses,
  type Project,
  type ProjectStatus,
} from "@/features/workspace/workspace-data";

/**
 * The List view starts in `filteredProjects` order (`null`, "today's order"). Clicking a header
 * button replaces that with an explicit key and direction; clicking past the column's last state
 * returns to `null`, so every sort can be switched off again.
 */
export type ListSortKey = "project" | "campaign" | "requester" | "status" | "due";
export type SortDirection = "asc" | "desc";
/**
 * Status does not sort in two directions: each click brings the next status to the top (`lead`),
 * with the rest following in workflow order, so every status can be looked at first in turn.
 */
export type ActiveListSort = { key: ListSortKey; direction: SortDirection; lead?: ProjectStatus };
export type ListSort = ActiveListSort | null;

const STATUSES = publicProjectStatuses;

/** Column order and the label both the header buttons and the phone select derive their text from. */
export const LIST_SORT_COLUMNS: readonly { key: ListSortKey; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "campaign", label: "Campaign" },
  { key: "requester", label: "Requested by" },
  { key: "status", label: "Status" },
  { key: "due", label: "Due" },
];

const COLUMN_LABELS: Record<ListSortKey, string> = Object.fromEntries(
  LIST_SORT_COLUMNS.map((column) => [column.key, column.label]),
) as Record<ListSortKey, string>;

/** Workflow order for the Status column: the same key order as `statusLabels`, i.e. the Kanban columns. */
const STATUS_RANK: Record<ProjectStatus, number> = Object.fromEntries(
  STATUSES.map((status, index) => [status, index]),
) as Record<ProjectStatus, number>;

/** The word(s) a header button's accessible name adds once its column is the active sort. */
const HEADER_STATE_LABELS: Record<ListSortKey, Record<SortDirection, string>> = {
  project: { asc: "A to Z", desc: "Z to A" },
  campaign: { asc: "A to Z", desc: "Z to A" },
  requester: { asc: "A to Z", desc: "Z to A" },
  status: { asc: "workflow order", desc: "reverse workflow order" },
  due: { asc: "earliest first", desc: "latest first" },
};

/**
 * First click on a column sorts it ascending, a second reverses it and a third returns to the
 * default order. Status instead steps its lead through the statuses the list holds (`present`, any
 * order) and returns to the default order after the last one.
 */
export function nextListSort(
  current: ListSort,
  key: ListSortKey,
  present: readonly ProjectStatus[] = STATUSES,
): ListSort {
  if (key === "status") {
    const cycle = STATUSES.filter((status) => present.includes(status));
    const order = cycle.length ? cycle : STATUSES;
    const index = current?.key === "status" && current.lead ? order.indexOf(current.lead) : -1;
    return index === order.length - 1 ? null : { key, direction: "asc", lead: order[index + 1] };
  }
  if (current && current.key === key)
    return current.direction === "asc" ? { key, direction: "desc" } : null;
  return { key, direction: "asc" };
}

/** A header button's accessible name: the column alone, or with its active state appended. */
export function listSortAccessibleName(key: ListSortKey, active: ListSort): string {
  const label = COLUMN_LABELS[key];
  if (!active || active.key !== key) return label;
  if (key === "status" && active.lead)
    return `${label}, ${statusLabels[active.lead]} first. Click for the next status`;
  const next = active.direction === "asc" ? "Click to reverse" : "Click for the default order";
  return `${label}, ${HEADER_STATE_LABELS[key][active.direction]}. ${next}`;
}

export type ListSortOption = { value: string; label: string; sort: ListSort };

/** The phone "Sort by" select reads and writes the same state the header buttons do. */
export const LIST_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: "default", label: "Default order", sort: null },
  { value: "project-asc", label: "Project A–Z", sort: { key: "project", direction: "asc" } },
  { value: "project-desc", label: "Project Z–A", sort: { key: "project", direction: "desc" } },
  { value: "campaign-asc", label: "Campaign A–Z", sort: { key: "campaign", direction: "asc" } },
  { value: "campaign-desc", label: "Campaign Z–A", sort: { key: "campaign", direction: "desc" } },
  {
    value: "requester-asc",
    label: "Requested by A–Z",
    sort: { key: "requester", direction: "asc" },
  },
  {
    value: "requester-desc",
    label: "Requested by Z–A",
    sort: { key: "requester", direction: "desc" },
  },
  ...STATUSES.map((status) => ({
    value: `status-${status}`,
    label: `Status: ${statusLabels[status]} first`,
    sort: { key: "status" as const, direction: "asc" as const, lead: status },
  })),
  { value: "due-asc", label: "Due, earliest first", sort: { key: "due", direction: "asc" } },
  { value: "due-desc", label: "Due, latest first", sort: { key: "due", direction: "desc" } },
];

export function listSortOptionValue(sort: ListSort): string {
  if (sort?.key === "status") return `status-${sort.lead ?? STATUSES[0]}`;
  return sort ? `${sort.key}-${sort.direction}` : "default";
}

export function listSortFromOptionValue(value: string): ListSort {
  return LIST_SORT_OPTIONS.find((option) => option.value === value)?.sort ?? null;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareTitle(a: Project, b: Project): number {
  return compareText(a.title, b.title);
}

function applyDirection(value: number, direction: SortDirection): number {
  return direction === "asc" ? value : -value;
}

function comparatorFor(
  sort: ActiveListSort,
  campaignName: (id: string | null) => string,
  requesterOf: (project: Project) => string | null,
): (a: Project, b: Project) => number {
  const { key, direction } = sort;
  switch (key) {
    case "project":
      return (a, b) => applyDirection(compareTitle(a, b), direction);
    case "campaign":
      return (a, b) => {
        const primary = compareText(campaignName(a.campaign_id), campaignName(b.campaign_id));
        return primary !== 0 ? applyDirection(primary, direction) : compareTitle(a, b);
      };
    case "requester":
      // Like Due, projects with no requester to name stay last in both directions.
      return (a, b) => {
        const first = requesterOf(a);
        const second = requesterOf(b);
        if (!first || !second) return first === second ? compareTitle(a, b) : first ? -1 : 1;
        const primary = compareText(first, second);
        return primary !== 0 ? applyDirection(primary, direction) : compareTitle(a, b);
      };
    case "status": {
      // Workflow order rotated so the lead status comes first and the rest follow it, wrapping.
      const lead = STATUS_RANK[sort.lead ?? STATUSES[0]];
      const rank = (status: ProjectStatus) =>
        (STATUS_RANK[status] - lead + STATUSES.length) % STATUSES.length;
      return (a, b) => {
        const primary = rank(a.status) - rank(b.status);
        return primary !== 0 ? applyDirection(primary, direction) : compareTitle(a, b);
      };
    }
    case "due":
      // Missing due dates always sort last, in both directions, so direction never touches this
      // branch — only the tie among two dated (or two undated) projects passes through it.
      return (a, b) => {
        if (!a.due_date || !b.due_date)
          return a.due_date === b.due_date ? compareTitle(a, b) : a.due_date ? -1 : 1;
        const primary = a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
        return primary !== 0 ? applyDirection(primary, direction) : compareTitle(a, b);
      };
  }
}

/**
 * Sorts `projects` by the given key/direction; `null` returns the input order unchanged. Without
 * `requesterOf` (a viewer who does not see requesters) every requester reads as missing.
 */
export function sortProjects(
  projects: Project[],
  sort: ListSort,
  campaignName: (id: string | null) => string,
  requesterOf: (project: Project) => string | null = () => null,
): Project[] {
  if (!sort) return projects;
  return [...projects].sort(comparatorFor(sort, campaignName, requesterOf));
}
