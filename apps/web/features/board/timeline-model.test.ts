import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { projectStatusTones } from "@/features/workspace/workspace-data";
import { boardStatuses } from "./planning-view";
import {
  dateLabel,
  dateNumber,
  distinctTitle,
  mondayOf,
  mondayOfDay,
  periodLabel,
  scaleInterval,
  scalePeriodLabel,
  scalePointer,
  scheduleLabel,
  sharedTitlePrefix,
  shortDate,
  smallestScaleFor,
  timelineColumns,
  timelineDays,
  timelineInterval,
  timelineScales,
  timelineScaleSpan,
} from "./timeline-model";

const day = (date: string) => dateNumber(date);
const MONDAY = day("2026-09-14");
const TODAY = day("2026-09-20");

describe("project timeline", () => {
  const first = MONDAY;
  it("starts Monday even when Today is a Sunday", () => {
    expect(dateLabel(mondayOf("2026-09-20"))).toBe("2026-09-14");
    expect(dateLabel(mondayOfDay(day("2026-09-20")))).toBe("2026-09-14");
  });
  it("clips spanning projects to the visible period", () => {
    expect(timelineInterval("2026-09-10", "2026-10-01", first, 14)).toEqual({
      left: 0,
      width: 14,
      clippedStart: true,
      clippedEnd: true,
    });
  });
  it("includes both date boundaries and handles single-day deadlines", () => {
    expect(timelineInterval(null, "2026-09-27", first, 14)).toEqual({
      left: 13,
      width: 1,
      clippedStart: false,
      clippedEnd: false,
    });
  });
  it("omits dates outside the period, reversed ranges, and unscheduled work", () => {
    expect(timelineInterval("2026-09-28", null, first, 14)).toBeNull();
    expect(timelineInterval("2026-09-16", "2026-09-15", first, 14)).toBeNull();
    expect(timelineInterval(null, null, first, 14)).toBeNull();
  });
  it("advances across a leap day without local-time offsets", () => {
    expect(dateLabel(dateNumber("2028-02-28") + 2)).toBe("2028-03-01");
  });
});

describe("timeline scales", () => {
  it("offers three scales, coarsening in order", () => {
    expect(timelineScales.map((scale) => [scale.id, scale.label])).toEqual([
      ["fortnight", "Fortnight"],
      ["month", "Month"],
      ["quarter", "Quarter"],
    ]);
  });
  it("buys reach with a coarser column, not with more columns", () => {
    // 624px of day tracks: a column narrower than ~30px cannot carry a date, so the column count
    // stays inside the legible band while the unit grows.
    expect(timelineScales.map((scale) => [scale.unit, scale.columns, scale.span])).toEqual([
      [1, 14, 14],
      [2, 14, 28],
      [7, 13, 91],
    ]);
    for (const scale of timelineScales) expect(624 / scale.columns).toBeGreaterThan(30);
  });
  it("never half-steps a column when paging", () => {
    // A span that is a whole number of columns and of weeks lands the next window on a Monday with
    // its first column starting there, which also fixes the weekend pattern window to window.
    for (const scale of timelineScales) {
      expect(scale.span % scale.unit).toBe(0);
      expect(scale.span % 7).toBe(0);
      expect(dateLabel(mondayOfDay(MONDAY + scale.span))).toBe(dateLabel(MONDAY + scale.span));
    }
  });
  it("reports the span each scale pages by", () => {
    expect(timelineScaleSpan("fortnight")).toBe(14);
    expect(timelineScaleSpan("month")).toBe(28);
    expect(timelineScaleSpan("quarter")).toBe(91);
  });
});

