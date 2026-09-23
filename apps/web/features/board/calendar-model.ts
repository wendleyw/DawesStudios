import { dateLabel, dateNumber, mondayOfDay } from "./timeline-model";

/** Calendar dates stay in UTC so browser timezone and DST never move a deadline. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${monthStart(month)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export function calendarDays(month: string): { date: string; inMonth: boolean }[] {
  const first = dateNumber(monthStart(month));
  const after = dateNumber(shiftMonth(month, 1));
  const start = mondayOfDay(first);
  const count = Math.ceil((after - start) / 7) * 7;
  return Array.from({ length: count }, (_, index) => ({
    date: dateLabel(start + index),
    inMonth: start + index >= first && start + index < after,
  }));
}

export function calendarMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(monthStart(month)));
}
