"use client";

import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import {
  projectStatusTone,
  statusLabels,
  projectStatusLabel,
  useDateFormat,
  type Project,
} from "@/features/workspace/workspace-data";
import { statusToneClass } from "@/features/shared/status-tone";
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

/**
 * The board's List view: PROJECT/CAMPAIGN/STATUS/DUE sortable headers, a compact "Sort by" select
 * for phones, and the project rows themselves. See `list-sort.ts` for the pure sort rules and
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
}: {
  projects: Project[];
  listSort: ListSort;
  onHeaderSort: (key: ListSortKey) => void;
  onSelectSort: (sort: ListSort) => void;
  filtered: boolean;
  hasSearch: boolean;
  onClearFilters: () => void;
  campaignName: (id: string | null) => string;
}) {
  const { formatDate } = useDateFormat();
  const selectId = useId();
  return (
    <div className="board-list project-table">
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
          {LIST_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="table-head">
        {LIST_SORT_COLUMNS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="board-list-sort-button"
            onClick={() => onHeaderSort(key)}
            aria-label={listSortAccessibleName(key, listSort)}
          >
            {label.toUpperCase()}
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
        <span />
      </div>
      {/* The head stays put when nothing matches, so a filtered table still reads as the same
        table rather than as a different screen. */}
      {projects.length === 0 && (
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
      )}
      {projects.map((project: Project) => (
        <Link key={project.id} href={projectHref(project.id)} className="project-row">
          <strong title={project.title}>{project.title}</strong>
          <span>{campaignName(project.campaign_id)}</span>
          <span>
            <span className={statusToneClass(projectStatusTone(project))}>
              {projectStatusLabel(project)}
            </span>
          </span>
          <span>{formatDate(project.due_date, "No due date")}</span>
          <ArrowUpRight size={16} />
        </Link>
      ))}
    </div>
  );
}
