import { describe, expect, it } from "vitest";
import { dateLabel, dateNumber, mondayOf, timelineInterval } from "./timeline-model";

describe("project timeline", () => {
  const first = dateNumber("2026-09-14");
  it("starts Monday even when Today is a Sunday", () => {
    expect(dateLabel(mondayOf("2026-09-20"))).toBe("2026-09-14");
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
