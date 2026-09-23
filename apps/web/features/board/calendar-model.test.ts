import { describe, expect, it } from "vitest";
import { calendarDays, calendarMonthLabel, monthStart, shiftMonth } from "./calendar-model";

describe("calendar months", () => {
  it("includes leap day and whole Monday-to-Sunday weeks", () => {
    const days = calendarDays("2028-02-01");
    expect(days[0].date).toBe("2028-01-31");
    expect(days.at(-1)?.date).toBe("2028-03-05");
    expect(days.filter((day) => day.inMonth)).toHaveLength(29);
    expect(days.find((day) => day.date === "2028-02-29")?.inMonth).toBe(true);
  });

  it("uses six weeks for a month that ends on its sixth week", () => {
    const days = calendarDays("2026-03-01");
    expect(days).toHaveLength(42);
    expect(days[0].date).toBe("2026-02-23");
    expect(days.at(-1)?.date).toBe("2026-04-05");
    expect(days.filter((day) => day.inMonth)).toHaveLength(31);
  });

  it("moves across year boundaries without skipping short months", () => {
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(monthStart("2026-09-23")).toBe("2026-09-01");
    expect(calendarMonthLabel("2026-09-01")).toBe("September 2026");
  });
});