describe("timeline columns", () => {
  it("resolves a fortnight one day at a time, marking weekends and today", () => {
    const columns = timelineColumns(MONDAY, "fortnight", TODAY);
    expect(columns).toHaveLength(14);
    expect(columns[0]).toEqual({
      day: MONDAY,
      iso: "2026-09-14",
      days: 1,
      caption: "Mon",
      heading: "14",
      weekend: false,
      today: false,
    });
    expect(columns.filter((column) => column.weekend).map((column) => column.iso)).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-09-26",
      "2026-09-27",
    ]);
    expect(columns.filter((column) => column.today).map((column) => column.iso)).toEqual([
      "2026-09-20",
    ]);
    expect(columns[13].iso).toBe("2026-09-27");
  });
  it("pairs days at month scale and names the range each column covers", () => {
    const columns = timelineColumns(MONDAY, "month", TODAY);
    expect(columns).toHaveLength(14);
    expect(columns[0]).toEqual({
      day: MONDAY,
      iso: "2026-09-14",
      days: 2,
      caption: "Mon",
      heading: "14–15",
      weekend: false,
      today: false,
    });
    expect(columns[13]).toEqual({
      day: day("2026-10-10"),
      iso: "2026-10-10",
      days: 2,
      caption: "Sat",
      heading: "10–11",
      weekend: true,
      today: false,
    });
    // The last column ends on the last day of the 28-day span.
    expect(dateLabel(columns[13].day + columns[13].days - 1)).toBe("2026-10-11");
    // A column that crosses a month says so by its own numbers.
    expect(columns[8].heading).toBe("30–1");
  });
  it("counts a month column as weekend only when it holds no working day", () => {
    const columns = timelineColumns(MONDAY, "month", TODAY);
    // Sat-Sun is the only all-weekend pairing of a Monday-aligned 2-day grid, once a fortnight.
    expect(columns.filter((column) => column.weekend).map((column) => column.iso)).toEqual([
      "2026-09-26",
      "2026-10-10",
    ]);
  });
  it("marks the month column that contains today, not only one that starts on it", () => {
    expect(
      timelineColumns(MONDAY, "month", TODAY)
        .filter((column) => column.today)
        .map((column) => column.iso),
    ).toEqual(["2026-09-20"]);
    expect(
      timelineColumns(MONDAY, "month", day("2026-09-21"))
        .filter((column) => column.today)
        .map((column) => column.iso),
    ).toEqual(["2026-09-20"]);
  });
  it("runs a quarter a week at a time, captioned where the month turns over", () => {
    const columns = timelineColumns(MONDAY, "quarter", TODAY);
    expect(columns).toHaveLength(13);
    expect(columns[0]).toEqual({
      day: MONDAY,
      iso: "2026-09-14",
      days: 7,
      caption: "Sep",
      heading: "14",
      weekend: false,
      today: true,
    });
    expect(columns.map((column) => column.iso)).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
      "2026-12-07",
    ]);
    expect(columns.map((column) => column.caption)).toEqual([
      "Sep",
      "",
      "",
      "Oct",
      "",
      "",
      "",
      "Nov",
      "",
      "",
      "",
      "",
      "Dec",
    ]);
    // A week always holds working days, so no week column is dimmed as a weekend.
    expect(columns.some((column) => column.weekend)).toBe(false);
    expect(dateLabel(columns[12].day + columns[12].days - 1)).toBe("2026-12-13");
  });
  it("marks no column when today falls outside the window", () => {
    expect(timelineColumns(MONDAY, "fortnight", day("2026-10-05")).some((c) => c.today)).toBe(
      false,
    );
    expect(timelineColumns(MONDAY, "month", day("2026-10-12")).some((c) => c.today)).toBe(false);
    expect(timelineColumns(MONDAY, "quarter", day("2026-12-14")).some((c) => c.today)).toBe(false);
  });
  it("still answers the day grid under its own names", () => {
    const days = timelineDays(MONDAY, 14, TODAY);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({
      day: MONDAY,
      iso: "2026-09-14",
      weekday: "Mon",
      monthDay: "14",
      weekend: false,
      today: false,
    });
    expect(days.filter((entry) => entry.today).map((entry) => entry.iso)).toEqual(["2026-09-20"]);
  });
});

