const dayMilliseconds = 86_400_000;
export function dateNumber(date: string) {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / dayMilliseconds;
}
export function dateLabel(day: number) {
  return new Date(day * dayMilliseconds).toISOString().slice(0, 10);
}
/** The Monday on or before a day number. Every window of every scale starts on one. */
export function mondayOfDay(day: number) {
  return day - ((new Date(day * dayMilliseconds).getUTCDay() + 6) % 7);
}
export function mondayOf(date: string) {
  return mondayOfDay(dateNumber(date));
}

/**
 * How far a window reaches, and how much of it one column is worth.
 *
 * Planning is pinned to 880px in split mode, which leaves 624px of day tracks beside the 220px
 * label column. Reaching past a fortnight therefore has to buy the days with a coarser column
 * rather than with more columns: a day-labelled column stops being readable past roughly 21-24 of
 * them (44.6px each at 14 columns, 29.7px at 21, 20.8px at 30, 14.9px at 42).
 *
 * A window starts on a Monday and holds a whole number of columns, so paging by one window lands
 * on another Monday and never half-steps a column. That makes every span a multiple of both 7 and
 * its own column unit, which also fixes the weekend pattern in place from window to window:
 *
 * - Fortnight — 14 columns of 1 day = 14 days, 44.6px a column. Today's grid, unchanged.
 * - Month — 14 columns of 2 days = 28 days, 44.6px a column. A 2-day column forces the span to a
 *   multiple of 14 days, so the candidates either side of a calendar month are 4 weeks and 6 weeks;
 *   5 weeks would be 17.5 columns. 4 weeks keeps the fortnight's proven column width and its
 *   weekend rhythm (one Sat-Sun column per fortnight), where 6 weeks would drop to 29.7px and call
 *   a month and a half a month.
 * - Quarter — 13 columns of 1 week = 91 days, 48px a column. A week column is Monday-aligned by
 *   construction, and thirteen of them are exactly a quarter.
 */
const SCALE_TABLE = [
  { id: "fortnight", label: "Fortnight", unit: 1, columns: 14, heading: "day", caption: "weekday" },
  { id: "month", label: "Month", unit: 2, columns: 14, heading: "range", caption: "weekday" },
  { id: "quarter", label: "Quarter", unit: 7, columns: 13, heading: "day", caption: "month" },
] as const;

export type TimelineScale = (typeof SCALE_TABLE)[number]["id"];

export type TimelineScaleSpec = {
  id: TimelineScale;
  /** What the scale control prints on its button. */
  label: string;
  /** Days covered by one column. */
  unit: number;
  columns: number;
  /** Days covered by the whole window, which is `unit * columns`. */
  span: number;
  /** A column names its first day, or the range it covers when one day would misstate it. */
  heading: "day" | "range";
  /** The smaller line above the heading: the weekday, or the month where the month turns over. */
  caption: "weekday" | "month";
};

/** The scales in order, coarsening as they go, which is also the order the control offers them. */
export const timelineScales: readonly TimelineScaleSpec[] = SCALE_TABLE.map((scale) => ({
  ...scale,
  span: scale.unit * scale.columns,
}));

export function timelineScaleSpec(scale: TimelineScale): TimelineScaleSpec {
  return timelineScales.find((entry) => entry.id === scale) ?? timelineScales[0];
}

/** Days from the first column of a window to the last, for paging and for clipping bars. */
export function timelineScaleSpan(scale: TimelineScale): number {
  return timelineScaleSpec(scale).span;
}

// Every date this module prints is a calendar day — a grid column, or a start/due date sliced to
// its `YYYY-MM-DD` — and a calendar day is the same day in every timezone. They are read in UTC for
// the same reason `formatDate` reads a calendar date in UTC: the studio's timezone applies to
// instants, and applying it here would shift a column heading, and the bar under it, by a day.
const weekdayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthDayYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const dayOfMonth = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export type TimelineColumn = {
  /** Whole days since the epoch of the column's first day, which is the grid's column key. */
  day: number;
  /** The date the column starts on. */
  iso: string;
  /** Days the column covers: 1, 2 or 7. */
  days: number;
  /** The smaller line above the heading, empty where the scale has nothing to add. */
  caption: string;
  /** What the column head prints, e.g. `14`, `14–15`. */
  heading: string;
  /** True only when every day in the column is a Saturday or a Sunday. */
  weekend: boolean;
  /** True when today falls anywhere inside the column. */
  today: boolean;
};

/** A weekend column is one with no working day in it at all, so a week column never is one. */
function allWeekend(day: number, unit: number) {
  for (let offset = 0; offset < unit; offset += 1) {
    const weekday = new Date((day + offset) * dayMilliseconds).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return false;
  }
  return true;
}

