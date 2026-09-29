"use client";

import { AlertCircle, ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import {
  projectStatusTone,
  statusLabels,
  projectStatusLabel,
  useDateFormat,
  type Project,
} from "@/features/workspace/workspace-data";
import {
  dueRange,
  groupProjects,
  isOverdue,
  statusSegments,
  type ListGroupKey,
} from "./list-groups";
import {
  LIST_SORT_COLUMNS,
  LIST_SORT_OPTIONS,
  listSortAccessibleName,
  listSortFromOptionValue,
  listSortOptionValue,
  type ListSort,
  type ListSortKey,
} from "./list-sort";
import { projectHref } from "./project-open";
import { ProjectRequester, type RequesterOf } from "./project-requester";

/**
 * The board's List view: an Active and a Delivered group, each a collapsible table with
 * PROJECT/CAMPAIGN/STATUS/DUE sortable headers, full-colour status cells and a summary row (status
 * mix and due range); a compact "Sort by" select stands in for the headers on phones. See `list-sort.ts` for the pure sort rules and
 * `README.md` for the sorting contract this renders.
 */
export function BoardListView({
  projects,
  listSort,
  onHeaderSort,
  onSelectSort,
  filtered,
  hasSearch,
  onClearFilters,
  campaignName,
  collapsedGroups,
  onToggleGroup,
  requesterOf,
}: {
  projects: Project[];
  listSort: ListSort;
  onHeaderSort: (key: ListSortKey) => void;
  onSelectSort: (sort: ListSort) => void;
  filtered: boolean;
  hasSearch: boolean;
  onClearFilters: () => void;
  campaignName: (id: string | null) => string;
  collapsedGroups: ReadonlySet<ListGroupKey>;
  onToggleGroup: (key: ListGroupKey) => void;
  /** Absent for viewers who do not see requesters; the column and its sort options go with it. */
  requesterOf?: RequesterOf;
}) {
  const { formatDate, formatDayKey } = useDateFormat();
  const selectId = useId();
  const todayKey = formatDayKey(new Date().toISOString());
  const columns = requesterOf
    ? LIST_SORT_COLUMNS
    : LIST_SORT_COLUMNS.filter((column) => column.key !== "requester");
  const sortOptions = requesterOf
    ? LIST_SORT_OPTIONS
    : LIST_SORT_OPTIONS.filter((option) => option.sort?.key !== "requester");
  return (
    <div className={`board-list${requesterOf ? " has-requester" : ""}`}>
      {/* Phones hide `.table-head` below (globals.css); this compact control keeps sorting
        reachable there, reading and writing the same `listSort` state as the header buttons. */}
      <div className="board-list-sort-mobile">
        <label htmlFor={selectId} className="visually-hidden">
          Sort by
        </label>
        <select
          id={selectId}
          value={listSortOptionValue(listSort)}
          onChange={(event) => onSelectSort(listSortFromOptionValue(event.target.value))}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {/* When nothing matches, one empty state replaces both groups. */}
      {projects.length === 0 ? (
        <div className="project-table">
          <ListHead columns={columns} listSort={listSort} onHeaderSort={onHeaderSort} />
          <div className="empty-state board-list-empty">
            <h2>{filtered ? "No projects match." : "A fresh space for your next idea."}</h2>
            <p>
              {filtered
                ? hasSearch
                  ? "Try a different search or clear your filters."
                  : "Try a different filter or clear your filters."
                : "Start with a briefing. We’ll take it from there."}
            </p>
            {filtered && (
              <button className="button" onClick={onClearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      ) : (
        groupProjects(projects).map((group) => {
          const open = !collapsedGroups.has(group.key);
          const bodyId = `${selectId}-${group.key}`;
          const range = dueRange(group.projects);
          const segments = statusSegments(group.projects);
          return (
            <section key={group.key} className={`board-list-group group-${group.key}`}>
              <button
                type="button"
                className="board-list-group-toggle"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => onToggleGroup(group.key)}
              >
                <ChevronDown size={18} aria-hidden="true" />
                <h2>{group.label}</h2>
                <span className="board-list-group-count">
                  {group.projects.length} {group.projects.length === 1 ? "project" : "projects"}
                </span>
              </button>
              {open && (
                <div id={bodyId} className="project-table board-list-table">
                  <ListHead columns={columns} listSort={listSort} onHeaderSort={onHeaderSort} />
                  {group.projects.length === 0 && (
                    <p className="board-list-group-empty">
                      No {group.label.toLowerCase()} projects.
                    </p>
                  )}
                  {group.projects.map((project) => {
                    const overdue = isOverdue(project, todayKey);
                    const delivered = project.status === "delivered" && Boolean(project.due_date);
                    return (
                      <Link key={project.id} href={projectHref(project.id)} className="project-row">
                        <strong className="list-col-project" title={project.title}>
                          {project.title}
                        </strong>
                        <span className="list-col-campaign">
                          {campaignName(project.campaign_id)}
                        </span>
                        {requesterOf && (
                          <span className="list-col-requester">
                            {requesterName(project, requesterOf)}
                          </span>
                        )}
                        <span
                          className={`list-col-status board-list-status tone-${projectStatusTone(project)}`}
                        >
                          {projectStatusLabel(project)}
                        </span>
                        <span
                          className={`list-col-due board-list-due${overdue ? " is-overdue" : ""}${delivered ? " is-done" : ""}`}
                        >
                          {overdue && <AlertCircle size={15} aria-label="Overdue" />}
                          {delivered && <Check size={15} aria-label="Delivered" />}
                          <span>{formatDate(project.due_date, "No due date")}</span>
                        </span>
                        <ArrowUpRight className="list-col-open" size={16} />
                      </Link>
                    );
                  })}
                  {group.projects.length > 0 && (
                    <div className="project-row board-list-summary">
                      <span className="list-col-project" />
                      <span className="list-col-campaign" />
                      {requesterOf && <span className="list-col-requester" />}
                      <span
                        className="list-col-status board-list-mix"
                        role="img"
                        aria-label={segments.map((s) => `${s.count} ${s.label}`).join(", ")}
                      >
                        {segments.map((segment) => (
                          <span
                            key={segment.label}
                            className={`tone-${segment.tone}`}
                            style={{ flexGrow: segment.count }}
                            title={`${segment.count} ${segment.label}`}
                          />
                        ))}
                      </span>
                      <span className="list-col-due">
                        {range && (
                          <span className="board-list-range">
                            {range.from === range.to
                              ? formatDate(range.from)
                              : `${formatDate(range.from)} – ${formatDate(range.to)}`}
                          </span>
                        )}
                      </span>
                      <span className="list-col-open" />
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

/** The sortable header row, repeated at the top of each group's table. */
function ListHead({
  columns,
  listSort,
  onHeaderSort,
}: {
  columns: typeof LIST_SORT_COLUMNS;
  listSort: ListSort;
  onHeaderSort: (key: ListSortKey) => void;
}) {
  return (
    <div className="table-head">
      {columns.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`board-list-sort-button list-col-${key}`}
          onClick={() => onHeaderSort(key)}
          aria-label={listSortAccessibleName(key, listSort)}
        >
          {label}
          {listSort?.key === key && listSort.lead ? (
            <span className="board-list-sort-lead" aria-hidden="true">
              {statusLabels[listSort.lead]}
            </span>
          ) : (
            listSort?.key === key &&
            (listSort.direction === "asc" ? (
              <ArrowUp size={14} aria-hidden="true" />
            ) : (
              <ArrowDown size={14} aria-hidden="true" />
            ))
          )}
        </button>
      ))}
      <span className="list-col-open" />
    </div>
  );
}

/** The requester cell: avatar and name, or a dash when the project has nobody to name. */
function requesterName(project: Project, requesterOf: RequesterOf) {
  const name = requesterOf(project);
  return name ? <ProjectRequester name={name} /> : <span aria-label="No requester">—</span>;
}