describe("timeline intervals by scale", () => {
  it("leaves the fortnight exactly as the day grid drew it", () => {
    for (const [start, due] of [
      ["2026-09-10", "2026-10-01"],
      [null, "2026-09-27"],
      ["2026-09-20", "2026-09-20"],
      ["2026-09-28", null],
      [null, null],
    ] as [string | null, string | null][])
      expect(scaleInterval(start, due, MONDAY, "fortnight")).toEqual(
        timelineInterval(start, due, MONDAY, 14),
      );
  });
  it("rounds a month bar out to the columns its days touch", () => {
    // Sep 20 is the fourth 2-day column (offset 6) and Oct 3 the tenth (offset 19).
    expect(scaleInterval("2026-09-20", "2026-10-03", MONDAY, "month")).toEqual({
      left: 3,
      width: 7,
      clippedStart: false,
      clippedEnd: false,
    });
    // A single day still owns the whole column it lands in.
    expect(scaleInterval(null, "2026-09-21", MONDAY, "month")).toEqual({
      left: 3,
      width: 1,
      clippedStart: false,
      clippedEnd: false,
    });
  });
  it("clips a month bar at both ends without losing the whole span", () => {
    expect(scaleInterval("2026-09-10", "2026-11-20", MONDAY, "month")).toEqual({
      left: 0,
      width: 14,
      clippedStart: true,
      clippedEnd: true,
    });
  });
  it("fits a 61-day campaign into nine week columns", () => {
    const campaignStart = mondayOf("2026-09-01");
    expect(dateLabel(campaignStart)).toBe("2026-08-31");
    expect(scaleInterval("2026-09-01", "2026-10-31", campaignStart, "quarter")).toEqual({
      left: 0,
      width: 9,
      clippedStart: false,
      clippedEnd: false,
    });
  });
  it("holds the longest seeded project inside one quarter", () => {
    // Sep 20 to Nov 20 is the widest project on the board and needs no clipping at quarter scale.
    expect(scaleInterval("2026-09-20", "2026-11-20", MONDAY, "quarter")).toEqual({
      left: 0,
      width: 10,
      clippedStart: false,
      clippedEnd: false,
    });
  });
  it("clips a quarter bar the day it passes the last column", () => {
    expect(scaleInterval("2026-09-20", "2026-12-13", MONDAY, "quarter")).toEqual({
      left: 0,
      width: 13,
      clippedStart: false,
      clippedEnd: false,
    });
    expect(scaleInterval("2026-09-20", "2026-12-14", MONDAY, "quarter")).toEqual({
      left: 0,
      width: 13,
      clippedStart: false,
      clippedEnd: true,
    });
  });
  it("omits work outside the window, reversed ranges, and unscheduled work at every scale", () => {
    for (const scale of timelineScales.map((entry) => entry.id)) {
      expect(scaleInterval("2027-01-04", null, MONDAY, scale)).toBeNull();
      expect(scaleInterval("2026-09-16", "2026-09-15", MONDAY, scale)).toBeNull();
      expect(scaleInterval(null, null, MONDAY, scale)).toBeNull();
      expect(scaleInterval(null, "2026-09-13", MONDAY, scale)).toBeNull();
    }
  });
});

describe("period label", () => {
  it("drops the repeated month inside a single month", () => {
    expect(periodLabel(MONDAY, 14)).toBe("Sep 14 – 27, 2026");
  });
  it("names both months when the window crosses one", () => {
    expect(periodLabel(dateNumber("2026-09-28"), 14)).toBe("Sep 28 – Oct 11, 2026");
  });
  it("names both years when the window crosses one", () => {
    expect(periodLabel(dateNumber("2026-12-28"), 14)).toBe("Dec 28, 2026 – Jan 10, 2027");
  });
  it("reads a one-day window as a single date", () => {
    expect(periodLabel(MONDAY, 1)).toBe("Sep 14, 2026");
  });
  it("names the window of each scale by its own dates", () => {
    expect(scalePeriodLabel(MONDAY, "fortnight")).toBe("Sep 14 – 27, 2026");
    expect(scalePeriodLabel(MONDAY, "month")).toBe("Sep 14 – Oct 11, 2026");
    expect(scalePeriodLabel(MONDAY, "quarter")).toBe("Sep 14 – Dec 13, 2026");
  });
});

describe("opening scale", () => {
  const work = (start_date: string | null, due_date: string | null) => ({ start_date, due_date });
  it("opens on the fortnight when a fortnight holds the work", () => {
    expect(smallestScaleFor([work("2026-09-14", "2026-09-27")])).toBe("fortnight");
  });
  it("measures from the Monday the window starts on, not from the first date", () => {
    // Sep 20 to Oct 3 is fourteen days of work, but the fortnight containing Sep 20 ends Sep 27.
    expect(smallestScaleFor([work("2026-09-20", "2026-10-03")])).toBe("month");
  });
  it("opens the seeded board on the quarter, where every project is visible", () => {
    const projects = [
      work("2026-09-20", "2026-10-03"),
      work("2026-09-20", "2026-10-19"),
      work("2026-09-20", "2026-11-20"),
    ];
    expect(smallestScaleFor(projects)).toBe("quarter");
    const interval = scaleInterval("2026-09-20", "2026-11-20", mondayOf("2026-09-20"), "quarter");
    expect(interval?.clippedEnd).toBe(false);
  });
  it("falls back to the largest scale when nothing holds the work", () => {
    expect(smallestScaleFor([work("2026-09-20", "2027-03-01")])).toBe("quarter");
  });
  it("is not pushed by work that draws no bar", () => {
    expect(smallestScaleFor([work(null, null), work("2026-09-14", "2026-09-27")])).toBe(
      "fortnight",
    );
    expect(smallestScaleFor([work("2027-06-01", "2026-09-15")])).toBe("fortnight");
    expect(smallestScaleFor([])).toBe("fortnight");
  });
  it("reads an open-ended project by the one date it has", () => {
    expect(smallestScaleFor([work(null, "2026-11-20"), work("2026-09-20", null)])).toBe("quarter");
  });
});