function columnsOf(
  start: number,
  columns: number,
  unit: number,
  today: number,
  heading: TimelineScaleSpec["heading"],
  caption: TimelineScaleSpec["caption"],
): TimelineColumn[] {
  // Built in order, so a month caption can be dropped where it would only repeat the column before.
  let previousMonth = "";
  return Array.from({ length: columns }, (_, index) => {
    const day = start + index * unit;
    const iso = dateLabel(day);
    const last = dateLabel(day + unit - 1);
    const month = iso.slice(5, 7);
    const turnsMonth = month !== previousMonth;
    previousMonth = month;
    return {
      day,
      iso,
      days: unit,
      caption:
        caption === "weekday"
          ? weekdayFormat.format(new Date(iso))
          : turnsMonth
            ? monthFormat.format(new Date(iso))
            : "",
      heading:
        heading === "range" && unit > 1
          ? `${dayOfMonth.format(new Date(iso))}–${dayOfMonth.format(new Date(last))}`
          : dayOfMonth.format(new Date(iso)),
      weekend: allWeekend(day, unit),
      today: today >= day && today < day + unit,
    };
  });
}

/**
 * The columns of one window, resolved once per render.
 *
 * The grid asks the same questions of every cell in every lane, so the answers are computed here
 * instead of formatting a `Date` twice per cell inside the render. One entry is one *column*, not
 * one day: past the fortnight a column carries two days or a week of them.
 */
export function timelineColumns(
  start: number,
  scale: TimelineScale,
  today: number,
): TimelineColumn[] {
  const spec = timelineScaleSpec(scale);
  return columnsOf(start, spec.columns, spec.unit, today, spec.heading, spec.caption);
}

export type TimelineDay = {
  /** Whole days since the epoch, which is the grid's column key. */
  day: number;
  iso: string;
  /** Short weekday name, e.g. `Mon`. */
  weekday: string;
  /** Day of the month without a leading zero. */
  monthDay: string;
  weekend: boolean;
  today: boolean;
};

/**
 * One column per day, for callers still written against the day grid.
 *
 * Superseded by `timelineColumns`, which answers the same questions at any scale; a fortnight
 * column *is* a day, so this is that shape under the names the day grid uses.
 */
export function timelineDays(start: number, days: number, today: number): TimelineDay[] {
  return columnsOf(start, days, 1, today, "day", "weekday").map((column) => ({
    day: column.day,
    iso: column.iso,
    weekday: column.caption,
    monthDay: column.heading,
    weekend: column.weekend,
    today: column.today,
  }));
}

export type TimelineInterval = {
  /** The first column the bar covers, counted from the start of the window. */
  left: number;
  /** How many columns the bar covers, never fewer than one. */
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

/**
 * Where a project's dates land on the grid, in columns.
 *
 * A bar covers every column any of its days touch, so a piece of work is never invisible for
 * landing inside a coarse column, and the clipped ends still say that it runs past the frame.
 */
function intervalIn(
  start: string | null,
  due: string | null,
  periodStart: number,
  days: number,
  unit: number,
): TimelineInterval | null {
  if (!start && !due) return null;
  const first = dateNumber(start ?? due!);
  const last = dateNumber(due ?? start!);
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    last < first ||
    last < periodStart ||
    first >= periodStart + days
  )
    return null;
  const from = Math.max(first, periodStart) - periodStart;
  const to = Math.min(last, periodStart + days - 1) - periodStart;
  const left = Math.floor(from / unit);
  return {
    left,
    width: Math.floor(to / unit) - left + 1,
    clippedStart: first < periodStart,
    clippedEnd: last >= periodStart + days,
  };
}

/** The day grid's interval: one column is one day, so a column count is a day count. */
export function timelineInterval(
  start: string | null,
  due: string | null,
  periodStart: number,
  days: number,
) {
  return intervalIn(start, due, periodStart, days, 1);
}

/** The same interval measured in the columns of a scale, whatever a column is worth there. */
export function scaleInterval(
  start: string | null,
  due: string | null,
  periodStart: number,
  scale: TimelineScale,
) {
  const spec = timelineScaleSpec(scale);
  return intervalIn(start, due, periodStart, spec.span, spec.unit);
}

/**
 * The visible window, written as tightly as it still reads.
 *
 * The control sits in the calendar's own corner rather than on a row of its own, so the label drops
 * the parts both ends share: a fortnight inside one month is `Sep 14 – 27, 2026`, not
 * `Sep 14 – Sep 27, 2026`.
 */
