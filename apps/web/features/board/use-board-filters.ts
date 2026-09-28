"use client";

import { useCallback, useMemo, useState } from "react";
import type { Project } from "@/features/workspace/workspace-data";
import { monthStart } from "./calendar-model";
import { periodStart, projectInPeriod } from "./board-period";
import { mondayOf, type TimelineScale } from "./timeline-model";

/**
 * Board search/campaign/status/period filters, the calendar month and timeline period they can
 * open, and the timeline scale — kept together because choosing a quarter drives all three
 * (`choosePeriod`), even though `clearFilters` only ever resets the filters themselves.
 */
export function useBoardFilters(projects: Project[]) {
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState("");
  const [activity, setActivity] = useState("active");
  const [quarter, setQuarter] = useState("");
  // Each planning view keeps its period while the viewer switches views.
  const [month, setMonth] = useState(() => monthStart(new Date().toISOString().slice(0, 10)));
  const [period, setPeriod] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));
  // Null means the viewer has not chosen, so the board follows the work. Deriving this rather than
  // syncing state to it in an effect keeps the opening scale correct on the very first render.
  const [chosenScale, setChosenScale] = useState<TimelineScale | null>(null);

  const currentYear = new Date().getUTCFullYear();
  const periodYears = [
    ...new Set([
      currentYear - 1,
      currentYear,
      currentYear + 1,
      ...projects.flatMap((project) =>
        [project.start_date, project.due_date]
          .filter((date): date is string => !!date)
          .map((date) => Number(date.slice(0, 4))),
      ),
    ]),
  ].sort((a, b) => a - b);

  function choosePeriod(value: string) {
    setQuarter(value);
    const start = periodStart(value);
    if (start) {
      setMonth(start);
      setPeriod(mondayOf(start));
      setChosenScale("quarter");
    }
  }

  const filtered = Boolean(search || campaign || status || quarter || activity !== "active");
  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          (!search ||
            `${project.title} ${project.description}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!campaign || project.campaign_id === campaign) &&
          (!status || project.status === status) &&
          (!activity || (project.activity ?? "active") === activity) &&
          projectInPeriod(project, quarter),
      ),
    [projects, search, campaign, status, quarter, activity],
  );

  const clearFilters = useCallback(() => {
    setCampaign("");
    setStatus("");
    setActivity("active");
    setSearch("");
    setQuarter("");
  }, []);

  return {
    search,
    setSearch,
    campaign,
    setCampaign,
    status,
    setStatus,
    activity,
    setActivity,
    quarter,
    periodYears,
    choosePeriod,
    month,
    setMonth,
    period,
    setPeriod,
    chosenScale,
    setChosenScale,
    filtered,
    filteredProjects,
    clearFilters,
  };
}