describe("lane titles", () => {
  it("drops the leading segments every lane repeats", () => {
    const titles = ["Acme / AI-Enhanced Add-On", "Acme / Blog Design / Infographic"];
    const prefix = sharedTitlePrefix(titles);
    expect(prefix).toBe("Acme");
    expect(titles.map((title) => distinctTitle(title, prefix))).toEqual([
      "AI-Enhanced Add-On",
      "Blog Design / Infographic",
    ]);
  });
  it("drops every shared segment, not only the first", () => {
    expect(sharedTitlePrefix(["Acme / Fall / Poster", "Acme / Fall / Banner"])).toBe("Acme / Fall");
  });
  it("keeps titles that share nothing, and never consumes a whole title", () => {
    expect(sharedTitlePrefix(["Acme / Poster", "Vela / Poster"])).toBe("");
    expect(sharedTitlePrefix(["Acme", "Acme"])).toBe("");
    expect(sharedTitlePrefix(["Acme / Poster", "Acme"])).toBe("");
  });
  it("infers nothing from a single lane, which repeats nothing", () => {
    expect(sharedTitlePrefix(["Acme / Poster"])).toBe("");
    expect(sharedTitlePrefix([])).toBe("");
  });
  it("shortens the majority even when one lane is named nothing like the rest", () => {
    // A hand-made project called `T` used to switch the shortening off for the whole board.
    const titles = ["Acme / AI-Enhanced Add-On", "Acme / Blog Design / Infographic", "T"];
    const prefix = sharedTitlePrefix(titles);
    expect(prefix).toBe("Acme");
    expect(titles.map((title) => distinctTitle(title, prefix))).toEqual([
      "AI-Enhanced Add-On",
      "Blog Design / Infographic",
      "T",
    ]);
  });
  it("keeps the deepest prefix the majority carries", () => {
    expect(sharedTitlePrefix(["Acme / Fall / Poster", "Acme / Fall / Banner", "T"])).toBe(
      "Acme / Fall",
    );
    // Two of the three lanes agree as far as `Fall`, so the third simply keeps its own campaign.
    const titles = ["Acme / Fall / Poster", "Acme / Fall / Banner", "Acme / Spring / Banner"];
    const prefix = sharedTitlePrefix(titles);
    expect(prefix).toBe("Acme / Fall");
    expect(titles.map((title) => distinctTitle(title, prefix))).toEqual([
      "Poster",
      "Banner",
      "Acme / Spring / Banner",
    ]);
  });
  it("shortens nothing when no prefix has a majority", () => {
    expect(
      sharedTitlePrefix(["Acme / Poster", "Acme / Banner", "Vela / Poster", "Vela / Banner"]),
    ).toBe("");
    // Half of four lanes is not a majority, and the odd lane out cannot make one.
    expect(sharedTitlePrefix(["Acme / Poster", "Acme / Banner", "Vela / Poster", "T"])).toBe("");
  });
  it("leaves a title alone when it does not carry the prefix", () => {
    expect(distinctTitle("Vela / Poster", "Acme")).toBe("Vela / Poster");
    expect(distinctTitle("Acme / Poster", "")).toBe("Acme / Poster");
    // A prefix that is only a substring of the first segment is not a segment boundary.
    expect(distinctTitle("Acmex / Poster", "Acme")).toBe("Acmex / Poster");
    expect(distinctTitle("T", "Acme")).toBe("T");
  });
});

describe("schedule label", () => {
  it("speaks a range, a single day, and each open end", () => {
    expect(scheduleLabel("2026-09-14", "2026-09-25")).toBe(
      "Monday, September 14, 2026 to Friday, September 25, 2026",
    );
    expect(scheduleLabel("2026-09-14", "2026-09-14")).toBe("on Monday, September 14, 2026");
    expect(scheduleLabel(null, "2026-09-25")).toBe("due Friday, September 25, 2026");
    expect(scheduleLabel("2026-09-14", null)).toBe("starts Monday, September 14, 2026");
    expect(scheduleLabel(null, null)).toBe("no dates set");
  });
});

describe("short date", () => {
  it("prints the month and day the period label uses, with no year", () => {
    expect(shortDate("2026-08-03")).toBe("Aug 3");
    expect(shortDate("2026-12-04")).toBe("Dec 4");
  });
});