export function periodLabel(start: number, days: number): string {
  const first = dateLabel(start);
  const last = dateLabel(start + Math.max(1, days) - 1);
  const from = new Date(first);
  const to = new Date(last);
  if (first === last) return monthDayYear.format(from);
  if (first.slice(0, 4) !== last.slice(0, 4))
    return `${monthDayYear.format(from)} – ${monthDayYear.format(to)}`;
  if (first.slice(0, 7) === last.slice(0, 7))
    return `${monthDay.format(from)} – ${dayOfMonth.format(to)}, ${first.slice(0, 4)}`;
  return `${monthDay.format(from)} – ${monthDayYear.format(to)}`;
}

/**
 * The window a scale is showing, named by its dates.
 *
 * A quarter needs no rule of its own: the same collapsing reads out as `Sep 14 – Dec 13, 2026`,
 * which says where the frame starts and ends. Naming it `Q4` would be false — the window is
 * thirteen weeks from whichever Monday the viewer paged to, not a calendar quarter.
 */
export function scalePeriodLabel(start: number, scale: TimelineScale): string {
  return periodLabel(start, timelineScaleSpan(scale));
}

/** A day written out in full, for the tooltip and accessible name of a bar. */
export function longDate(date: string): string {
  return fullDate.format(new Date(date.slice(0, 10)));
}

/**
 * When a project runs, spoken in full.
 *
 * A bar is a rectangle in a grid: the dates it covers are the one thing a screen reader cannot read
 * off it, so the accessible name says them rather than repeating the column headings.
 */
export function scheduleLabel(start: string | null, due: string | null): string {
  if (start && due)
    return start.slice(0, 10) === due.slice(0, 10)
      ? `on ${longDate(due)}`
      : `${longDate(start)} to ${longDate(due)}`;
  if (due) return `due ${longDate(due)}`;
  if (start) return `starts ${longDate(start)}`;
  return "no dates set";
}

export type ScheduledWork = { start_date: string | null; due_date: string | null };

/**
 * The scale to open on: the smallest one that can hold all of this work at once.
 *
 * Measured from the Monday the window would start on rather than from the first date, because a
 * window always begins on a Monday: work that runs Sep 20 to Oct 3 is a fortnight long but needs a
 * month, since the fortnight containing its start ends on Sep 27. Work no scale can hold falls back
 * to the largest, which shows the most of it. Undated work constrains nothing, so a board with no
 * dates at all opens on the closest view.
 */
export function smallestScaleFor(projects: readonly ScheduledWork[]): TimelineScale {
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const project of projects) {
    const start = project.start_date ?? project.due_date;
    const due = project.due_date ?? project.start_date;
    if (!start || !due) continue;
    const from = dateNumber(start);
    const to = dateNumber(due);
    // A reversed or unparseable range draws no bar either, so it constrains no scale.
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
    first = Math.min(first, from);
    last = Math.max(last, to);
  }
  if (first > last) return timelineScales[0].id;
  const needed = last - mondayOfDay(first) + 1;
  return (
    timelineScales.find((scale) => scale.span >= needed)?.id ??
    timelineScales[timelineScales.length - 1].id
  );
}

/** Project titles in this workspace are written as `Client / Work / Variant`. */
const TITLE_SEPARATOR = " / ";

/**
 * The leading segments most lanes in scope repeat, which therefore distinguish nothing.
 *
 * Seeded titles carry the client name (`SABRE / Social Post (Static)`) while the viewer is already
 * inside that client's workspace, so the repeated head is what pushes the distinguishing tail out
 * of a fixed label column. A prefix is shared when a strict majority of the lanes carry it: one
 * oddly named project — a lane called `T` — no longer switches the shortening off for every other
 * lane, and `distinctTitle` leaves that lane whole because it does not carry the prefix. The last
 * segment is never consumed, so a lane always keeps something to read.
 */
export function sharedTitlePrefix(titles: string[]): string {
  if (titles.length < 2) return "";
  const parts = titles.map((title) => title.split(TITLE_SEPARATOR));
  const longest = Math.max(...parts.map((segments) => segments.length));
  for (let length = longest - 1; length > 0; length -= 1) {
    const counts = new Map<string, number>();
    for (const segments of parts) {
      // A prefix that swallows a whole title would leave that lane nameless, so it is no candidate.
      if (segments.length <= length) continue;
      const candidate = segments.slice(0, length).join(TITLE_SEPARATOR);
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
    // Two prefixes of the same length are carried by disjoint sets of lanes, so at most one of them
    // can hold a majority: the first match is the longest shared prefix, not merely one of them.
    for (const [candidate, count] of counts) if (count * 2 > titles.length) return candidate;
  }
  return "";
}

/** The part of a title that is worth the lane's width; the full title stays the accessible name. */
export function distinctTitle(title: string, prefix: string): string {
  const head = prefix && `${prefix}${TITLE_SEPARATOR}`;
  return head && title.startsWith(head) ? title.slice(head.length) : title;
}
