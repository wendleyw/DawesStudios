import { describe, expect, it } from "vitest";
import { periodStart, projectInPeriod } from "./board-period";

describe("board quarter filter", () => {
  it.each([
    ["2026-Q1", "2026-01-01"],
    ["2026-Q4", "2026-10-01"],
    ["2026-Q5", null],
    ["", null],
  ])("resolves %s to its first day", (period, date) => {
    expect(periodStart(period)).toBe(date);
  });

  it.each([
    [null, "2026-03-31", "2026-Q1", true],
    [null, "2026-04-01", "2026-Q1", false],
    ["2025-12-20", "2026-04-10", "2026-Q1", true],
    ["2026-01-01", "2026-06-30", "2026-Q2", true],
    ["2026-07-01", null, "2026-Q2", false],
    ["2026-07-01", null, "2026-Q3", true],
    [null, null, "2026-Q3", true],
    [null, "2025-10-01", "", true],
  ] as const)("checks date overlap (%s, %s, %s)", (start_date, due_date, period, expected) => {
    expect(projectInPeriod({ start_date, due_date }, period)).toBe(expected);
  });
});