describe("out-of-window pointer", () => {
  const span = timelineScaleSpan("fortnight");
  it("points at the due date when work is entirely before the window", () => {
    expect(scalePointer(null, "2026-08-03", MONDAY, "fortnight")).toEqual({
      direction: "before",
      date: "2026-08-03",
      kind: "due",
      jumpTo: mondayOf("2026-08-03"),
    });
  });
  it("points at the start date when only a start date exists before the window", () => {
    expect(scalePointer("2026-08-03", null, MONDAY, "fortnight")).toEqual({
      direction: "before",
      date: "2026-08-03",
      kind: "started",
      jumpTo: mondayOf("2026-08-03"),
    });
  });
  it("prefers the due date — the last known date — when both dates fall before the window", () => {
    expect(scalePointer("2026-08-01", "2026-08-03", MONDAY, "fortnight")).toEqual({
      direction: "before",
      date: "2026-08-03",
      kind: "due",
      jumpTo: mondayOf("2026-08-01"),
    });
  });
  it("points at the start date when work is entirely after the window", () => {
    expect(scalePointer("2026-12-04", null, MONDAY, "fortnight")).toEqual({
      direction: "after",
      date: "2026-12-04",
      kind: "starts",
      jumpTo: mondayOf("2026-12-04"),
    });
  });
  it("points at the due date when only a due date exists after the window", () => {
    expect(scalePointer(null, "2026-12-04", MONDAY, "fortnight")).toEqual({
      direction: "after",
      date: "2026-12-04",
      kind: "due",
      jumpTo: mondayOf("2026-12-04"),
    });
  });
  it("prefers the start date — the first known date — when both dates fall after the window", () => {
    expect(scalePointer("2026-12-04", "2026-12-10", MONDAY, "fortnight")).toEqual({
      direction: "after",
      date: "2026-12-04",
      kind: "starts",
      jumpTo: mondayOf("2026-12-04"),
    });
  });
  it("treats the window's own edges as overlap, not before or after", () => {
    expect(scalePointer(null, dateLabel(MONDAY), MONDAY, "fortnight")).toBeNull();
    expect(scalePointer(dateLabel(MONDAY + span - 1), null, MONDAY, "fortnight")).toBeNull();
    expect(scalePointer(dateLabel(MONDAY + span), null, MONDAY, "fortnight")).toEqual({
      direction: "after",
      date: dateLabel(MONDAY + span),
      kind: "starts",
      jumpTo: mondayOfDay(MONDAY + span),
    });
    expect(scalePointer(null, dateLabel(MONDAY - 1), MONDAY, "fortnight")).toEqual({
      direction: "before",
      date: dateLabel(MONDAY - 1),
      kind: "due",
      jumpTo: mondayOfDay(MONDAY - 1),
    });
  });
  it("judges after by the scale's own span, not the fortnight's", () => {
    // Nov 20 sits inside a fortnight-scale window starting the same Monday, but well inside a
    // quarter that starts there too, so the two scales disagree about the same date.
    expect(scalePointer("2026-11-20", null, MONDAY, "fortnight")).not.toBeNull();
    expect(scalePointer("2026-11-20", null, MONDAY, "quarter")).toBeNull();
  });
  it("returns null for work that overlaps the window at any scale", () => {
    for (const scale of timelineScales.map((entry) => entry.id)) {
      expect(scalePointer("2026-09-10", "2026-10-01", MONDAY, scale)).toBeNull();
      expect(scalePointer("2026-09-20", "2026-09-20", MONDAY, scale)).toBeNull();
    }
  });
  it("returns null for undated work and for a reversed range", () => {
    expect(scalePointer(null, null, MONDAY, "fortnight")).toBeNull();
    expect(scalePointer("2026-09-16", "2026-09-15", MONDAY, "fortnight")).toBeNull();
  });
});

describe("bar status vocabulary", () => {
  // Resolved from the module path rather than `new URL(..., import.meta.url)`, which the bundler
  // rewrites into an asset request.
  const stylesheet = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "timeline.css"),
    "utf8",
  );
  it("gives every board status's tone its own bar treatment", () => {
    // A tone without a bar rule would fall back to the shared tint and read as a different stage,
    // so the stylesheet is held to the tones of the statuses the Kanban columns use.
    for (const status of boardStatuses)
      expect(stylesheet).toContain(`.timeline-project-bar.tone-${projectStatusTones[status]} {`);
  });
  it("keeps the calendar out of the application stylesheet's `.timeline-row`", () => {
    // A shared class name silently handed the calendar that rule's padding and its vertical
    // connector pseudo-element, which is the stray line this frame used to draw between lanes.
    const rules = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toContain(".timeline-row");
  });
});
